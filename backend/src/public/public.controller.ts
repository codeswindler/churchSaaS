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
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { DEFAULT_CHURCH_FEATURES } from '../common/access-control';
import {
  buildChurchIntegrationSummary,
  ChurchSmsConfig,
} from '../common/church.utils';
import { ContributionsService } from '../contributions/contributions.service';
import { ChurchCongregationPage } from '../entities/church-congregation-page.entity';
import { ChurchUser, ChurchUserRole } from '../entities/church-user.entity';
import { Church, ChurchStatus } from '../entities/church.entity';
import { ClientEnquiry } from '../entities/client-enquiry.entity';
import {
  Contribution,
  ContributionStatus,
} from '../entities/contribution.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { SmsMessageType } from '../entities/sms-outbox.entity';
import { SmsService } from '../sms/sms.service';
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
    @InjectRepository(ChurchUser)
    private readonly churchUserRepo: Repository<ChurchUser>,
    @InjectRepository(ChurchCongregationPage)
    private readonly congregationPageRepo: Repository<ChurchCongregationPage>,
    @InjectRepository(FundAccount)
    private readonly fundAccountRepo: Repository<FundAccount>,
    @InjectRepository(ClientEnquiry)
    private readonly clientEnquiryRepo: Repository<ClientEnquiry>,
    @InjectRepository(Contribution)
    private readonly contributionRepo: Repository<Contribution>,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepo: Repository<PlatformUser>,
    private readonly smsService: SmsService,
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
              version: 'kjv',
              versionLabel: 'KJV',
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

  @Post('church-signups')
  async createChurchSignup(@Body() body: any) {
    const churchName = this.normalizeRequiredText(
      body.churchName || body.name || body.organizationName,
      'Church name is required',
    );
    const adminName = this.normalizeRequiredText(
      body.adminName || body.contactName,
      'First admin name is required',
    );
    const adminEmail = this.normalizeEmail(body.adminEmail || body.email);
    const adminPhone = this.normalizeOptionalText(
      body.adminPhone || body.phone,
    );
    const contactEmailValue = this.normalizeOptionalText(body.contactEmail);
    const contactEmail = contactEmailValue
      ? this.normalizeEmail(contactEmailValue)
      : adminEmail;
    const contactPhone =
      this.normalizeOptionalText(body.contactPhone) || adminPhone;
    const address = this.normalizeOptionalText(body.address);
    const slug = await this.resolveUniqueChurchSlug(
      this.slugify(body.slug || churchName),
    );
    const adminUsername =
      this.normalizeOptionalText(body.adminUsername) || `${slug}-admin`;

    await this.ensureChurchSignupIdentityAvailable(
      adminEmail,
      adminUsername,
      adminPhone,
    );

    const temporaryPassword = this.generateTemporaryPassword();
    const church = await this.churchRepo.save(
      this.churchRepo.create({
        name: churchName,
        slug,
        contactEmail,
        contactPhone,
        address,
        notes: 'Created from public self-service signup.',
        mpesaEnvironment: 'production',
        enabledFeatures: DEFAULT_CHURCH_FEATURES,
        status: ChurchStatus.ACTIVE,
      }),
    );
    const adminUser = await this.churchUserRepo.save(
      this.churchUserRepo.create({
        churchId: church.id,
        name: adminName,
        email: adminEmail,
        username: adminUsername,
        phone: adminPhone,
        passwordHash: await bcrypt.hash(temporaryPassword, 10),
        role: ChurchUserRole.PRIEST,
        isActive: true,
      }),
    );

    await this.churchSubscriptionsService.initializeSubscription(
      church.id,
      30,
      undefined,
      'Self-service trial',
    );
    await this.seedDefaultFundAccounts(church.id);

    const credentialMessage = [
      `Welcome to Church SaaS, ${adminName}.`,
      `Church: ${churchName}`,
      `Login: ${adminUsername}`,
      `Password: ${temporaryPassword}`,
      'Sign in and complete M-Pesa onboarding.',
    ].join(' ');
    const systemSmsConfig = await this.smsService.resolveSystemSmsConfig(
      church.id,
    );
    const credentialsSent = adminPhone
      ? await this.smsService.sendSms(
          adminPhone,
          credentialMessage,
          systemSmsConfig,
          {
            messageType: SmsMessageType.SYSTEM,
            recipientName: `First admin: ${adminName}`,
          },
        )
      : false;

    await this.createSystemEnquiry({
      organizationName: churchName,
      contactName: adminName,
      email: adminEmail,
      phone: adminPhone,
      status: 'new_signup',
      message: [
        'New self-service church signup.',
        `Church: ${churchName}`,
        `Slug: ${church.slug}`,
        `Church ID: ${church.id}`,
        `First admin: ${adminName}`,
        `Admin email: ${adminEmail}`,
        `Admin phone: ${adminPhone || 'Not provided'}`,
        `Credentials SMS: ${credentialsSent ? 'sent' : 'not sent / pending follow-up'}`,
        address ? `Address: ${address}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    });
    await this.notifyPlatformAdmins(
      church.id,
      `New church signup: ${churchName}. Admin: ${adminName} ${adminPhone || adminEmail}.`,
      systemSmsConfig,
    );

    return {
      churchId: church.id,
      churchName: church.name,
      slug: church.slug,
      adminUser: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        username: adminUser.username,
        phone: adminUser.phone,
      },
      credentialsSent,
      nextStep: 'mpesa_onboarding',
    };
  }

  @Post('church-signup')
  createChurchSignupAlias(@Body() body: any) {
    return this.createChurchSignup(body);
  }

  @Post('church-signups/mpesa-onboarding')
  async submitSignupMpesaOnboarding(@Body() body: any) {
    const churchId = this.normalizeRequiredText(
      body.churchId,
      'Church signup reference is required',
    );
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church signup was not found');
    }

    const contactName =
      this.normalizeOptionalText(body.contactName) || church.name;
    const email = this.normalizeEmail(body.email || church.contactEmail);
    const callbackPhone = this.normalizeOptionalText(
      body.callbackPhone || body.phone || church.contactPhone,
    );
    const rawShortcodeType = (
      this.normalizeOptionalText(body.shortcodeType) ||
      this.normalizeOptionalText(body.paybillType) ||
      'safaricom_paybill'
    ).toLowerCase();
    const guidanceOnlyTypes = [
      'no_paybill',
      'bank_paybill',
      'bank',
      'none',
      'till',
    ];
    const safaricomTypes = ['safaricom_paybill', 'safaricom', 'paybill'];
    if (![...guidanceOnlyTypes, ...safaricomTypes].includes(rawShortcodeType)) {
      throw new BadRequestException(
        'Select Safaricom Paybill, Bank Paybill, or no Paybill.',
      );
    }
    const needsPaybillGuidance =
      Boolean(body.requestCallback) ||
      guidanceOnlyTypes.includes(rawShortcodeType);
    const paybillStatus =
      rawShortcodeType === 'no_paybill' || rawShortcodeType === 'none'
        ? 'No Paybill'
        : guidanceOnlyTypes.includes(rawShortcodeType)
          ? rawShortcodeType === 'till'
            ? 'Till / non-Safaricom collection account'
            : 'Bank Paybill'
          : 'Safaricom Paybill';
    const mpesaShortcode = this.normalizeOptionalText(
      body.mpesaShortcode || body.shortcode,
    );
    const g2AdminUsername = this.normalizeOptionalText(body.g2AdminUsername);
    const businessName = this.normalizeOptionalText(body.businessName);
    const message = this.normalizeOptionalText(body.message);
    const mpesaNumberLabel = 'Paybill number';

    if (!needsPaybillGuidance && !mpesaShortcode) {
      throw new BadRequestException(
        `Enter the ${mpesaNumberLabel.toLowerCase()} or request a callback.`,
      );
    }
    if (!needsPaybillGuidance && !g2AdminUsername) {
      throw new BadRequestException(
        'Enter the Safaricom portal admin username or request guidance.',
      );
    }
    if (!needsPaybillGuidance && !businessName) {
      throw new BadRequestException(
        'Enter the Paybill business name or request guidance.',
      );
    }

    await this.createSystemEnquiry({
      organizationName: church.name,
      contactName,
      email,
      phone: callbackPhone,
      status: needsPaybillGuidance
        ? 'paybill_guidance_requested'
        : 'mpesa_setup_submitted',
      message: [
        needsPaybillGuidance
          ? 'Paybill guidance requested during self-service onboarding.'
          : 'Safaricom Paybill onboarding details submitted.',
        `Church: ${church.name}`,
        `Slug: ${church.slug}`,
        `Church ID: ${church.id}`,
        `Callback phone: ${callbackPhone || 'Not provided'}`,
        `Paybill status: ${paybillStatus}`,
        `${mpesaNumberLabel}: ${mpesaShortcode || 'Not provided'}`,
        `Admin username: ${g2AdminUsername || 'Not provided'}`,
        `Business name: ${businessName || 'Not provided'}`,
        message ? `Notes: ${message}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    });
    const systemSmsConfig = await this.smsService.resolveSystemSmsConfig(
      church.id,
    );
    await this.notifyPlatformAdmins(
      church.id,
      needsPaybillGuidance
        ? `Paybill guidance needed: ${church.name} has ${paybillStatus}. Contact: ${callbackPhone || email}.`
        : `Safaricom Paybill setup submitted by ${church.name}. Paybill: ${mpesaShortcode}.`,
      systemSmsConfig,
    );

    return {
      status: needsPaybillGuidance ? 'paybill_guidance_requested' : 'submitted',
    };
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

  private async createSystemEnquiry(input: {
    organizationName: string;
    contactName: string;
    email: string;
    phone?: string | null;
    message: string;
    status: string;
  }) {
    return this.clientEnquiryRepo.save(
      this.clientEnquiryRepo.create({
        organizationName: input.organizationName,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone || null,
        message: input.message,
        status: input.status,
      }),
    );
  }

  private async notifyPlatformAdmins(
    churchId: string,
    message: string,
    smsConfig?: ChurchSmsConfig,
  ) {
    const admins = await this.platformUserRepo.find({
      where: { isActive: true },
    });
    const resolvedSmsConfig =
      smsConfig || (await this.smsService.resolveSystemSmsConfig(churchId));

    await Promise.allSettled(
      admins
        .filter((admin) => Boolean(admin.phone))
        .map((admin) =>
          this.smsService.sendSms(admin.phone!, message, resolvedSmsConfig, {
            messageType: SmsMessageType.SYSTEM,
            recipientName: `Platform admin: ${admin.name}`,
          }),
        ),
    );
  }

  private async ensureChurchSignupIdentityAvailable(
    email: string,
    username: string,
    phone: string | null,
  ) {
    const churchUserWhere: any[] = [{ email }];
    if (username) {
      churchUserWhere.push({ username });
    }
    if (phone) {
      churchUserWhere.push({ phone });
    }

    const existingChurchUser = await this.churchUserRepo.findOne({
      where: churchUserWhere,
    });
    if (existingChurchUser) {
      throw new BadRequestException(
        'A user with these login details already exists.',
      );
    }

    const platformUserWhere: any[] = [{ email }];
    if (username) {
      platformUserWhere.push({ username });
    }
    if (phone) {
      platformUserWhere.push({ phone });
    }

    const existingPlatformUser = await this.platformUserRepo.findOne({
      where: platformUserWhere,
    });
    if (existingPlatformUser) {
      throw new BadRequestException(
        'These login details are already used by another system account.',
      );
    }
  }

  private generateTemporaryPassword() {
    const first = Math.random().toString(36).slice(2, 6).toUpperCase();
    const second = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `CS-${first}-${second}`;
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
          receiptTemplate:
            'Dear {name}, receipt confirmed: KES {amount} for {account}. Ref {reference}. Thank you.',
        }),
      );
    }
  }

  private async resolveUniqueChurchSlug(baseSlug: string) {
    let candidate = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await this.churchRepo.findOne({
        where: { slug: candidate },
      });
      if (!existing) {
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
}
