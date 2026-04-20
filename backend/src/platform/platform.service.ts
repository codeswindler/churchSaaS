import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { buildChurchIntegrationSummary } from '../common/church.utils';
import { ContributionsService } from '../contributions/contributions.service';
import { Church, ChurchStatus } from '../entities/church.entity';
import { ChurchUser, ChurchUserRole } from '../entities/church-user.entity';
import {
  Contribution,
  ContributionStatus,
} from '../entities/contribution.entity';
import { FundAccount } from '../entities/fund-account.entity';
import {
  PlatformUser,
  PlatformUserRole,
} from '../entities/platform-user.entity';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';

@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(PlatformUser)
    private readonly platformUserRepo: Repository<PlatformUser>,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(ChurchUser)
    private readonly churchUserRepo: Repository<ChurchUser>,
    @InjectRepository(Contribution)
    private readonly contributionRepo: Repository<Contribution>,
    @InjectRepository(FundAccount)
    private readonly fundAccountRepo: Repository<FundAccount>,
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
    private readonly contributionsService: ContributionsService,
  ) {}

  async createPlatformUser(body: any) {
    if (!body.email || !body.password || !body.name) {
      throw new BadRequestException('Name, email, and password are required');
    }

    const existing = await this.platformUserRepo.findOne({
      where: [
        { email: body.email.toLowerCase() },
        { username: body.username || '' },
        { phone: body.phone || '' },
      ],
    });
    if (existing) {
      throw new BadRequestException('Platform user already exists');
    }

    const user = this.platformUserRepo.create({
      name: body.name,
      email: body.email.toLowerCase(),
      username: body.username || null,
      phone: body.phone || null,
      passwordHash: await bcrypt.hash(body.password, 10),
      role: PlatformUserRole.PLATFORM_ADMIN,
      isActive: true,
    });

    const saved = await this.platformUserRepo.save(user);
    const { passwordHash: _, ...result } = saved;
    return result;
  }

  async listPlatformUsers() {
    const users = await this.platformUserRepo.find({
      order: { createdAt: 'DESC' },
    });
    return users.map(({ passwordHash, ...user }) => user);
  }

  async createChurch(body: any, performedByPlatformUserId: string) {
    if (
      !body.name ||
      !body.adminName ||
      !body.adminEmail ||
      !body.adminPassword
    ) {
      throw new BadRequestException(
        'Church name and initial church admin credentials are required',
      );
    }

    const baseSlug = this.slugify(body.slug || body.name);
    const slug = await this.resolveUniqueChurchSlug(baseSlug);

    const church = await this.churchRepo.save(
      this.churchRepo.create({
        name: body.name,
        slug,
        contactEmail: body.contactEmail || body.adminEmail.toLowerCase(),
        contactPhone: body.contactPhone || null,
        address: body.address || null,
        logoUrl: body.logoUrl || null,
        notes: body.notes || null,
        smsPartnerId: this.normalizeOptionalText(body.smsPartnerId),
        smsApiKey: this.normalizeOptionalText(body.smsApiKey),
        smsShortcode: this.normalizeOptionalText(body.smsShortcode),
        smsBaseUrl: this.normalizeOptionalText(body.smsBaseUrl),
        mpesaEnvironment:
          this.normalizeOptionalText(body.mpesaEnvironment) || 'sandbox',
        mpesaConsumerKey: this.normalizeOptionalText(body.mpesaConsumerKey),
        mpesaConsumerSecret: this.normalizeOptionalText(
          body.mpesaConsumerSecret,
        ),
        mpesaPasskey: this.normalizeOptionalText(body.mpesaPasskey),
        mpesaShortcode: this.normalizeOptionalText(body.mpesaShortcode),
        mpesaCallbackUrl: this.normalizeOptionalText(body.mpesaCallbackUrl),
        status: ChurchStatus.ACTIVE,
      }),
    );

    const adminUser = await this.churchUserRepo.save(
      this.churchUserRepo.create({
        churchId: church.id,
        name: body.adminName,
        email: body.adminEmail.toLowerCase(),
        username: body.adminUsername || null,
        phone: body.adminPhone || null,
        passwordHash: await bcrypt.hash(body.adminPassword, 10),
        role: ChurchUserRole.CHURCH_ADMIN,
        isActive: true,
      }),
    );

    await this.churchSubscriptionsService.initializeSubscription(
      church.id,
      Number(body.initialSubscriptionDays || 30),
      performedByPlatformUserId,
      body.planName || 'Standard Plan',
    );

    if (body.seedDefaultFundAccounts !== false) {
      await this.seedDefaultFundAccounts(church.id);
    }

    return {
      church,
      adminUser: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
      },
      subscription:
        await this.churchSubscriptionsService.getChurchSubscriptionStatus(
          church.id,
        ),
    };
  }

  async listChurches() {
    const churches = await this.churchRepo.find({
      relations: ['users'],
      order: { createdAt: 'DESC' },
    });

    const snapshots =
      await this.churchSubscriptionsService.getAllChurchSnapshots();
    const subscriptionByChurchId = new Map(
      snapshots.map((item) => [item.church.id, item]),
    );

    const confirmedTotals = await this.contributionRepo
      .createQueryBuilder('contribution')
      .select('contribution.churchId', 'churchId')
      .addSelect('SUM(contribution.amount)', 'total')
      .addSelect('COUNT(contribution.id)', 'count')
      .where('contribution.status = :status', {
        status: ContributionStatus.CONFIRMED,
      })
      .groupBy('contribution.churchId')
      .getRawMany();

    const totalsByChurchId = new Map(
      confirmedTotals.map((item) => [
        item.churchId,
        { total: Number(item.total || 0), count: Number(item.count || 0) },
      ]),
    );

    return churches.map((church) => ({
      id: church.id,
      name: church.name,
      slug: church.slug,
      contactEmail: church.contactEmail,
      contactPhone: church.contactPhone,
      address: church.address,
      logoUrl: church.logoUrl,
      notes: church.notes,
      status: church.status,
      createdAt: church.createdAt,
      updatedAt: church.updatedAt,
      userCount: church.users?.length || 0,
      subscription: subscriptionByChurchId.get(church.id) || null,
      integrations: buildChurchIntegrationSummary(church),
      contributionTotals: totalsByChurchId.get(church.id) || {
        total: 0,
        count: 0,
      },
    }));
  }

  async getChurchDetails(churchId: string) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new BadRequestException('Church not found');
    }

    return {
      id: church.id,
      name: church.name,
      slug: church.slug,
      contactEmail: church.contactEmail,
      contactPhone: church.contactPhone,
      address: church.address,
      logoUrl: church.logoUrl,
      notes: church.notes,
      status: church.status,
      smsPartnerId: church.smsPartnerId,
      smsApiKey: church.smsApiKey,
      smsShortcode: church.smsShortcode,
      smsBaseUrl: church.smsBaseUrl,
      mpesaEnvironment: church.mpesaEnvironment || 'sandbox',
      mpesaConsumerKey: church.mpesaConsumerKey,
      mpesaConsumerSecret: church.mpesaConsumerSecret,
      mpesaPasskey: church.mpesaPasskey,
      mpesaShortcode: church.mpesaShortcode,
      mpesaCallbackUrl: church.mpesaCallbackUrl,
      integrations: buildChurchIntegrationSummary(church),
    };
  }

  async updateChurch(churchId: string, body: any) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new BadRequestException('Church not found');
    }

    if (body.name !== undefined) {
      const name = this.normalizeOptionalText(body.name);
      if (!name) {
        throw new BadRequestException('Church name is required');
      }
      church.name = name;
    }

    if (body.slug !== undefined) {
      const requestedSlug =
        this.normalizeOptionalText(body.slug) || church.name;
      const nextSlug = this.slugify(requestedSlug);
      if (nextSlug !== church.slug) {
        church.slug = await this.resolveUniqueChurchSlug(nextSlug, church.id);
      }
    }

    if (body.contactEmail !== undefined) {
      church.contactEmail =
        this.normalizeOptionalEmail(body.contactEmail) || null;
    }

    if (body.contactPhone !== undefined) {
      church.contactPhone = this.normalizeOptionalText(body.contactPhone);
    }

    if (body.address !== undefined) {
      church.address = this.normalizeOptionalText(body.address);
    }

    if (body.logoUrl !== undefined) {
      church.logoUrl = this.normalizeOptionalText(body.logoUrl);
    }

    if (body.notes !== undefined) {
      church.notes = this.normalizeOptionalText(body.notes);
    }

    if (body.status !== undefined) {
      church.status =
        body.status === ChurchStatus.INACTIVE
          ? ChurchStatus.INACTIVE
          : ChurchStatus.ACTIVE;
    }

    if (body.smsPartnerId !== undefined) {
      church.smsPartnerId = this.normalizeOptionalText(body.smsPartnerId);
    }
    if (body.smsApiKey !== undefined) {
      church.smsApiKey = this.normalizeOptionalText(body.smsApiKey);
    }
    if (body.smsShortcode !== undefined) {
      church.smsShortcode = this.normalizeOptionalText(body.smsShortcode);
    }
    if (body.smsBaseUrl !== undefined) {
      church.smsBaseUrl = this.normalizeOptionalText(body.smsBaseUrl);
    }
    if (body.mpesaEnvironment !== undefined) {
      church.mpesaEnvironment =
        this.normalizeOptionalText(body.mpesaEnvironment) || 'sandbox';
    }
    if (body.mpesaConsumerKey !== undefined) {
      church.mpesaConsumerKey = this.normalizeOptionalText(
        body.mpesaConsumerKey,
      );
    }
    if (body.mpesaConsumerSecret !== undefined) {
      church.mpesaConsumerSecret = this.normalizeOptionalText(
        body.mpesaConsumerSecret,
      );
    }
    if (body.mpesaPasskey !== undefined) {
      church.mpesaPasskey = this.normalizeOptionalText(body.mpesaPasskey);
    }
    if (body.mpesaShortcode !== undefined) {
      church.mpesaShortcode = this.normalizeOptionalText(body.mpesaShortcode);
    }
    if (body.mpesaCallbackUrl !== undefined) {
      church.mpesaCallbackUrl = this.normalizeOptionalText(
        body.mpesaCallbackUrl,
      );
    }

    const saved = await this.churchRepo.save(church);
    return {
      ...this.buildChurchSummary(saved),
      integrations: buildChurchIntegrationSummary(saved),
    };
  }

  async getDashboardSummary() {
    const churches = await this.listChurches();
    const totalConfirmed = await this.contributionRepo
      .createQueryBuilder('contribution')
      .select('SUM(contribution.amount)', 'total')
      .where('contribution.status = :status', {
        status: ContributionStatus.CONFIRMED,
      })
      .getRawOne();

    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);
    const last30Summary = await this.contributionRepo
      .createQueryBuilder('contribution')
      .select('SUM(contribution.amount)', 'total')
      .where('contribution.status = :status', {
        status: ContributionStatus.CONFIRMED,
      })
      .andWhere('contribution.receivedAt >= :from', { from: last30Days })
      .getRawOne();

    const statusCounts = churches.reduce(
      (acc, church) => {
        const status = church.subscription?.status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const expiringSoon = churches
      .filter((church) => {
        const totalMs = church.subscription?.countdown?.totalMs || 0;
        return totalMs > 0 && totalMs <= 7 * 24 * 60 * 60 * 1000;
      })
      .slice(0, 8);

    return {
      totals: {
        churches: churches.length,
        activeChurches: statusCounts.active || 0,
        graceChurches: statusCounts.grace || 0,
        suspendedChurches: statusCounts.suspended || 0,
        totalCollections: Number(totalConfirmed?.total || 0),
        last30DayCollections: Number(last30Summary?.total || 0),
      },
      expiringSoon,
      recentChurches: churches.slice(0, 5),
      churches,
    };
  }

  async getChurchSubscriptionHistory(churchId: string) {
    return this.churchSubscriptionsService.getSubscriptionHistory(churchId);
  }

  async addSubscriptionDays(
    churchId: string,
    days: number,
    platformUserId: string,
    reason?: string,
  ) {
    return this.churchSubscriptionsService.addDays(
      churchId,
      days,
      platformUserId,
      reason,
    );
  }

  async subtractSubscriptionDays(
    churchId: string,
    days: number,
    platformUserId: string,
    reason?: string,
  ) {
    return this.churchSubscriptionsService.subtractDays(
      churchId,
      days,
      platformUserId,
      reason,
    );
  }

  async suspendChurchSubscription(
    churchId: string,
    platformUserId: string,
    reason?: string,
  ) {
    return this.churchSubscriptionsService.suspend(
      churchId,
      platformUserId,
      reason,
    );
  }

  async reactivateChurchSubscription(
    churchId: string,
    days: number,
    platformUserId: string,
    reason?: string,
  ) {
    return this.churchSubscriptionsService.reactivate(
      churchId,
      days,
      platformUserId,
      reason,
    );
  }

  private async seedDefaultFundAccounts(churchId: string) {
    const templates = [
      {
        name: 'Tithe',
        code: 'tithe',
        description: 'Regular tithe contributions',
      },
      {
        name: 'Offering',
        code: 'offering',
        description: 'General church offering',
      },
      {
        name: 'Harambee',
        code: 'harambee',
        description: 'Special fundraising support',
      },
    ];

    for (let index = 0; index < templates.length; index += 1) {
      const template = templates[index];
      const exists = await this.fundAccountRepo.findOne({
        where: { churchId, code: template.code },
      });
      if (exists) {
        continue;
      }

      await this.fundAccountRepo.save(
        this.fundAccountRepo.create({
          churchId,
          name: template.name,
          code: template.code,
          description: template.description,
          displayOrder: index + 1,
          isActive: true,
          receiptTemplate:
            'Dear {name}, we confirm receipt of KES {amount} towards {account} on {date}. Ref: {reference}. Thank you for supporting the ministry.',
        }),
      );
    }
  }

  private async resolveUniqueChurchSlug(
    baseSlug: string,
    excludeChurchId: string | null = null,
  ) {
    let candidate = baseSlug;
    let counter = 1;
    // Keep church slugs unique across tenants even after edits.
    while (true) {
      const existing = await this.churchRepo.findOne({
        where: { slug: candidate },
      });
      if (!existing || existing.id === excludeChurchId) {
        return candidate;
      }
      candidate = `${baseSlug}-${counter}`;
      counter += 1;
    }
  }

  private slugify(value: string) {
    const slug = `${value || ''}`
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) {
      throw new BadRequestException('Unable to generate church slug');
    }

    return slug;
  }

  private buildChurchSummary(church: Church) {
    return {
      id: church.id,
      name: church.name,
      slug: church.slug,
      contactEmail: church.contactEmail,
      contactPhone: church.contactPhone,
      address: church.address,
      logoUrl: church.logoUrl,
      notes: church.notes,
      status: church.status,
      createdAt: church.createdAt,
      updatedAt: church.updatedAt,
    };
  }

  private normalizeOptionalText(value: unknown) {
    if (value === undefined || value === null) {
      return null;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return `${value}`.trim() || null;
    }

    throw new BadRequestException('Invalid text value');
  }

  private normalizeOptionalEmail(value: unknown) {
    const normalized = this.normalizeOptionalText(value)?.toLowerCase() || null;
    if (normalized && !normalized.includes('@')) {
      throw new BadRequestException('A valid contact email is required');
    }
    return normalized;
  }
}
