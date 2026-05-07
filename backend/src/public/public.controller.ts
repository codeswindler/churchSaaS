import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildChurchIntegrationSummary } from '../common/church.utils';
import { ContributionsService } from '../contributions/contributions.service';
import { ChurchCongregationPage } from '../entities/church-congregation-page.entity';
import { Church, ChurchStatus } from '../entities/church.entity';
import { ClientEnquiry } from '../entities/client-enquiry.entity';
import {
  Contribution,
  ContributionStatus,
} from '../entities/contribution.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';

const DEFAULT_CONGREGATION_GALLERY_IMAGES = [
  {
    id: 'default_1',
    title: 'default_1',
    imageUrl: '/congregation-defaults/default_1.jpg',
    isActive: true,
    isDefault: true,
  },
  {
    id: 'default_2',
    title: 'default_2',
    imageUrl: '/congregation-defaults/default_2.jpg',
    isActive: true,
    isDefault: true,
  },
  {
    id: 'default_3',
    title: 'default_3',
    imageUrl: '/congregation-defaults/default_3.avif',
    isActive: true,
    isDefault: true,
  },
  {
    id: 'default_4',
    title: 'default_4',
    imageUrl: '/congregation-defaults/default_4.jpg',
    isActive: true,
    isDefault: true,
  },
  {
    id: 'default_5',
    title: 'default_5',
    imageUrl: '/congregation-defaults/default_5.jpg',
    isActive: true,
    isDefault: true,
  },
];

@Controller('public')
export class PublicController {
  constructor(
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(ChurchCongregationPage)
    private readonly congregationPageRepo: Repository<ChurchCongregationPage>,
    @InjectRepository(FundAccount)
    private readonly fundAccountRepo: Repository<FundAccount>,
    @InjectRepository(ClientEnquiry)
    private readonly clientEnquiryRepo: Repository<ClientEnquiry>,
    @InjectRepository(Contribution)
    private readonly contributionRepo: Repository<Contribution>,
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
    private readonly contributionsService: ContributionsService,
  ) {}

  @Get('churches/:slug/config')
  async getChurchConfig(@Param('slug') slug: string) {
    const church = await this.churchRepo.findOne({ where: { slug } });
    if (!church || church.status !== ChurchStatus.ACTIVE) {
      throw new NotFoundException('Church not found');
    }

    const subscription =
      await this.churchSubscriptionsService.getChurchSubscriptionStatus(
        church.id,
      );

    const fundAccounts =
      subscription.status === 'suspended'
        ? []
        : await this.fundAccountRepo.find({
            where: { churchId: church.id, isActive: true },
            order: { displayOrder: 'ASC', createdAt: 'ASC' },
          });
    const integrations = buildChurchIntegrationSummary(church);
    const acceptingContributions = subscription.status !== 'suspended';

    return {
      church: {
        id: church.id,
        name: church.name,
        slug: church.slug,
        logoUrl: church.logoUrl,
      },
      subscription,
      integrations,
      acceptingContributions,
      fundAccounts: acceptingContributions ? fundAccounts : [],
      paymentInstructions: {
        channel: 'mpesa',
        shortcode: church.mpesaShortcode || null,
        supportsStkPush: integrations.mpesaStkConfigured,
        referenceHint: integrations.mpesaStkConfigured
          ? 'Enter your phone number and amount to receive an M-Pesa STK prompt.'
          : 'Pay using the church M-Pesa account, then submit the receipt/reference here.',
      },
    };
  }

  @Get('churches/:slug/congregation')
  async getCongregationPage(@Param('slug') slug: string) {
    const church = await this.churchRepo.findOne({ where: { slug } });
    if (!church || church.status !== ChurchStatus.ACTIVE) {
      throw new NotFoundException('Church not found');
    }

    const page = await this.congregationPageRepo.findOne({
      where: { churchId: church.id },
    });
    const basePage = page
      ? { ...page, isPublished: true }
      : {
          isPublished: true,
          heroTitle: `Welcome to ${church.name}`,
          welcomeMessage:
            'Stay connected with worship times, daily encouragement, church events, and programs from your church office.',
          verseReference: 'Psalm 122:1',
          verseText:
            'I rejoiced with those who said to me, let us go to the house of the Lord.',
          dailyVerses: [
            {
              date: new Date().toISOString().slice(0, 10),
              reference: 'Psalm 122:1',
              text: 'I rejoiced with those who said to me, let us go to the house of the Lord.',
            },
          ],
          featuredImageUrl: null,
          serviceTimes: [
            {
              label: 'Sunday Service',
              time: '10:00 AM',
              location: church.address || 'Main sanctuary',
            },
          ],
          events: [],
          massPrograms: [],
          sermons: [],
          fundDisplays: [],
          galleryImages: DEFAULT_CONGREGATION_GALLERY_IMAGES,
          contactNote: null,
          updatedAt: null,
        };

    return {
      church: {
        id: church.id,
        name: church.name,
        slug: church.slug,
        logoUrl: church.logoUrl,
        contactEmail: church.contactEmail,
        contactPhone: church.contactPhone,
        address: church.address,
      },
      page: {
        ...basePage,
        fundDisplays: await this.resolvePublicFundDisplays(
          church.id,
          basePage.fundDisplays || [],
        ),
      },
      givingUrl: `/c/${church.slug}/give`,
    };
  }

  @Post('churches/:slug/contributions/mpesa')
  createPublicContribution(@Param('slug') slug: string, @Body() body: any) {
    return this.contributionsService.createPublicMpesaContribution(slug, body);
  }

  @Post('churches/:slug/contributions/stk')
  initiatePublicStkContribution(
    @Param('slug') slug: string,
    @Body() body: any,
  ) {
    return this.contributionsService.initiatePublicStkContribution(slug, body);
  }

  @Post('enquiries')
  async createPublicEnquiry(@Body() body: any) {
    const organizationName = this.normalizeRequiredText(
      body.organizationName || body.churchName,
      'Organization name is required',
    );
    const contactName = this.normalizeRequiredText(
      body.contactName,
      'Contact name is required',
    );
    const email = this.normalizeEmail(body.email);
    const phone = this.normalizeOptionalText(body.phone);
    const message = this.normalizeRequiredText(
      body.message,
      'Enquiry message is required',
    );

    const enquiry = await this.clientEnquiryRepo.save(
      this.clientEnquiryRepo.create({
        organizationName,
        contactName,
        email,
        phone,
        message,
        status: 'new',
      }),
    );

    return {
      id: enquiry.id,
      status: enquiry.status,
      submittedAt: enquiry.createdAt,
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

  private normalizeRequiredText(value: unknown, message: string) {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      throw new BadRequestException(message);
    }
    return normalized;
  }

  private normalizeEmail(value: unknown) {
    const normalized = this.normalizeRequiredText(
      value,
      'Contact email is required',
    ).toLowerCase();

    if (!normalized.includes('@')) {
      throw new BadRequestException('A valid contact email is required');
    }

    return normalized;
  }

  private async resolvePublicFundDisplays(churchId: string, displays: any[]) {
    const activeDisplays = Array.isArray(displays)
      ? displays.filter(
          (display) =>
            display?.isActive !== false &&
            display?.fundAccountId &&
            display?.startDate,
        )
      : [];
    if (activeDisplays.length === 0) {
      return [];
    }

    const fundAccountIds = Array.from(
      new Set(activeDisplays.map((display) => display.fundAccountId)),
    );
    const fundAccounts = await this.fundAccountRepo
      .createQueryBuilder('fundAccount')
      .where('fundAccount.churchId = :churchId', { churchId })
      .andWhere('fundAccount.id IN (:...fundAccountIds)', { fundAccountIds })
      .andWhere('fundAccount.isActive = :isActive', { isActive: true })
      .getMany();
    const fundAccountById = new Map(
      fundAccounts.map((fundAccount) => [fundAccount.id, fundAccount]),
    );

    const resolved: any[] = [];
    for (const display of activeDisplays) {
      const fundAccount = fundAccountById.get(display.fundAccountId);
      if (!fundAccount) {
        continue;
      }

      const startDate = this.parseDateBoundary(display.startDate, 'start');
      const endMode = display.endMode === 'static' ? 'static' : 'to_date';
      const endDate =
        endMode === 'static' && display.endDate
          ? this.parseDateBoundary(display.endDate, 'end')
          : null;
      const totals = await this.getFundDisplayTotals(
        churchId,
        fundAccount.id,
        startDate,
        endDate,
      );

      resolved.push({
        id: display.id,
        title: display.title || fundAccount.name,
        description: display.description || null,
        fundAccountId: fundAccount.id,
        fundAccountName: fundAccount.name,
        fundAccountCode: fundAccount.code,
        startDate: display.startDate,
        endMode,
        endDate: endMode === 'static' ? display.endDate || null : null,
        totalAmount: totals.totalAmount,
        contributionCount: totals.contributionCount,
        lastContributionAt: totals.lastContributionAt,
      });
    }

    return resolved;
  }

  private async getFundDisplayTotals(
    churchId: string,
    fundAccountId: string,
    startDate: Date,
    endDate: Date | null,
  ) {
    const qb = this.contributionRepo
      .createQueryBuilder('contribution')
      .select('COALESCE(SUM(contribution.amount), 0)', 'totalAmount')
      .addSelect('COUNT(contribution.id)', 'contributionCount')
      .addSelect(
        'MAX(COALESCE(contribution.receivedAt, contribution.createdAt))',
        'lastContributionAt',
      )
      .where('contribution.churchId = :churchId', { churchId })
      .andWhere('contribution.fundAccountId = :fundAccountId', {
        fundAccountId,
      })
      .andWhere('contribution.status = :status', {
        status: ContributionStatus.CONFIRMED,
      })
      .andWhere(
        'COALESCE(contribution.receivedAt, contribution.createdAt) >= :startDate',
        { startDate },
      );

    if (endDate) {
      qb.andWhere(
        'COALESCE(contribution.receivedAt, contribution.createdAt) <= :endDate',
        { endDate },
      );
    }

    const raw = await qb.getRawOne();
    return {
      totalAmount: Number(raw?.totalAmount || 0),
      contributionCount: Number(raw?.contributionCount || 0),
      lastContributionAt: raw?.lastContributionAt || null,
    };
  }

  private parseDateBoundary(value: string, boundary: 'start' | 'end') {
    const [year, month, day] = `${value || ''}`.split('-').map(Number);
    if (!year || !month || !day) {
      return new Date();
    }

    return boundary === 'end'
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0);
  }
}
