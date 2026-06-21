import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';
import { buildChurchIntegrationSummary } from '../common/church.utils';
import { getDefaultReceiptTemplateForFundCode } from '../common/receipt-templates';
import {
  ChurchPermission,
  DEFAULT_CHURCH_FEATURES,
  PERMISSION_FEATURE_MAP,
  PRIEST_ONLY_CHURCH_PERMISSIONS,
  normalizeChurchRole,
  normalizeFeatureList,
  resolveChurchPermissions,
} from '../common/access-control';
import { ContributionsService } from '../contributions/contributions.service';
import {
  Church,
  ChurchBillingModel,
  ChurchStatus,
} from '../entities/church.entity';
import { ChurchSmsSender } from '../entities/church-sms-sender.entity';
import { ChurchUser, ChurchUserRole } from '../entities/church-user.entity';
import { ClientEnquiry } from '../entities/client-enquiry.entity';
import {
  Contribution,
  ContributionChannel,
  ContributionSourceType,
  ContributionStatus,
} from '../entities/contribution.entity';
import { FundAccount } from '../entities/fund-account.entity';
import {
  PLATFORM_SMS_CONFIG_ID,
  PlatformSmsConfig,
} from '../entities/platform-sms-config.entity';
import {
  PlatformUser,
  PlatformUserRole,
} from '../entities/platform-user.entity';
import {
  SmsMessageType,
  SmsOutbox,
  SmsSendStatus,
} from '../entities/sms-outbox.entity';
import { SmsSender } from '../entities/sms-sender.entity';
import {
  SmsUnitPurchase,
  SmsUnitPurchaseStatus,
} from '../entities/sms-unit-purchase.entity';
import { SmsService } from '../sms/sms.service';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';

@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(PlatformUser)
    private readonly platformUserRepo: Repository<PlatformUser>,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(ChurchSmsSender)
    private readonly churchSmsSenderRepo: Repository<ChurchSmsSender>,
    @InjectRepository(ChurchUser)
    private readonly churchUserRepo: Repository<ChurchUser>,
    @InjectRepository(Contribution)
    private readonly contributionRepo: Repository<Contribution>,
    @InjectRepository(FundAccount)
    private readonly fundAccountRepo: Repository<FundAccount>,
    @InjectRepository(ClientEnquiry)
    private readonly clientEnquiryRepo: Repository<ClientEnquiry>,
    @InjectRepository(SmsOutbox)
    private readonly smsOutboxRepo: Repository<SmsOutbox>,
    @InjectRepository(SmsSender)
    private readonly smsSenderRepo: Repository<SmsSender>,
    @InjectRepository(SmsUnitPurchase)
    private readonly smsUnitPurchaseRepo: Repository<SmsUnitPurchase>,
    @InjectRepository(PlatformSmsConfig)
    private readonly platformSmsConfigRepo: Repository<PlatformSmsConfig>,
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
    private readonly contributionsService: ContributionsService,
    private readonly smsService: SmsService,
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

  async listClientEnquiries() {
    const enquiries = await this.clientEnquiryRepo.find({
      order: { createdAt: 'DESC' },
    });

    return enquiries.map((enquiry) => ({
      id: enquiry.id,
      organizationName: enquiry.organizationName,
      contactName: enquiry.contactName,
      email: enquiry.email,
      phone: enquiry.phone,
      message: enquiry.message,
      status: enquiry.status,
      createdAt: enquiry.createdAt,
      updatedAt: enquiry.updatedAt,
    }));
  }

  async listSmsSenders() {
    await this.ensureLegacySmsSenderAllocations();
    const senders = await this.smsSenderRepo.find({
      order: { isActive: 'DESC', name: 'ASC' },
    });
    const counts = await this.churchSmsSenderRepo
      .createQueryBuilder('allocation')
      .select('allocation.senderId', 'senderId')
      .addSelect('COUNT(allocation.id)', 'churchCount')
      .groupBy('allocation.senderId')
      .getRawMany();
    const countBySenderId = new Map(
      counts.map((item) => [item.senderId, Number(item.churchCount || 0)]),
    );

    return senders.map((sender) => ({
      ...sender,
      churchCount: countBySenderId.get(sender.id) || 0,
    }));
  }

  async createSmsSender(body: any) {
    const name = this.normalizeOptionalText(body.name);
    if (!name) {
      throw new BadRequestException('Sender ID name is required');
    }
    const existing = await this.smsSenderRepo.findOne({ where: { name } });
    if (existing) {
      throw new BadRequestException('This sender ID already exists');
    }

    return this.smsSenderRepo.save(
      this.smsSenderRepo.create({
        name,
        isActive: this.normalizeBoolean(body.isActive, true),
      }),
    );
  }

  async updateSmsSender(senderId: string, body: any) {
    const sender = await this.smsSenderRepo.findOne({
      where: { id: senderId },
    });
    if (!sender) {
      throw new BadRequestException('Sender ID not found');
    }

    let shouldSyncAllocations = false;
    if (body.name !== undefined) {
      const name = this.normalizeOptionalText(body.name);
      if (!name) {
        throw new BadRequestException('Sender ID name is required');
      }
      const existing = await this.smsSenderRepo.findOne({ where: { name } });
      if (existing && existing.id !== sender.id) {
        throw new BadRequestException('This sender ID already exists');
      }
      shouldSyncAllocations = shouldSyncAllocations || sender.name !== name;
      sender.name = name;
    }
    if (body.isActive !== undefined) {
      const isActive = this.normalizeBoolean(body.isActive, sender.isActive);
      shouldSyncAllocations =
        shouldSyncAllocations || sender.isActive !== isActive;
      sender.isActive = isActive;
    }

    const saved = await this.smsSenderRepo.save(sender);
    if (shouldSyncAllocations) {
      await this.syncChurchLegacySenderFieldsForSender(sender.id);
    }
    return saved;
  }

  async setChurchSmsSenders(churchId: string, body: any) {
    const church = await this.ensureChurchExists(churchId);
    const senderIds = Array.isArray(body.senderIds)
      ? Array.from(
          new Set(
            body.senderIds
              .map((item: unknown) => this.normalizeOptionalText(item))
              .filter(Boolean),
          ),
        )
      : [];
    const defaultSenderId = this.normalizeOptionalText(body.defaultSenderId);
    if (defaultSenderId && !senderIds.includes(defaultSenderId)) {
      throw new BadRequestException(
        'Default sender must be included in the church sender allocation',
      );
    }

    const senders =
      senderIds.length > 0
        ? await this.smsSenderRepo.find({ where: { id: In(senderIds) } })
        : [];
    if (senders.length !== senderIds.length) {
      throw new BadRequestException(
        'One or more selected sender IDs were not found',
      );
    }

    await this.churchSmsSenderRepo.delete({ churchId });
    const resolvedDefaultId = defaultSenderId || senders[0]?.id || null;
    if (senders.length > 0) {
      await this.churchSmsSenderRepo.save(
        senders.map((sender) =>
          this.churchSmsSenderRepo.create({
            churchId,
            senderId: sender.id,
            isDefault: sender.id === resolvedDefaultId,
          }),
        ),
      );
    }
    await this.syncChurchLegacySenderFields(church, senders, resolvedDefaultId);

    return this.getChurchSenderAllocation(churchId);
  }

  async createChurch(body: any, performedByPlatformUserId: string) {
    const adminPhone = this.normalizeOptionalText(body.adminPhone);

    if (
      !body.name ||
      !body.adminName ||
      !body.adminEmail ||
      !adminPhone ||
      !body.adminPassword
    ) {
      throw new BadRequestException(
        'Church name, first admin phone, and initial church admin credentials are required',
      );
    }

    const baseSlug = this.slugify(body.slug || body.name);
    const slug = await this.resolveUniqueChurchSlug(baseSlug);
    const billingModel = this.normalizeBillingModel(body.billingModel);
    const commissionRatePct =
      billingModel === ChurchBillingModel.COMMISSION
        ? this.normalizeCommissionRate(body.commissionRatePct)
        : 0;

    const church = await this.churchRepo.save(
      this.churchRepo.create({
        name: body.name,
        slug,
        contactEmail: body.contactEmail || body.adminEmail.toLowerCase(),
        contactPhone: body.contactPhone || adminPhone,
        address: body.address || null,
        logoUrl: body.logoUrl || null,
        notes: body.notes || null,
        smsPartnerId: this.normalizeOptionalText(body.smsPartnerId),
        smsApiKey: this.normalizeOptionalText(body.smsApiKey),
        smsShortcode: this.normalizeOptionalText(body.smsShortcode),
        smsShortcodes: this.normalizeSmsShortcodes(body.smsShortcodes),
        smsBaseUrl: this.normalizeOptionalText(body.smsBaseUrl),
        smsUnitRateKes: this.normalizeSmsUnitRate(body.smsUnitRateKes),
        mpesaEnvironment:
          this.normalizeOptionalText(body.mpesaEnvironment) || 'sandbox',
        mpesaConsumerKey: this.normalizeOptionalText(body.mpesaConsumerKey),
        mpesaConsumerSecret: this.normalizeOptionalText(
          body.mpesaConsumerSecret,
        ),
        mpesaPasskey: this.normalizeOptionalText(body.mpesaPasskey),
        mpesaShortcode: this.normalizeOptionalText(body.mpesaShortcode),
        mpesaCallbackUrl: this.normalizeOptionalText(body.mpesaCallbackUrl),
        commissionRatePct,
        billingModel,
        enabledFeatures: this.normalizeChurchFeatures(body.enabledFeatures),
        status: ChurchStatus.ACTIVE,
      }),
    );
    if (Array.isArray(body.smsSenderIds)) {
      await this.setChurchSmsSenders(church.id, {
        senderIds: body.smsSenderIds,
        defaultSenderId: body.defaultSmsSenderId,
      });
    }

    const adminUser = await this.churchUserRepo.save(
      this.churchUserRepo.create({
        churchId: church.id,
        name: body.adminName,
        email: body.adminEmail.toLowerCase(),
        username: body.adminUsername || null,
        phone: adminPhone,
        passwordHash: await bcrypt.hash(body.adminPassword, 10),
        role: ChurchUserRole.PRIEST,
        isActive: true,
      }),
    );
    const adminCredentialsSms = await this.sendChurchUserCredentialsSms(
      church,
      adminUser,
      `${body.adminPassword}`,
    );

    let subscription: any = null;
    if (billingModel === ChurchBillingModel.SUBSCRIPTION) {
      subscription =
        await this.churchSubscriptionsService.initializeSubscription(
          church.id,
          Number(body.initialSubscriptionDays || 30),
          performedByPlatformUserId,
          body.planName || 'Standard Plan',
        );
    }

    if (body.seedDefaultFundAccounts !== false) {
      await this.seedDefaultFundAccounts(church.id);
    }

    return {
      church,
      adminUser: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        phone: adminUser.phone,
        role: adminUser.role,
        credentialsSmsSent: adminCredentialsSms.sent,
        credentialsSmsError: adminCredentialsSms.error,
      },
      adminCredentialsSmsSent: adminCredentialsSms.sent,
      adminCredentialsSmsError: adminCredentialsSms.error,
      subscription,
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
      .addSelect('SUM(COALESCE(contribution.commissionAmount, 0))', 'revenue')
      .addSelect('COUNT(contribution.id)', 'count')
      .where('contribution.status = :status', {
        status: ContributionStatus.CONFIRMED,
      })
      .andWhere('contribution.channel = :channel', {
        channel: ContributionChannel.MPESA,
      })
      .andWhere('contribution.sourceType IN (:...sourceTypes)', {
        sourceTypes: this.getDirectMpesaSourceTypes(),
      })
      .groupBy('contribution.churchId')
      .getRawMany();

    const totalsByChurchId = new Map(
      confirmedTotals.map((item) => [
        item.churchId,
        {
          total: Number(item.total || 0),
          revenue: Number(item.revenue || 0),
          count: Number(item.count || 0),
        },
      ]),
    );

    const smsUsage = await this.smsOutboxRepo
      .createQueryBuilder('message')
      .select('message.churchId', 'churchId')
      .addSelect('SUM(message.estimatedUnits)', 'units')
      .where('message.sendStatus = :sendStatus', {
        sendStatus: SmsSendStatus.ACCEPTED,
      })
      .groupBy('message.churchId')
      .getRawMany();
    const smsUsageByChurchId = new Map(
      smsUsage.map((item) => [item.churchId, Number(item.units || 0)]),
    );

    return churches.map((church) => {
      const billingModel =
        church.billingModel || this.inferBillingModel(church.commissionRatePct);

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
        billingModel,
        createdAt: church.createdAt,
        updatedAt: church.updatedAt,
        userCount: church.users?.length || 0,
        subscription:
          billingModel === ChurchBillingModel.SUBSCRIPTION
            ? subscriptionByChurchId.get(church.id) || null
            : null,
        integrations: buildChurchIntegrationSummary(church),
        commissionRatePct: Number(church.commissionRatePct || 0),
        smsUnitRateKes: Number(church.smsUnitRateKes || 0),
        enabledFeatures: normalizeFeatureList(church.enabledFeatures),
        contributionTotals: this.decorateRevenueTotals(
          totalsByChurchId.get(church.id),
          church,
        ),
        smsUnitsConsumed: smsUsageByChurchId.get(church.id) || 0,
      };
    });
  }

  async getChurchDetails(churchId: string) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new BadRequestException('Church not found');
    }

    const billingModel =
      church.billingModel || this.inferBillingModel(church.commissionRatePct);
    await this.ensureChurchSenderAllocationsFromLegacy(church);
    const [subscription, userCount, fundAccountCount, senderAllocation] =
      await Promise.all([
        billingModel === ChurchBillingModel.SUBSCRIPTION
          ? this.churchSubscriptionsService.getChurchSubscriptionStatus(
              church.id,
            )
          : Promise.resolve(null),
        this.churchUserRepo.count({ where: { churchId: church.id } }),
        this.fundAccountRepo.count({ where: { churchId: church.id } }),
        this.getChurchSenderAllocation(church.id),
      ]);

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
      billingModel,
      smsPartnerId: church.smsPartnerId,
      smsApiKey: church.smsApiKey,
      smsShortcode: church.smsShortcode,
      smsShortcodes: church.smsShortcodes || [],
      smsSenderIds: senderAllocation.senderIds,
      defaultSmsSenderId: senderAllocation.defaultSenderId,
      smsSenders: senderAllocation.senders,
      smsBaseUrl: church.smsBaseUrl,
      smsUnitRateKes: Number(church.smsUnitRateKes || 0),
      mpesaEnvironment: church.mpesaEnvironment || 'sandbox',
      mpesaConsumerKey: church.mpesaConsumerKey,
      mpesaConsumerSecret: church.mpesaConsumerSecret,
      mpesaPasskey: church.mpesaPasskey,
      mpesaShortcode: church.mpesaShortcode,
      mpesaCallbackUrl: church.mpesaCallbackUrl,
      commissionRatePct: Number(church.commissionRatePct || 0),
      enabledFeatures: normalizeFeatureList(church.enabledFeatures),
      integrations: buildChurchIntegrationSummary(church),
      subscription,
      userCount,
      fundAccountCount,
    };
  }

  async listChurchUsers(churchId: string) {
    const church = await this.ensureChurchExists(churchId);
    const users = await this.churchUserRepo.find({
      where: { churchId },
      order: { createdAt: 'DESC' },
    });
    return users.map((user) =>
      this.sanitizeChurchUser(user, church.enabledFeatures),
    );
  }

  async createChurchUser(churchId: string, body: any) {
    const church = await this.ensureChurchExists(churchId);

    const name = this.normalizeOptionalText(body.name);
    const email = this.normalizeOptionalEmail(body.email);
    const password = this.normalizeOptionalText(body.password);
    const username = this.normalizeOptionalText(body.username);
    const phone = this.normalizeOptionalText(body.phone);

    if (!name || !email || !phone || !password || !body.role) {
      throw new BadRequestException(
        'Name, email, phone, password, and role are required',
      );
    }

    const existingWhere: any[] = [{ email }];
    if (username) {
      existingWhere.push({ username });
    }
    if (phone) {
      existingWhere.push({ phone });
    }

    const existing = await this.churchUserRepo.findOne({
      where: existingWhere,
    });
    if (existing) {
      throw new BadRequestException('Church user already exists');
    }

    const role = normalizeChurchRole(body.role) as ChurchUserRole;
    const access = this.normalizeChurchUserAccess(
      role,
      body.permissionOverrides,
      body.permissionDenials,
    );
    const user = this.churchUserRepo.create({
      churchId,
      name,
      email,
      username,
      phone,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      permissionOverrides: access.permissionOverrides,
      permissionDenials: access.permissionDenials,
      isActive: this.normalizeBoolean(body.isActive, true),
    });

    const saved = await this.churchUserRepo.save(user);
    const credentialsSms = await this.sendChurchUserCredentialsSms(
      church,
      saved,
      password,
    );

    return {
      ...this.sanitizeChurchUser(saved, church.enabledFeatures),
      credentialsSmsSent: credentialsSms.sent,
      credentialsSmsError: credentialsSms.error,
    };
  }

  async updateChurchUser(churchId: string, userId: string, body: any) {
    const church = await this.ensureChurchExists(churchId);
    const user = await this.churchUserRepo.findOne({
      where: { id: userId, churchId },
    });
    if (!user) {
      throw new BadRequestException('Church user not found');
    }

    if (body.name !== undefined) {
      const name = this.normalizeOptionalText(body.name);
      if (!name) {
        throw new BadRequestException('Name is required');
      }
      user.name = name;
    }

    if (body.email !== undefined) {
      const email = this.normalizeOptionalEmail(body.email);
      if (!email) {
        throw new BadRequestException('Email is required');
      }
      if (email !== user.email) {
        const existing = await this.churchUserRepo.findOne({
          where: { email },
        });
        if (existing && existing.id !== user.id) {
          throw new BadRequestException('Email already in use');
        }
        user.email = email;
      }
    }

    if (body.username !== undefined) {
      const username = this.normalizeOptionalText(body.username);
      if (username !== user.username) {
        if (username) {
          const existing = await this.churchUserRepo.findOne({
            where: { username },
          });
          if (existing && existing.id !== user.id) {
            throw new BadRequestException('Username already in use');
          }
        }
        user.username = username;
      }
    }

    if (body.phone !== undefined) {
      const phone = this.normalizeOptionalText(body.phone);
      if (phone !== user.phone) {
        if (phone) {
          const existing = await this.churchUserRepo.findOne({
            where: { phone },
          });
          if (existing && existing.id !== user.id) {
            throw new BadRequestException('Phone already in use');
          }
        }
        user.phone = phone;
      }
    }

    const nextRole = (
      body.role !== undefined
        ? normalizeChurchRole(body.role)
        : normalizeChurchRole(user.role)
    ) as ChurchUserRole;
    const nextIsActive =
      body.isActive !== undefined
        ? this.normalizeBoolean(body.isActive, user.isActive)
        : user.isActive;
    await this.assertLastActivePriestRemains(
      churchId,
      user,
      nextRole,
      nextIsActive,
    );
    const access = this.normalizeChurchUserAccess(
      nextRole,
      body.permissionOverrides !== undefined
        ? body.permissionOverrides
        : user.permissionOverrides,
      body.permissionDenials !== undefined
        ? body.permissionDenials
        : user.permissionDenials,
    );
    user.role = nextRole;
    user.permissionOverrides = access.permissionOverrides;
    user.permissionDenials = access.permissionDenials;
    user.isActive = nextIsActive;

    if (body.password !== undefined) {
      const password = this.normalizeOptionalText(body.password);
      if (password) {
        user.passwordHash = await bcrypt.hash(password, 10);
      }
    }

    const saved = await this.churchUserRepo.save(user);
    return this.sanitizeChurchUser(saved, church.enabledFeatures);
  }

  async resendChurchUserCredentials(churchId: string, userId: string) {
    const church = await this.ensureChurchExists(churchId);
    const user = await this.churchUserRepo.findOne({
      where: { id: userId, churchId },
    });
    if (!user) {
      throw new BadRequestException('Church user not found');
    }
    if (!user.phone) {
      throw new BadRequestException('This church user has no phone number');
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const credentialsSms = await this.sendChurchUserCredentialsSms(
      church,
      user,
      temporaryPassword,
    );

    if (!credentialsSms.sent) {
      throw new BadRequestException(
        credentialsSms.error ||
          'Unable to send credentials SMS. Check the platform SMS outbox for the provider error.',
      );
    }

    user.passwordHash = await bcrypt.hash(temporaryPassword, 10);
    await this.churchUserRepo.save(user);

    return {
      sent: true,
      user: this.sanitizeChurchUser(user, church.enabledFeatures),
    };
  }

  async updateChurch(
    churchId: string,
    body: any,
    performedByPlatformUserId?: string,
  ) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new BadRequestException('Church not found');
    }
    let nextBillingModel =
      church.billingModel || this.inferBillingModel(church.commissionRatePct);

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
    if (body.smsShortcodes !== undefined) {
      church.smsShortcodes = this.normalizeSmsShortcodes(body.smsShortcodes);
    }
    if (body.smsBaseUrl !== undefined) {
      church.smsBaseUrl = this.normalizeOptionalText(body.smsBaseUrl);
    }
    if (body.smsUnitRateKes !== undefined) {
      church.smsUnitRateKes = this.normalizeSmsUnitRate(body.smsUnitRateKes);
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
    if (body.commissionRatePct !== undefined) {
      church.commissionRatePct = this.normalizeCommissionRate(
        body.commissionRatePct,
      );
    }
    if (body.billingModel !== undefined) {
      nextBillingModel = this.normalizeBillingModel(body.billingModel);
      church.billingModel = nextBillingModel;
      if (nextBillingModel === ChurchBillingModel.SUBSCRIPTION) {
        church.commissionRatePct = 0;
      } else if (body.commissionRatePct !== undefined) {
        church.commissionRatePct = this.normalizeCommissionRate(
          body.commissionRatePct,
        );
      }
    }
    if (body.enabledFeatures !== undefined) {
      church.enabledFeatures = this.normalizeChurchFeatures(
        body.enabledFeatures,
      );
    }
    if (nextBillingModel === ChurchBillingModel.SUBSCRIPTION) {
      church.commissionRatePct = 0;
    }

    const saved = await this.churchRepo.save(church);
    if (Array.isArray(body.smsSenderIds)) {
      await this.setChurchSmsSenders(church.id, {
        senderIds: body.smsSenderIds,
        defaultSenderId: body.defaultSmsSenderId,
      });
    }
    if (nextBillingModel === ChurchBillingModel.SUBSCRIPTION) {
      await this.churchSubscriptionsService.ensureSubscriptionForBilling(
        church.id,
        Number(body.initialSubscriptionDays || 30),
        performedByPlatformUserId,
        'Switched to subscription billing',
      );
    }
    return {
      ...this.buildChurchSummary(saved),
      integrations: buildChurchIntegrationSummary(saved),
    };
  }

  async updateChurchBillingBatch(
    body: any,
    performedByPlatformUserId?: string,
  ) {
    const churchIds = Array.isArray(body.churchIds)
      ? body.churchIds
          .map((item: unknown) => this.normalizeOptionalText(item))
          .filter(Boolean)
      : [];
    if (churchIds.length === 0) {
      throw new BadRequestException('Select at least one church');
    }

    const billingModel = this.normalizeBillingModel(body.billingModel);
    const commissionRatePct =
      billingModel === ChurchBillingModel.COMMISSION
        ? this.normalizeCommissionRate(body.commissionRatePct)
        : 0;
    const subscriptionDays = Number(body.subscriptionDays || 30);
    if (
      billingModel === ChurchBillingModel.SUBSCRIPTION &&
      (!Number.isFinite(subscriptionDays) || subscriptionDays < 1)
    ) {
      throw new BadRequestException('Subscription days must be at least 1');
    }

    const churches = await this.churchRepo.find({
      where: { id: In(churchIds) },
    });
    if (churches.length === 0) {
      throw new BadRequestException('No churches matched this batch');
    }

    for (const church of churches) {
      church.billingModel = billingModel;
      church.commissionRatePct = commissionRatePct;
      await this.churchRepo.save(church);

      if (billingModel === ChurchBillingModel.SUBSCRIPTION) {
        await this.churchSubscriptionsService.ensureSubscriptionForBilling(
          church.id,
          subscriptionDays,
          performedByPlatformUserId,
          body.reason || 'Batch switched to subscription billing',
        );
      }
    }

    return {
      updated: churches.length,
      billingModel,
      commissionRatePct,
    };
  }

  async deleteChurch(churchId: string, body: any = {}) {
    const church = await this.churchRepo.findOne({
      where: { id: churchId },
    });
    if (!church) {
      throw new BadRequestException('Church not found');
    }

    const confirmName = this.normalizeOptionalText(body.confirmName);
    if (confirmName !== church.name) {
      throw new BadRequestException(
        `Type "${church.name}" to confirm this church deletion`,
      );
    }

    await this.churchRepo.remove(church);
    return {
      id: churchId,
      name: church.name,
      deleted: true,
    };
  }

  async getPlatformMessagingConfig() {
    const churches = await this.churchRepo.find({
      relations: ['users'],
      order: { name: 'ASC' },
    });
    const smsConfig = await this.smsService.getPlatformSmsConfigForAdmin();

    return {
      smsConfig,
      churches: churches.map((church) =>
        this.buildPlatformMessagingChurch(church),
      ),
    };
  }

  async updatePlatformMessagingConfig(body: any) {
    const smsPartnerId = this.normalizeOptionalText(body.smsPartnerId);
    const smsApiKey = this.normalizeOptionalText(body.smsApiKey);
    const smsShortcode = this.normalizeOptionalText(body.smsShortcode);
    const smsBaseUrl =
      this.normalizeOptionalText(body.smsBaseUrl) ||
      'https://quicksms.advantasms.com';
    const mpesaEnvironment =
      this.normalizeOptionalText(body.mpesaEnvironment) || 'sandbox';
    const mpesaConsumerKey = this.normalizeOptionalText(body.mpesaConsumerKey);
    const mpesaConsumerSecret = this.normalizeOptionalText(
      body.mpesaConsumerSecret,
    );
    const mpesaPasskey = this.normalizeOptionalText(body.mpesaPasskey);
    const mpesaShortcode = this.normalizeOptionalText(body.mpesaShortcode);
    const mpesaCallbackUrl = this.normalizeOptionalText(body.mpesaCallbackUrl);

    if (!smsPartnerId || !smsApiKey || !smsShortcode) {
      throw new BadRequestException(
        'Platform SMS partner ID, API key, and shortcode are required',
      );
    }

    const config =
      (await this.platformSmsConfigRepo.findOne({
        where: { id: PLATFORM_SMS_CONFIG_ID },
      })) ||
      this.platformSmsConfigRepo.create({
        id: PLATFORM_SMS_CONFIG_ID,
      });

    config.smsPartnerId = smsPartnerId;
    config.smsApiKey = smsApiKey;
    config.smsShortcode = smsShortcode;
    config.smsBaseUrl = smsBaseUrl.replace(/\/$/, '');
    config.mpesaEnvironment = mpesaEnvironment;
    config.mpesaConsumerKey = mpesaConsumerKey;
    config.mpesaConsumerSecret = mpesaConsumerSecret;
    config.mpesaPasskey = mpesaPasskey;
    config.mpesaShortcode = mpesaShortcode;
    config.mpesaCallbackUrl = mpesaCallbackUrl;

    await this.platformSmsConfigRepo.save(config);

    return this.smsService.getPlatformSmsConfigForAdmin();
  }

  async sendPlatformChurchMessage(body: any) {
    const message = this.normalizeOptionalText(body.message);
    if (!message) {
      throw new BadRequestException('Message is required');
    }

    const selectedChurchIds = Array.isArray(body.churchIds)
      ? body.churchIds
          .map((item: unknown) => this.normalizeOptionalText(item))
          .filter(Boolean)
      : [];
    const audience = body.audience === 'selected' ? 'selected' : 'all';

    if (audience === 'selected' && selectedChurchIds.length === 0) {
      throw new BadRequestException('Select at least one church');
    }

    const churches = await this.churchRepo.find({
      relations: ['users'],
      where:
        audience === 'selected'
          ? { id: In(selectedChurchIds) }
          : { status: ChurchStatus.ACTIVE },
      order: { name: 'ASC' },
    });

    if (churches.length === 0) {
      throw new BadRequestException('No churches matched this audience');
    }

    let accepted = 0;
    let failed = 0;
    let skipped = 0;
    const recipients: Array<{
      churchId: string;
      churchName: string;
      name: string | null;
      phone: string;
      status: 'accepted' | 'failed' | 'skipped';
    }> = [];
    const sentPhones = new Set<string>();
    const platformSmsConfig =
      await this.smsService.resolveSystemSmsConfig('platform');

    for (const church of churches) {
      const contacts = this.getPlatformMessagingContacts(church);
      if (contacts.length === 0) {
        skipped += 1;
        recipients.push({
          churchId: church.id,
          churchName: church.name,
          name: null,
          phone: '',
          status: 'skipped',
        });
        continue;
      }

      for (const contact of contacts) {
        const normalizedPhone = this.normalizePhoneForSms(contact.phone);
        if (!normalizedPhone || sentPhones.has(normalizedPhone)) {
          skipped += 1;
          continue;
        }
        sentPhones.add(normalizedPhone);

        const ok = await this.smsService.sendSms(
          normalizedPhone,
          message,
          {
            churchId: church.id,
            smsPartnerId: platformSmsConfig.smsPartnerId || undefined,
            smsApiKey: platformSmsConfig.smsApiKey || undefined,
            smsShortcode: platformSmsConfig.smsShortcode || undefined,
            smsBaseUrl: platformSmsConfig.smsBaseUrl || undefined,
            smsConfigSource: platformSmsConfig.smsConfigSource,
          },
          {
            messageType: SmsMessageType.BULK,
            recipientName: `Church: ${church.name}${
              contact.name ? ` - ${contact.name}` : ''
            }`,
          },
        );

        if (ok) {
          accepted += 1;
        } else {
          failed += 1;
        }

        recipients.push({
          churchId: church.id,
          churchName: church.name,
          name: contact.name,
          phone: normalizedPhone,
          status: ok ? 'accepted' : 'failed',
        });
      }
    }

    return {
      churchCount: churches.length,
      recipientCount: accepted + failed,
      accepted,
      failed,
      skipped,
      recipients,
    };
  }

  async listPlatformMessagingOutbox(query: any = {}) {
    const qb = this.smsOutboxRepo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.church', 'church')
      .where('message.createdByUserId IS NULL')
      .andWhere(
        '(message.messageType = :systemType OR message.recipientName LIKE :clientRecipient)',
        {
          systemType: SmsMessageType.SYSTEM,
          clientRecipient: 'Church:%',
        },
      )
      .orderBy('message.createdAt', 'DESC');

    if (query.churchId) {
      qb.andWhere('message.churchId = :churchId', { churchId: query.churchId });
    }
    if (query.from) {
      qb.andWhere('message.createdAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('message.createdAt <= :to', { to: new Date(query.to) });
    }
    if (query.sendStatus) {
      qb.andWhere('message.sendStatus = :sendStatus', {
        sendStatus: query.sendStatus,
      });
    }
    if (query.deliveryStatus) {
      qb.andWhere('message.deliveryStatus = :deliveryStatus', {
        deliveryStatus: query.deliveryStatus,
      });
    }

    return qb.getMany();
  }

  async getDashboardSummary() {
    const churches = await this.listChurches();
    const churchRevenueTotals = churches.reduce(
      (totals, church) => {
        totals.totalRevenue += Number(church.contributionTotals?.total || 0);
        totals.commissionRevenue += Number(
          church.contributionTotals?.revenue || 0,
        );
        return totals;
      },
      { totalRevenue: 0, commissionRevenue: 0 },
    );
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);
    const last30Summary = await this.contributionRepo
      .createQueryBuilder('contribution')
      .select('SUM(contribution.amount)', 'total')
      .addSelect(
        'SUM(COALESCE(contribution.commissionAmount, 0))',
        'commission',
      )
      .where('contribution.status = :status', {
        status: ContributionStatus.CONFIRMED,
      })
      .andWhere('contribution.channel = :channel', {
        channel: ContributionChannel.MPESA,
      })
      .andWhere('contribution.sourceType IN (:...sourceTypes)', {
        sourceTypes: this.getDirectMpesaSourceTypes(),
      })
      .andWhere('contribution.receivedAt >= :from', { from: last30Days })
      .getRawOne();
    const paidSmsPurchaseStatuses = [
      SmsUnitPurchaseStatus.CONFIRMED,
      SmsUnitPurchaseStatus.SENDING,
      SmsUnitPurchaseStatus.SENT,
      SmsUnitPurchaseStatus.SEND_FAILED,
    ];
    const [smsPurchaseTotals, recentSmsPurchases] = await Promise.all([
      this.smsUnitPurchaseRepo
        .createQueryBuilder('purchase')
        .select('SUM(purchase.amountKes)', 'revenue')
        .addSelect('SUM(purchase.totalUnits)', 'units')
        .addSelect('COUNT(purchase.id)', 'count')
        .where('purchase.status IN (:...statuses)', {
          statuses: paidSmsPurchaseStatuses,
        })
        .getRawOne(),
      this.smsUnitPurchaseRepo.find({
        relations: ['church', 'createdByUser'],
        order: { createdAt: 'DESC' },
        take: 100,
      }),
    ]);

    const statusCounts = churches.reduce(
      (acc, church) => {
        if (church.billingModel !== ChurchBillingModel.SUBSCRIPTION) {
          acc.commission = (acc.commission || 0) + 1;
          return acc;
        }
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
        commissionChurches: statusCounts.commission || 0,
        totalRevenue: Number(churchRevenueTotals.totalRevenue.toFixed(2)),
        totalCollections: Number(churchRevenueTotals.totalRevenue.toFixed(2)),
        commissionRevenue: Number(
          churchRevenueTotals.commissionRevenue.toFixed(2),
        ),
        smsRevenue: Number(smsPurchaseTotals?.revenue || 0),
        smsUnitsSold: Number(smsPurchaseTotals?.units || 0),
        smsPurchaseCount: Number(smsPurchaseTotals?.count || 0),
        last30DayRevenue: Number(last30Summary?.total || 0),
        last30DayCollections: Number(last30Summary?.total || 0),
        last30DayCommissionRevenue: Number(last30Summary?.commission || 0),
      },
      revenueBreakdown: churches
        .map((church) => ({
          id: church.id,
          name: church.name,
          slug: church.slug,
          billingModel: church.billingModel,
          commissionRatePct: Number(church.commissionRatePct || 0),
          totalRevenue: Number(church.contributionTotals?.total || 0),
          commissionRevenue: Number(church.contributionTotals?.revenue || 0),
          contributionCount: Number(church.contributionTotals?.count || 0),
        }))
        .sort((a, b) => b.commissionRevenue - a.commissionRevenue),
      smsPurchaseBreakdown: recentSmsPurchases.map((purchase) => ({
        id: purchase.id,
        churchId: purchase.churchId,
        churchName: purchase.church?.name || 'Client church',
        churchSlug: purchase.church?.slug || '',
        createdByUserName: purchase.createdByUser?.name || null,
        recipientCount: purchase.recipientCount,
        totalUnits: purchase.totalUnits,
        smsUnitRateKes: Number(purchase.smsUnitRateKes || 0),
        amountKes: Number(purchase.amountKes || 0),
        payerPhone: purchase.payerPhone,
        mpesaReceipt: purchase.mpesaReceipt,
        status: purchase.status,
        statusDescription: purchase.statusDescription,
        paidAt: purchase.paidAt,
        sentAt: purchase.sentAt,
        createdAt: purchase.createdAt,
      })),
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
    await this.ensureSubscriptionBillingChurch(churchId);
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
    await this.ensureSubscriptionBillingChurch(churchId);
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
    await this.ensureSubscriptionBillingChurch(churchId);
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
    await this.ensureSubscriptionBillingChurch(churchId);
    return this.churchSubscriptionsService.reactivate(
      churchId,
      days,
      platformUserId,
      reason,
    );
  }

  async getPlatformCollections(query: any = {}) {
    const qb = this.contributionRepo
      .createQueryBuilder('contribution')
      .leftJoinAndSelect('contribution.church', 'church')
      .leftJoinAndSelect('contribution.contributor', 'contributor')
      .where('contribution.status = :status', {
        status: ContributionStatus.CONFIRMED,
      })
      .andWhere('contribution.channel = :channel', {
        channel: ContributionChannel.MPESA,
      })
      .andWhere('contribution.sourceType IN (:...sourceTypes)', {
        sourceTypes: this.getDirectMpesaSourceTypes(),
      })
      .orderBy('contribution.receivedAt', 'DESC')
      .addOrderBy('contribution.createdAt', 'DESC');

    if (query.churchId) {
      qb.andWhere('contribution.churchId = :churchId', {
        churchId: query.churchId,
      });
    }
    if (query.from) {
      qb.andWhere('contribution.receivedAt >= :from', {
        from: new Date(query.from),
      });
    }
    if (query.to) {
      qb.andWhere('contribution.receivedAt <= :to', {
        to: new Date(query.to),
      });
    }

    const contributions = await qb.getMany();
    const totalAmount = contributions.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const revenueAmount = contributions.reduce(
      (sum, item) =>
        sum +
        Number(
          item.commissionAmount ??
            Math.ceil(
              (Number(item.amount || 0) *
                Number(item.church?.commissionRatePct || 0)) /
                100,
            ),
        ),
      0,
    );

    return {
      totals: {
        contributionCount: contributions.length,
        totalAmount,
        revenueAmount: Number(revenueAmount.toFixed(2)),
      },
      contributions,
    };
  }

  async getPlatformSmsUsage(query: any = {}) {
    const qb = this.smsOutboxRepo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.church', 'church')
      .where('message.sendStatus = :sendStatus', {
        sendStatus: SmsSendStatus.ACCEPTED,
      })
      .orderBy('message.createdAt', 'DESC');

    if (query.churchId) {
      qb.andWhere('message.churchId = :churchId', { churchId: query.churchId });
    }
    if (query.from) {
      qb.andWhere('message.createdAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('message.createdAt <= :to', { to: new Date(query.to) });
    }

    const purchaseQb = this.smsUnitPurchaseRepo
      .createQueryBuilder('purchase')
      .select('SUM(purchase.amountKes)', 'revenue')
      .addSelect('SUM(purchase.totalUnits)', 'unitsSold')
      .addSelect('COUNT(purchase.id)', 'purchaseCount')
      .where('purchase.status IN (:...statuses)', {
        statuses: [
          SmsUnitPurchaseStatus.CONFIRMED,
          SmsUnitPurchaseStatus.SENDING,
          SmsUnitPurchaseStatus.SENT,
          SmsUnitPurchaseStatus.SEND_FAILED,
        ],
      });

    if (query.churchId) {
      purchaseQb.andWhere('purchase.churchId = :churchId', {
        churchId: query.churchId,
      });
    }
    if (query.from) {
      purchaseQb.andWhere('purchase.createdAt >= :from', {
        from: new Date(query.from),
      });
    }
    if (query.to) {
      purchaseQb.andWhere('purchase.createdAt <= :to', {
        to: new Date(query.to),
      });
    }

    const [messages, purchaseTotals] = await Promise.all([
      qb.getMany(),
      purchaseQb.getRawOne(),
    ]);
    return {
      totals: {
        messageCount: messages.length,
        units: messages.reduce(
          (sum, item) => sum + Number(item.estimatedUnits || 0),
          0,
        ),
        revenue: Number(purchaseTotals?.revenue || 0),
        unitsSold: Number(purchaseTotals?.unitsSold || 0),
        purchaseCount: Number(purchaseTotals?.purchaseCount || 0),
      },
      messages,
    };
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
      {
        name: 'General',
        code: 'general',
        description:
          'Fallback account for payments whose account reference does not match a configured fund account.',
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
          receiptTemplate: getDefaultReceiptTemplateForFundCode(template.code),
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
      billingModel:
        church.billingModel || this.inferBillingModel(church.commissionRatePct),
      commissionRatePct: Number(church.commissionRatePct || 0),
      smsUnitRateKes: Number(church.smsUnitRateKes || 0),
      enabledFeatures: normalizeFeatureList(church.enabledFeatures),
      smsShortcodes: church.smsShortcodes || [],
    };
  }

  private async getChurchSenderAllocation(churchId: string) {
    const allocations = await this.churchSmsSenderRepo.find({
      where: { churchId },
      relations: ['sender'],
    });
    allocations.sort((left, right) => {
      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
      }
      return left.sender.name.localeCompare(right.sender.name);
    });

    return {
      senderIds: allocations.map((allocation) => allocation.senderId),
      defaultSenderId:
        allocations.find((allocation) => allocation.isDefault)?.senderId ||
        allocations[0]?.senderId ||
        null,
      senders: allocations.map((allocation) => ({
        id: allocation.sender.id,
        name: allocation.sender.name,
        isActive: allocation.sender.isActive,
        isDefault: allocation.isDefault,
      })),
    };
  }

  private async ensureLegacySmsSenderAllocations() {
    const churches = await this.churchRepo.find();
    for (const church of churches) {
      await this.ensureChurchSenderAllocationsFromLegacy(church);
    }
  }

  private async ensureChurchSenderAllocationsFromLegacy(church: Church) {
    const existingCount = await this.churchSmsSenderRepo.count({
      where: { churchId: church.id },
    });
    if (existingCount > 0) {
      return;
    }

    const names = Array.from(
      new Set(
        [church.smsShortcode, ...(church.smsShortcodes || [])]
          .map((item) => `${item || ''}`.trim())
          .filter(Boolean),
      ),
    );
    if (names.length === 0) {
      return;
    }

    const senders: SmsSender[] = [];
    for (const name of names) {
      let sender = await this.smsSenderRepo.findOne({ where: { name } });
      if (!sender) {
        sender = await this.smsSenderRepo.save(
          this.smsSenderRepo.create({ name, isActive: true }),
        );
      }
      senders.push(sender);
    }

    await this.churchSmsSenderRepo.save(
      senders.map((sender, index) =>
        this.churchSmsSenderRepo.create({
          churchId: church.id,
          senderId: sender.id,
          isDefault: sender.name === church.smsShortcode || index === 0,
        }),
      ),
    );
  }

  private async syncChurchLegacySenderFields(
    church: Church,
    senders: SmsSender[],
    requestedDefaultSenderId?: string | null,
  ) {
    const activeSenders = senders.filter((sender) => sender.isActive);
    const defaultSender =
      activeSenders.find((sender) => sender.id === requestedDefaultSenderId) ||
      activeSenders[0] ||
      null;
    church.smsShortcode = defaultSender?.name || null;
    const additional = activeSenders
      .filter((sender) => sender.id !== defaultSender?.id)
      .map((sender) => sender.name);
    church.smsShortcodes = additional.length > 0 ? additional : null;
    await this.churchRepo.save(church);
    await this.churchSmsSenderRepo.update(
      { churchId: church.id },
      { isDefault: false },
    );
    if (defaultSender) {
      await this.churchSmsSenderRepo.update(
        { churchId: church.id, senderId: defaultSender.id },
        { isDefault: true },
      );
    }
  }

  private async syncChurchLegacySenderFieldsForSender(senderId: string) {
    const allocations = await this.churchSmsSenderRepo.find({
      where: { senderId },
    });
    const churchIds = Array.from(
      new Set(allocations.map((allocation) => allocation.churchId)),
    );
    for (const churchId of churchIds) {
      const church = await this.churchRepo.findOne({ where: { id: churchId } });
      if (!church) {
        continue;
      }
      const allocation = await this.getChurchSenderAllocation(churchId);
      const senders =
        allocation.senderIds.length > 0
          ? await this.smsSenderRepo.find({
              where: { id: In(allocation.senderIds) },
            })
          : [];
      await this.syncChurchLegacySenderFields(
        church,
        senders,
        allocation.defaultSenderId,
      );
    }
  }

  private getDirectMpesaSourceTypes() {
    return [
      ContributionSourceType.MPESA_C2B,
      ContributionSourceType.MPESA_WEBHOOK,
    ];
  }

  private decorateRevenueTotals(
    totals: { total: number; revenue: number; count: number } | undefined,
    church: Church,
  ) {
    const base = totals || { total: 0, revenue: 0, count: 0 };
    const billingModel =
      church.billingModel || this.inferBillingModel(church.commissionRatePct);
    const fallbackRevenue =
      billingModel === ChurchBillingModel.COMMISSION
        ? base.revenue ||
          Math.ceil((base.total * Number(church.commissionRatePct || 0)) / 100)
        : 0;

    return {
      total: base.total,
      count: base.count,
      revenue: Number(fallbackRevenue.toFixed(2)),
    };
  }

  private normalizeCommissionRate(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return 0;
    }

    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new BadRequestException(
        'Commission rate must be between 0 and 100',
      );
    }
    return Number(rate.toFixed(2));
  }

  private normalizeSmsUnitRate(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return 0;
    }

    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new BadRequestException('SMS unit rate must be between 0 and 100');
    }
    return Number(rate.toFixed(2));
  }

  private normalizeBillingModel(value: unknown) {
    return value === ChurchBillingModel.COMMISSION
      ? ChurchBillingModel.COMMISSION
      : ChurchBillingModel.SUBSCRIPTION;
  }

  private inferBillingModel(value: unknown) {
    return Number(value || 0) > 0
      ? ChurchBillingModel.COMMISSION
      : ChurchBillingModel.SUBSCRIPTION;
  }

  private normalizeChurchFeatures(value: unknown) {
    if (!Array.isArray(value)) {
      return DEFAULT_CHURCH_FEATURES;
    }
    return normalizeFeatureList(value);
  }

  private normalizeSmsShortcodes(value: unknown) {
    const rawValues = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[\n,]+/)
        : [];

    const normalized = rawValues
      .map((item) => `${item || ''}`.trim())
      .filter(Boolean);

    return normalized.length > 0 ? Array.from(new Set(normalized)) : null;
  }

  private async ensureChurchExists(churchId: string) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new BadRequestException('Church not found');
    }
    return church;
  }

  private async ensureSubscriptionBillingChurch(churchId: string) {
    const church = await this.ensureChurchExists(churchId);
    const billingModel =
      church.billingModel || this.inferBillingModel(church.commissionRatePct);
    if (billingModel !== ChurchBillingModel.SUBSCRIPTION) {
      throw new BadRequestException(
        'This church is billed by commission and does not use subscription timers',
      );
    }
    return church;
  }

  private buildPlatformMessagingChurch(church: Church) {
    const contacts = this.getPlatformMessagingContacts(church);
    return {
      id: church.id,
      name: church.name,
      slug: church.slug,
      status: church.status,
      contactEmail: church.contactEmail,
      contactPhone: church.contactPhone,
      address: church.address,
      smsReady: Boolean(
        church.smsPartnerId && church.smsApiKey && church.smsShortcode,
      ),
      contacts: contacts.map((contact) => ({
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        role: contact.role,
        source: contact.source,
      })),
      primaryContact: contacts[0] || null,
      adminCount: (church.users || []).filter((user) => user.isActive).length,
    };
  }

  private getPlatformMessagingContacts(church: Church) {
    const contacts: Array<{
      name: string | null;
      email: string | null;
      phone: string | null;
      role: string | null;
      source: string;
    }> = [];

    if (church.contactPhone) {
      contacts.push({
        name: church.name,
        email: church.contactEmail,
        phone: church.contactPhone,
        role: null,
        source: 'church_profile',
      });
    }

    const activeUsers = (church.users || [])
      .filter((user) => user.isActive && user.phone)
      .sort((a, b) => {
        if (
          a.role === ChurchUserRole.PRIEST &&
          b.role !== ChurchUserRole.PRIEST
        ) {
          return -1;
        }
        if (
          a.role !== ChurchUserRole.PRIEST &&
          b.role === ChurchUserRole.PRIEST
        ) {
          return 1;
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

    activeUsers.forEach((user) => {
      contacts.push({
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        source: 'church_user',
      });
    });

    const seenPhones = new Set<string>();
    return contacts.filter((contact) => {
      const normalizedPhone = this.normalizePhoneForSms(contact.phone);
      if (!normalizedPhone || seenPhones.has(normalizedPhone)) {
        return false;
      }
      seenPhones.add(normalizedPhone);
      return true;
    });
  }

  private normalizePhoneForSms(value?: string | null) {
    const raw = `${value || ''}`.trim();
    if (!raw) {
      return null;
    }

    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) {
      return null;
    }
    if (digits.startsWith('254') && digits.length >= 12) {
      return digits;
    }
    if (digits.startsWith('0') && digits.length >= 10) {
      return `254${digits.slice(1)}`;
    }
    if (digits.length === 9 && /^[17]/.test(digits)) {
      return `254${digits}`;
    }
    return digits.length >= 10 ? digits : null;
  }

  private sanitizeChurchUser(
    user: ChurchUser,
    enabledFeatureValues?: string[] | null,
  ) {
    const { passwordHash, ...result } = user;
    const role = normalizeChurchRole(user.role) as ChurchUserRole;
    const access = this.normalizeChurchUserAccess(
      role,
      user.permissionOverrides,
      user.permissionDenials,
    );
    const enabledFeatures = normalizeFeatureList(enabledFeatureValues);
    const permissions = resolveChurchPermissions(
      role,
      access.permissionOverrides,
      access.permissionDenials,
    ).filter((permission) => {
      const requiredFeature = PERMISSION_FEATURE_MAP[permission];
      return (
        permission === ChurchPermission.DASHBOARD_VIEW ||
        !requiredFeature ||
        enabledFeatures.includes(requiredFeature)
      );
    });
    return {
      ...result,
      role,
      permissionOverrides: access.permissionOverrides || [],
      permissionDenials: access.permissionDenials || [],
      permissions,
    };
  }

  private async assertLastActivePriestRemains(
    churchId: string,
    currentUser: ChurchUser,
    nextRole: ChurchUserRole,
    nextIsActive: boolean,
  ) {
    if (
      normalizeChurchRole(currentUser.role) !== ChurchUserRole.PRIEST ||
      !currentUser.isActive ||
      (normalizeChurchRole(nextRole) === ChurchUserRole.PRIEST && nextIsActive)
    ) {
      return;
    }
    const activeUsers = await this.churchUserRepo.find({
      where: { churchId, isActive: true },
    });
    const activePriestCount = activeUsers.filter(
      (user) => normalizeChurchRole(user.role) === ChurchUserRole.PRIEST,
    ).length;
    if (activePriestCount <= 1) {
      throw new BadRequestException(
        'Assign another active Priest before changing or deactivating the last active Priest.',
      );
    }
  }

  private async sendChurchUserCredentialsSms(
    church: Church,
    user: ChurchUser,
    password: string,
  ) {
    if (!user.phone) {
      return {
        sent: false,
        error: 'No phone number is saved for this church user.',
      };
    }

    const login = user.username || user.email;
    const message = [
      `Church SaaS login for ${church.name}.`,
      `Login: ${login}`,
      `Password: ${password}`,
      'Please sign in and change your password.',
    ].join(' ');
    const sent = await this.smsService.sendSms(
      user.phone,
      message,
      await this.smsService.resolveSystemSmsConfig(church.id),
      {
        messageType: SmsMessageType.SYSTEM,
        recipientName: `Church user: ${user.name}`,
      },
    );

    return {
      sent,
      error: sent
        ? null
        : 'Unable to send credentials SMS. Check the platform SMS outbox for the provider error.',
    };
  }

  private generateTemporaryPassword() {
    const first = Math.random().toString(36).slice(2, 6).toUpperCase();
    const second = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `CS-${first}-${second}`;
  }

  private normalizePermissionList(value: unknown) {
    const valid = new Set(Object.values(ChurchPermission));
    return Array.isArray(value)
      ? ([
          ...new Set(
            value.filter((permission) =>
              valid.has(permission as ChurchPermission),
            ),
          ),
        ] as ChurchPermission[])
      : [];
  }

  private normalizeChurchUserAccess(
    roleValue: string | ChurchUserRole,
    overridesValue: unknown,
    denialsValue: unknown,
  ) {
    const role = normalizeChurchRole(roleValue);
    if (role === ChurchUserRole.PRIEST) {
      return {
        permissionOverrides: null,
        permissionDenials: null,
      };
    }
    const denials = this.normalizePermissionList(denialsValue).filter(
      (permission) => !PRIEST_ONLY_CHURCH_PERMISSIONS.has(permission),
    );
    const denied = new Set(denials);
    const overrides = this.normalizePermissionList(overridesValue).filter(
      (permission) =>
        !PRIEST_ONLY_CHURCH_PERMISSIONS.has(permission) &&
        !denied.has(permission),
    );
    return {
      permissionOverrides: overrides.length > 0 ? overrides : null,
      permissionDenials: denials.length > 0 ? denials : null,
    };
  }

  private normalizeBoolean(value: unknown, fallback: boolean) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
    }

    return Boolean(value);
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
