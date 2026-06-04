import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { Repository } from 'typeorm';
import {
  ChurchFeature,
  ChurchPermission,
  normalizeChurchRole,
  normalizeFeatureList,
} from '../common/access-control';
import { sanitizeChurchForTenant } from '../common/church.utils';
import { ContributionsService } from '../contributions/contributions.service';
import {
  ChurchCongregationPage,
  CongregationEvent,
  CongregationFundDisplay,
  CongregationGalleryImage,
  CongregationDailyVerse,
  CongregationMassProgram,
  CongregationSermon,
  CongregationServiceTime,
} from '../entities/church-congregation-page.entity';
import { Church } from '../entities/church.entity';
import { ChurchUser, ChurchUserRole } from '../entities/church-user.entity';
import { Contributor } from '../entities/contributor.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { SmsAddressBookContact } from '../entities/sms-address-book-contact.entity';
import { SmsAddressBook } from '../entities/sms-address-book.entity';
import { SmsService } from '../sms/sms.service';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';

const DEFAULT_CONGREGATION_GALLERY_IMAGES: CongregationGalleryImage[] = [
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

function getDefaultGalleryImageName(imageUrl?: string | null) {
  const filename = imageUrl?.split('/').pop() || '';
  const name = filename.replace(/\.(avif|jpe?g|png|webp)$/i, '');
  return /^default_\d+$/i.test(name) ? name : '';
}

@Injectable()
export class ChurchService {
  private readonly receiptTemplateLimit = 306;

  constructor(
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(ChurchCongregationPage)
    private readonly congregationPageRepo: Repository<ChurchCongregationPage>,
    @InjectRepository(ChurchUser)
    private readonly churchUserRepo: Repository<ChurchUser>,
    @InjectRepository(FundAccount)
    private readonly fundAccountRepo: Repository<FundAccount>,
    @InjectRepository(Contributor)
    private readonly contributorRepo: Repository<Contributor>,
    @InjectRepository(SmsAddressBook)
    private readonly addressBookRepo: Repository<SmsAddressBook>,
    @InjectRepository(SmsAddressBookContact)
    private readonly addressBookContactRepo: Repository<SmsAddressBookContact>,
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
    private readonly contributionsService: ContributionsService,
    private readonly smsService: SmsService,
  ) {}

  async getDashboard(churchId: string, query: any = {}) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }

    const enabledFeatures = normalizeFeatureList(church.enabledFeatures);
    const financeEnabled = enabledFeatures.includes(ChurchFeature.FINANCE);
    const subscription =
      await this.churchSubscriptionsService.getChurchSubscriptionStatus(
        churchId,
      );

    if (!financeEnabled) {
      return {
        church: sanitizeChurchForTenant(church),
        enabledFeatures,
        financeEnabled: false,
        subscription,
        reportSummary: {
          totals: {},
          byFundAccount: [],
          accountKpis: [],
          trendByDate: [],
          recentContributions: [],
        },
        activeFundAccounts: 0,
      };
    }

    const [reportSummary, fundAccounts] = await Promise.all([
      this.contributionsService.getChurchReportSummary(churchId, query),
      this.listFundAccounts(churchId),
    ]);

    const contributionTotalsByFundId = new Map(
      (reportSummary.byFundAccount || [])
        .filter((item: any) => item.fundAccountId)
        .map((item: any) => [item.fundAccountId, item]),
    );
    const legacyGeneralTotals = (reportSummary.byFundAccount || [])
      .filter((item: any) => item.code === 'general' && !item.fundAccountId)
      .reduce(
        (totals: { totalAmount: number; count: number }, item: any) => ({
          totalAmount: totals.totalAmount + Number(item.totalAmount || 0),
          count: totals.count + Number(item.count || 0),
        }),
        { totalAmount: 0, count: 0 },
      );
    const accountKpis = fundAccounts
      .filter((item) => item.isActive)
      .map((account) => {
        const contributionTotals = contributionTotalsByFundId.get(account.id);
        const fallbackTotals =
          account.code === 'general'
            ? legacyGeneralTotals
            : { totalAmount: 0, count: 0 };
        return {
          fundAccountId: account.id,
          fundAccountName: account.name,
          code: account.code,
          isActive: account.isActive,
          totalAmount:
            Number(contributionTotals?.totalAmount || 0) +
            fallbackTotals.totalAmount,
          count: Number(contributionTotals?.count || 0) + fallbackTotals.count,
        };
      });

    return {
      church: sanitizeChurchForTenant(church),
      enabledFeatures,
      financeEnabled: true,
      subscription,
      reportSummary: {
        ...reportSummary,
        accountKpis,
      },
      activeFundAccounts: fundAccounts.filter((item) => item.isActive).length,
    };
  }

  async getSubscriptionStatus(churchId: string) {
    return this.churchSubscriptionsService.getChurchSubscriptionStatus(
      churchId,
    );
  }

  async listFundAccounts(churchId: string) {
    await this.ensureGeneralFundAccount(churchId);
    return this.fundAccountRepo.find({
      where: { churchId },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async createFundAccount(churchId: string, body: any) {
    if (!body.name) {
      throw new BadRequestException('Fund account name is required');
    }

    const code = this.slugify(body.code || body.name);
    const existing = await this.fundAccountRepo.findOne({
      where: { churchId, code },
    });
    if (existing) {
      throw new BadRequestException('Fund account code already exists');
    }

    const fundAccount = this.fundAccountRepo.create({
      churchId,
      name: body.name,
      code,
      description: body.description || null,
      isActive: body.isActive ?? true,
      displayOrder: Number(body.displayOrder || 0),
      receiptTemplate:
        this.normalizeReceiptTemplate(body.receiptTemplate) ||
        'Dear {name}, we acknowledge receipt of KES {amount} towards {account}',
    });

    return this.fundAccountRepo.save(fundAccount);
  }

  async updateFundAccount(churchId: string, fundAccountId: string, body: any) {
    const fundAccount = await this.fundAccountRepo.findOne({
      where: { id: fundAccountId, churchId },
    });
    if (!fundAccount) {
      throw new NotFoundException('Fund account not found');
    }

    if (body.code && body.code !== fundAccount.code) {
      const code = this.slugify(body.code);
      const existing = await this.fundAccountRepo.findOne({
        where: { churchId, code },
      });
      if (existing && existing.id !== fundAccount.id) {
        throw new BadRequestException('Fund account code already exists');
      }
      fundAccount.code = code;
    }

    fundAccount.name = body.name ?? fundAccount.name;
    fundAccount.description = body.description ?? fundAccount.description;
    fundAccount.isActive = body.isActive ?? fundAccount.isActive;
    fundAccount.displayOrder = Number(
      body.displayOrder ?? fundAccount.displayOrder,
    );
    fundAccount.receiptTemplate =
      body.receiptTemplate !== undefined
        ? this.normalizeReceiptTemplate(body.receiptTemplate) ||
          fundAccount.receiptTemplate
        : fundAccount.receiptTemplate;

    return this.fundAccountRepo.save(fundAccount);
  }

  async listChurchUsers(churchId: string) {
    const users = await this.churchUserRepo.find({
      where: { churchId },
      order: { createdAt: 'DESC' },
    });
    return users.map(({ passwordHash, ...user }) => user);
  }

  async createChurchUser(churchId: string, body: any) {
    if (!body.name || !body.email || !body.password || !body.role) {
      throw new BadRequestException(
        'Name, email, password, and role are required',
      );
    }

    const existing = await this.churchUserRepo.findOne({
      where: [
        { email: body.email.toLowerCase() },
        { username: body.username || '' },
        { phone: body.phone || '' },
      ],
    });
    if (existing) {
      throw new BadRequestException('Church user already exists');
    }

    const user = this.churchUserRepo.create({
      churchId,
      name: body.name,
      email: body.email.toLowerCase(),
      username: body.username || null,
      phone: body.phone || null,
      passwordHash: await bcrypt.hash(body.password, 10),
      role: normalizeChurchRole(body.role) as ChurchUserRole,
      permissionOverrides: this.normalizePermissionOverrides(
        body.permissionOverrides,
      ),
      isActive: body.isActive ?? true,
    });

    const saved = await this.churchUserRepo.save(user);
    const { passwordHash, ...result } = saved;
    return result;
  }

  async updateChurchUser(churchId: string, userId: string, body: any) {
    const user = await this.churchUserRepo.findOne({
      where: { id: userId, churchId },
    });
    if (!user) {
      throw new NotFoundException('Church user not found');
    }

    if (body.email && body.email.toLowerCase() !== user.email) {
      const existing = await this.churchUserRepo.findOne({
        where: { email: body.email.toLowerCase() },
      });
      if (existing && existing.id !== user.id) {
        throw new BadRequestException('Email already in use');
      }
      user.email = body.email.toLowerCase();
    }

    if (body.username && body.username !== user.username) {
      const existing = await this.churchUserRepo.findOne({
        where: { username: body.username },
      });
      if (existing && existing.id !== user.id) {
        throw new BadRequestException('Username already in use');
      }
      user.username = body.username;
    } else if (body.username === '') {
      user.username = null;
    }

    if (body.phone && body.phone !== user.phone) {
      const existing = await this.churchUserRepo.findOne({
        where: { phone: body.phone },
      });
      if (existing && existing.id !== user.id) {
        throw new BadRequestException('Phone already in use');
      }
      user.phone = body.phone;
    } else if (body.phone === '') {
      user.phone = null;
    }

    user.name = body.name ?? user.name;
    user.role =
      body.role !== undefined
        ? (normalizeChurchRole(body.role) as ChurchUserRole)
        : user.role;
    if (body.permissionOverrides !== undefined) {
      user.permissionOverrides = this.normalizePermissionOverrides(
        body.permissionOverrides,
      );
    }
    user.isActive = body.isActive ?? user.isActive;

    if (body.password) {
      user.passwordHash = await bcrypt.hash(body.password, 10);
    }

    const saved = await this.churchUserRepo.save(user);
    const { passwordHash, ...result } = saved;
    return result;
  }

  async listContributions(churchId: string, query: any) {
    return this.contributionsService.listChurchContributions(churchId, query);
  }

  async createManualContribution(churchId: string, userId: string, body: any) {
    return this.contributionsService.createManualContribution(
      churchId,
      userId,
      body,
    );
  }

  async getReportSummary(churchId: string, query: any) {
    return this.contributionsService.getChurchReportSummary(churchId, query);
  }

  async listContributors(churchId: string, query: any = {}) {
    const qb = this.contributorRepo
      .createQueryBuilder('contributor')
      .where('contributor.churchId = :churchId', { churchId })
      .orderBy('contributor.updatedAt', 'DESC');

    if (query.gender === 'male' || query.gender === 'female') {
      qb.andWhere('contributor.gender = :gender', { gender: query.gender });
    }
    if (query.search) {
      qb.andWhere(
        '(contributor.name LIKE :search OR contributor.phone LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    return qb.getMany();
  }

  async updateContributor(churchId: string, contributorId: string, body: any) {
    const contributor = await this.contributorRepo.findOne({
      where: { id: contributorId, churchId },
    });
    if (!contributor) {
      throw new NotFoundException('Contributor not found');
    }

    if (body.gender !== undefined) {
      contributor.gender =
        body.gender === 'male' || body.gender === 'female' ? body.gender : null;
    }
    if (body.name !== undefined) {
      contributor.name = body.name || contributor.name;
    }
    if (body.phone !== undefined) {
      const phone = this.smsService.normalizeKenyanPhone(body.phone || '');
      if (body.phone && !phone) {
        throw new BadRequestException(
          'Phone must start with 01, 07, 2541, 2547, 1, or 7.',
        );
      }
      contributor.phone = phone;
    }

    return this.contributorRepo.save(contributor);
  }

  async sendBulkMessage(churchId: string, userId: string, body: any) {
    return this.smsService.sendBulkMessages(churchId, userId, {
      audiences: [],
      genderFilter: this.smsService.normalizeGender(
        body.genderFilter || body.contributorTag || body.audienceTag || '',
      ),
      message: body.message,
      pastedContacts: body.pastedContacts,
      addressBookIds: Array.isArray(body.addressBookIds)
        ? body.addressBookIds
        : [],
      fundAccountIds: Array.isArray(body.fundAccountIds)
        ? body.fundAccountIds
        : [],
      smsShortcode: body.smsShortcode,
    });
  }

  async getMessagingConfig(churchId: string) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }

    return {
      defaultSmsShortcode: church.smsShortcode,
      smsShortcodes: this.smsService.getAvailableSmsShortcodes(church),
      fundAccounts: await this.listFundAccounts(churchId),
    };
  }

  async listSmsOutbox(churchId: string, query: any = {}) {
    return this.smsService.listOutbox(churchId, query);
  }

  async exportSmsOutboxCsv(churchId: string, query: any = {}) {
    const rows = await this.smsService.listOutbox(churchId, query);
    const header = [
      'Date',
      'Recipient',
      'Mobile',
      'Type',
      'Units',
      'Provider Status',
      'Delivery Status',
      'Provider Message ID',
      'Message',
    ];
    const csvRows = rows.map((item: any) =>
      [
        item.createdAt ? new Date(item.createdAt).toISOString() : '',
        item.recipientName || item.contributor?.name || '',
        item.isHashedRecipient
          ? 'Hashed Safaricom recipient'
          : item.recipientMobile,
        item.messageType,
        item.estimatedUnits,
        item.providerDescription || item.sendStatus,
        item.deliveryDescription || item.deliveryStatus,
        item.providerMessageId || '',
        item.messageBody || '',
      ].map((value) => this.csvEscape(value)),
    );

    return [header, ...csvRows].map((row) => row.join(',')).join('\n');
  }

  async getSmsUsage(churchId: string, query: any = {}) {
    const rows = await this.smsService.getSmsUsageSummary(churchId, query);
    return (
      rows[0] || {
        churchId,
        messageCount: 0,
        units: 0,
      }
    );
  }

  async listAddressBooks(churchId: string) {
    const rows = await this.addressBookRepo
      .createQueryBuilder('book')
      .loadRelationCountAndMap('book.contactCount', 'book.contacts')
      .where('book.churchId = :churchId', { churchId })
      .orderBy('book.createdAt', 'DESC')
      .getMany();

    return rows;
  }

  async createAddressBook(churchId: string, userId: string, body: any) {
    const name = `${body.name || ''}`.trim();
    if (!name) {
      throw new BadRequestException('Address book name is required');
    }

    const book = await this.addressBookRepo.save(
      this.addressBookRepo.create({
        churchId,
        createdByUserId: userId,
        name,
        description: body.description || null,
        isActive: body.isActive ?? true,
      }),
    );

    if (body.contactsText) {
      const importResult = await this.importAddressBookContacts(
        churchId,
        book.id,
        { contactsText: body.contactsText },
      );
      return { ...book, contactCount: importResult.imported };
    }

    return { ...book, contactCount: 0 };
  }

  async updateAddressBook(churchId: string, addressBookId: string, body: any) {
    const book = await this.addressBookRepo.findOne({
      where: { id: addressBookId, churchId },
    });
    if (!book) {
      throw new NotFoundException('Address book not found');
    }

    if (body.name !== undefined) {
      const name = `${body.name || ''}`.trim();
      if (!name) {
        throw new BadRequestException('Address book name is required');
      }
      book.name = name;
    }
    if (body.description !== undefined) {
      book.description = body.description || null;
    }
    if (body.isActive !== undefined) {
      book.isActive = Boolean(body.isActive);
    }

    return this.addressBookRepo.save(book);
  }

  async listAddressBookContacts(churchId: string, addressBookId: string) {
    await this.ensureAddressBook(churchId, addressBookId);
    return this.addressBookContactRepo.find({
      where: { churchId, addressBookId },
      order: { createdAt: 'DESC' },
    });
  }

  async addAddressBookContact(
    churchId: string,
    addressBookId: string,
    body: any,
  ) {
    await this.ensureAddressBook(churchId, addressBookId);
    const displayName = `${body.name || body.displayName || ''}`.trim();
    const normalizedPhone = this.smsService.normalizeKenyanPhone(
      `${body.phone || body.mobile || ''}`,
    );

    if (!displayName) {
      throw new BadRequestException('Contact name is required');
    }
    if (!normalizedPhone) {
      throw new BadRequestException(
        'Enter a valid Kenyan phone number: 01, 07, 2541, 2547, 1, or 7 format',
      );
    }

    const nameParts = displayName.split(/\s+/).filter(Boolean);
    const contactPayload = {
      firstName: nameParts[0] || null,
      lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
      displayName,
      gender: this.smsService.normalizeGender(body.gender || ''),
      normalizedPhone,
      sourceLabel: 'manual',
    };

    const existing = await this.addressBookContactRepo.findOne({
      where: { churchId, addressBookId, normalizedPhone },
    });

    if (existing) {
      Object.assign(existing, contactPayload);
      const contact = await this.addressBookContactRepo.save(existing);
      return { contact, created: false };
    }

    const contact = await this.addressBookContactRepo.save(
      this.addressBookContactRepo.create({
        churchId,
        addressBookId,
        ...contactPayload,
      }),
    );

    return { contact, created: true };
  }

  async importAddressBookContacts(
    churchId: string,
    addressBookId: string,
    body: any,
  ) {
    await this.ensureAddressBook(churchId, addressBookId);
    const lines = `${body.contactsText || ''}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) => !/^first\s*name\s*,\s*last\s*name\s*,\s*phone/i.test(line),
      )
      .filter(Boolean);
    if (lines.length === 0) {
      throw new BadRequestException('Paste at least one contact');
    }

    const unique = new Map<
      string,
      {
        firstName: string | null;
        lastName: string | null;
        displayName: string | null;
        gender: ReturnType<SmsService['normalizeGender']>;
        normalizedPhone: string;
      }
    >();
    let invalid = 0;

    for (const line of lines) {
      const parsed = this.smsService.parseContactLine(line);
      const normalizedPhone = this.smsService.normalizeKenyanPhone(
        parsed.phone,
      );
      if (!normalizedPhone) {
        invalid += 1;
        continue;
      }

      const nameParts = `${parsed.name || ''}`
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      unique.set(normalizedPhone, {
        firstName: parsed.firstName || nameParts[0] || null,
        lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
        displayName: parsed.name || parsed.firstName || null,
        gender: this.smsService.normalizeGender(parsed.gender || ''),
        normalizedPhone,
      });
    }

    let imported = 0;
    let updated = 0;
    for (const contact of unique.values()) {
      const existing = await this.addressBookContactRepo.findOne({
        where: {
          churchId,
          addressBookId,
          normalizedPhone: contact.normalizedPhone,
        },
      });

      if (existing) {
        existing.firstName = contact.firstName;
        existing.lastName = contact.lastName;
        existing.displayName = contact.displayName;
        existing.gender = contact.gender;
        await this.addressBookContactRepo.save(existing);
        updated += 1;
        continue;
      }

      await this.addressBookContactRepo.save(
        this.addressBookContactRepo.create({
          churchId,
          addressBookId,
          ...contact,
          sourceLabel: 'upload',
        }),
      );
      imported += 1;
    }

    return {
      imported,
      updated,
      invalid,
      duplicatesDropped: Math.max(0, lines.length - invalid - unique.size),
    };
  }

  async getCongregationPage(churchId: string) {
    const [church, page] = await Promise.all([
      this.churchRepo.findOne({ where: { id: churchId } }),
      this.congregationPageRepo.findOne({ where: { churchId } }),
    ]);

    if (!church) {
      throw new NotFoundException('Church not found');
    }

    return page || this.buildDefaultCongregationPage(church);
  }

  async updateCongregationPage(churchId: string, userId: string, body: any) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }

    const existing =
      (await this.congregationPageRepo.findOne({ where: { churchId } })) ||
      this.buildDefaultCongregationPage(church);

    existing.isPublished = true;
    if (body.heroTitle !== undefined) {
      existing.heroTitle = this.normalizeOptionalText(body.heroTitle, 180);
    }
    if (body.welcomeMessage !== undefined) {
      existing.welcomeMessage = this.normalizeOptionalText(
        body.welcomeMessage,
        1400,
      );
    }
    if (body.verseReference !== undefined) {
      existing.verseReference = this.normalizeOptionalText(
        body.verseReference,
        180,
      );
    }
    if (body.verseText !== undefined) {
      existing.verseText = this.normalizeOptionalText(body.verseText, 900);
    }
    existing.dailyVerses = this.normalizeDailyVerses(body.dailyVerses);
    if (body.featuredImageUrl !== undefined) {
      existing.featuredImageUrl = this.normalizeOptionalText(
        body.featuredImageUrl,
        500,
      );
    }
    if (body.contactNote !== undefined) {
      existing.contactNote = this.normalizeOptionalText(body.contactNote, 900);
    }
    existing.serviceTimes = this.normalizeServiceTimes(body.serviceTimes);
    existing.events = this.normalizeEvents(body.events);
    existing.massPrograms = this.normalizeMassPrograms(body.massPrograms);
    existing.sermons = this.normalizeSermons(body.sermons);
    existing.fundDisplays = this.normalizeFundDisplays(body.fundDisplays);
    existing.galleryImages = this.normalizeGalleryImages(body.galleryImages);
    existing.updatedByUserId = userId;

    return this.congregationPageRepo.save(existing);
  }

  async uploadCongregationImage(churchId: string, file: any) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    const extensionByMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    const extension =
      extensionByMime[file.mimetype] || extname(file.originalname || '');

    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extension.toLowerCase())) {
      throw new BadRequestException('Upload a JPG, PNG, or WEBP image');
    }

    if (Number(file.size || 0) > 5 * 1024 * 1024) {
      throw new BadRequestException('Image must be 5MB or smaller');
    }

    const uploadRoot =
      process.env.UPLOAD_ROOT || join(process.cwd(), 'uploads');
    const relativeDir = join('congregation', churchId);
    const absoluteDir = join(uploadRoot, relativeDir);

    if (!existsSync(absoluteDir)) {
      mkdirSync(absoluteDir, { recursive: true });
    }

    const filename = `${Date.now()}-${randomUUID()}${extension.toLowerCase()}`;
    const absolutePath = join(absoluteDir, filename);
    writeFileSync(absolutePath, file.buffer);

    return {
      imageUrl: `/api/uploads/${relativeDir.replace(/\\/g, '/')}/${filename}`,
    };
  }

  private buildDefaultCongregationPage(church: Church) {
    return this.congregationPageRepo.create({
      churchId: church.id,
      isPublished: true,
      heroTitle: `Welcome to ${church.name}`,
      welcomeMessage:
        'Stay connected with worship times, daily encouragement, church events, and programs from your church office.',
      verseReference: 'Psalm 122:1',
      verseText:
        'I rejoiced with those who said to me, let us go to the house of the Lord.',
      dailyVerses: [
        {
          id: randomUUID(),
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
          id: randomUUID(),
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
      contactNote:
        church.contactPhone || church.contactEmail
          ? 'Contact the church office for pastoral support, giving help, or program details.'
          : null,
      updatedByUserId: null,
    });
  }

  private normalizeOptionalText(value: unknown, maxLength: number) {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = `${value}`.trim();
    if (!normalized) {
      return null;
    }

    if (normalized.length > maxLength) {
      throw new BadRequestException(
        `Text value must be ${maxLength} characters or less.`,
      );
    }

    return normalized;
  }

  private normalizeServiceTimes(value: unknown): CongregationServiceTime[] {
    return this.normalizeJsonList(value, 8)
      .map((item) => ({
        id: this.normalizeOptionalText(item.id, 80) || randomUUID(),
        label: this.normalizeOptionalText(item.label, 120),
        time: this.normalizeOptionalText(item.time, 120),
        location: this.normalizeOptionalText(item.location, 180),
      }))
      .filter((item) => item.label && item.time) as CongregationServiceTime[];
  }

  private normalizeEvents(value: unknown): CongregationEvent[] {
    return this.normalizeJsonList(value, 12)
      .map((item) => ({
        id: this.normalizeOptionalText(item.id, 80) || randomUUID(),
        title: this.normalizeOptionalText(item.title, 160),
        date: this.normalizeOptionalText(item.date, 40),
        time: this.normalizeOptionalText(item.time, 80),
        description: this.normalizeOptionalText(item.description, 700),
        imageUrl: this.normalizeOptionalText(item.imageUrl, 500),
      }))
      .filter((item) => item.title) as CongregationEvent[];
  }

  private normalizeDailyVerses(value: unknown): CongregationDailyVerse[] {
    return this.normalizeJsonList(value, 16)
      .map((item) => ({
        id: this.normalizeOptionalText(item.id, 80) || randomUUID(),
        date: this.normalizeOptionalText(item.date, 40),
        reference: this.normalizeOptionalText(item.reference, 180),
        version: this.normalizeOptionalText(item.version, 40),
        versionLabel: this.normalizeOptionalText(item.versionLabel, 80),
        text: this.normalizeOptionalText(item.text, 900),
      }))
      .filter((item) => item.text) as CongregationDailyVerse[];
  }

  private normalizeMassPrograms(value: unknown): CongregationMassProgram[] {
    return this.normalizeJsonList(value, 12)
      .map((item) => ({
        id: this.normalizeOptionalText(item.id, 80) || randomUUID(),
        title: this.normalizeOptionalText(item.title, 160),
        day: this.normalizeOptionalText(item.day, 120),
        time: this.normalizeOptionalText(item.time, 120),
        details: this.normalizeOptionalText(item.details, 800),
      }))
      .filter((item) => item.title) as CongregationMassProgram[];
  }

  private normalizeSermons(value: unknown): CongregationSermon[] {
    return this.normalizeJsonList(value, 24)
      .map((item) => ({
        id: this.normalizeOptionalText(item.id, 80) || randomUUID(),
        title: this.normalizeOptionalText(item.title, 180),
        date: this.normalizeOptionalText(item.date, 40),
        speaker: this.normalizeOptionalText(item.speaker, 160),
        summary: this.normalizeOptionalText(item.summary, 900),
        mediaUrl: this.normalizeOptionalText(item.mediaUrl, 500),
        imageUrl: this.normalizeOptionalText(item.imageUrl, 500),
      }))
      .filter((item) => item.title) as CongregationSermon[];
  }

  private normalizeFundDisplays(value: unknown): CongregationFundDisplay[] {
    return this.normalizeJsonList(value, 12)
      .map((item) => {
        const endMode = item.endMode === 'static' ? 'static' : 'to_date';
        const startDate = this.normalizeDateText(item.startDate);
        const endDate =
          endMode === 'static' ? this.normalizeDateText(item.endDate) : null;

        return {
          id: this.normalizeOptionalText(item.id, 80) || randomUUID(),
          title: this.normalizeOptionalText(item.title, 180),
          description: this.normalizeOptionalText(item.description, 700),
          fundAccountId: this.normalizeOptionalText(item.fundAccountId, 36),
          startDate,
          endMode,
          endDate,
          isActive: item.isActive === false ? false : true,
        };
      })
      .filter((item) => {
        if (!item.fundAccountId || !item.startDate) {
          return false;
        }

        if (item.endMode === 'static' && !item.endDate) {
          return false;
        }

        return true;
      }) as CongregationFundDisplay[];
  }

  private normalizeGalleryImages(value: unknown): CongregationGalleryImage[] {
    return this.normalizeJsonList(value, 16)
      .map((item) => {
        const imageUrl = this.normalizeOptionalText(item.imageUrl, 500);
        const defaultImageName = getDefaultGalleryImageName(imageUrl);

        return {
          id: this.normalizeOptionalText(item.id, 80) || randomUUID(),
          title:
            defaultImageName || this.normalizeOptionalText(item.title, 140),
          imageUrl,
          isActive: item.isActive === false ? false : true,
          isDefault: item.isDefault === true || Boolean(defaultImageName),
        };
      })
      .filter((item) => item.imageUrl) as CongregationGalleryImage[];
  }

  private normalizeJsonList(value: unknown, limit: number): any[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('Expected a list value');
    }

    if (value.length > limit) {
      throw new BadRequestException(`List can contain at most ${limit} items.`);
    }

    return value.filter((item) => item && typeof item === 'object');
  }

  private normalizeDateText(value: unknown) {
    const normalized = this.normalizeOptionalText(value, 40);
    if (!normalized) {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException('Date values must use YYYY-MM-DD format.');
    }

    return normalized;
  }

  private async ensureAddressBook(churchId: string, addressBookId: string) {
    const book = await this.addressBookRepo.findOne({
      where: { id: addressBookId, churchId },
    });
    if (!book) {
      throw new NotFoundException('Address book not found');
    }
    return book;
  }

  private async ensureGeneralFundAccount(churchId: string) {
    const existing = await this.fundAccountRepo.findOne({
      where: { churchId, code: 'general' },
    });

    if (existing) {
      return existing;
    }

    return this.fundAccountRepo.save(
      this.fundAccountRepo.create({
        churchId,
        name: 'General',
        code: 'general',
        description:
          'Fallback account for payments whose account reference does not match a configured fund account.',
        isActive: true,
        displayOrder: 999,
        receiptTemplate:
          'Dear {name}, we acknowledge receipt of KES {amount} towards {account}',
      }),
    );
  }

  private normalizeReceiptTemplate(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const template = `${value}`.trim();
    if (template.length > this.receiptTemplateLimit) {
      throw new BadRequestException(
        `Receipt template must be ${this.receiptTemplateLimit} characters or less.`,
      );
    }
    return template;
  }

  private slugify(value: string) {
    return `${value || ''}`
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private normalizePermissionOverrides(value: unknown) {
    if (!Array.isArray(value)) {
      return null;
    }

    const valid = new Set(Object.values(ChurchPermission));
    return value.filter((permission) =>
      valid.has(permission as ChurchPermission),
    ) as ChurchPermission[];
  }

  private csvEscape(value: unknown) {
    const text = `${value ?? ''}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
}
