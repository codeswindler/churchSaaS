import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import ExcelJS from 'exceljs';
import {
  ChurchFeature,
  ChurchPermission,
  PERMISSION_FEATURE_MAP,
  PRIEST_ONLY_CHURCH_PERMISSIONS,
  normalizeChurchRole,
  normalizeFeatureList,
  resolveChurchPermissions,
} from '../common/access-control';
import {
  sanitizeChurchForTenant,
  sanitizeSubscriptionForTenant,
} from '../common/church.utils';
import { getDefaultReceiptTemplateForFundCode } from '../common/receipt-templates';
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
import {
  ChurchNotification,
  ChurchNotificationType,
} from '../entities/church-notification.entity';
import { Church } from '../entities/church.entity';
import { ChurchUser, ChurchUserRole } from '../entities/church-user.entity';
import {
  Contribution,
  ContributionStatus,
} from '../entities/contribution.entity';
import { Contributor } from '../entities/contributor.entity';
import {
  DiscipleshipAttendance,
  DiscipleshipAttendanceType,
} from '../entities/discipleship-attendance.entity';
import {
  DiscipleshipDuplicateReview,
  DiscipleshipDuplicateReviewStatus,
} from '../entities/discipleship-duplicate-review.entity';
import { DiscipleshipGroup } from '../entities/discipleship-group.entity';
import {
  DiscipleshipMatchCandidate,
  DiscipleshipMatchCandidateStatus,
} from '../entities/discipleship-match-candidate.entity';
import { DiscipleshipMemberAlias } from '../entities/discipleship-member-alias.entity';
import { DiscipleshipMemberContributor } from '../entities/discipleship-member-contributor.entity';
import {
  DiscipleshipMember,
  DiscipleshipMemberStatus,
} from '../entities/discipleship-member.entity';
import { DiscipleshipMembership } from '../entities/discipleship-membership.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { SmsAddressBookContact } from '../entities/sms-address-book-contact.entity';
import { SmsAddressBook } from '../entities/sms-address-book.entity';
import { SmsMessageType } from '../entities/sms-outbox.entity';
import { SmsService } from '../sms/sms.service';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';
import { MobilePushService } from '../mobile/mobile-push.service';

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
const DEFAULT_DISCIPLESHIP_SERVICE_GROUP = 'Church Service';

type TransactionDiscipleshipIdentity = {
  key: string;
  contributorIds: string[];
  names: string[];
  fullName: string;
  phone: string | null;
  providerPayerIds: string[];
  gender: string | null;
  firstContributionAt: unknown;
  nameKey: string;
};

function getDefaultGalleryImageName(imageUrl?: string | null) {
  const filename = imageUrl?.split('/').pop() || '';
  const name = filename.replace(/\.(avif|jpe?g|png|webp)$/i, '');
  return /^default_\d+$/i.test(name) ? name : '';
}

@Injectable()
export class ChurchService {
  private readonly logger = new Logger(ChurchService.name);
  private readonly receiptTemplateLimit = 459;
  private readonly discipleshipTransactionSyncs = new Map<
    string,
    Promise<any>
  >();
  private readonly discipleshipLastSyncedAt = new Map<string, number>();
  private fundDisplayCleanupRunning = false;

  constructor(
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(ChurchCongregationPage)
    private readonly congregationPageRepo: Repository<ChurchCongregationPage>,
    @InjectRepository(ChurchNotification)
    private readonly churchNotificationRepo: Repository<ChurchNotification>,
    @InjectRepository(ChurchUser)
    private readonly churchUserRepo: Repository<ChurchUser>,
    @InjectRepository(FundAccount)
    private readonly fundAccountRepo: Repository<FundAccount>,
    @InjectRepository(Contributor)
    private readonly contributorRepo: Repository<Contributor>,
    @InjectRepository(Contribution)
    private readonly contributionRepo: Repository<Contribution>,
    @InjectRepository(DiscipleshipMember)
    private readonly discipleshipMemberRepo: Repository<DiscipleshipMember>,
    @InjectRepository(DiscipleshipGroup)
    private readonly discipleshipGroupRepo: Repository<DiscipleshipGroup>,
    @InjectRepository(DiscipleshipMembership)
    private readonly discipleshipMembershipRepo: Repository<DiscipleshipMembership>,
    @InjectRepository(DiscipleshipMemberAlias)
    private readonly discipleshipMemberAliasRepo: Repository<DiscipleshipMemberAlias>,
    @InjectRepository(DiscipleshipMemberContributor)
    private readonly discipleshipMemberContributorRepo: Repository<DiscipleshipMemberContributor>,
    @InjectRepository(DiscipleshipMatchCandidate)
    private readonly discipleshipMatchCandidateRepo: Repository<DiscipleshipMatchCandidate>,
    @InjectRepository(DiscipleshipAttendance)
    private readonly discipleshipAttendanceRepo: Repository<DiscipleshipAttendance>,
    @InjectRepository(DiscipleshipDuplicateReview)
    private readonly discipleshipDuplicateReviewRepo: Repository<DiscipleshipDuplicateReview>,
    @InjectRepository(SmsAddressBook)
    private readonly addressBookRepo: Repository<SmsAddressBook>,
    @InjectRepository(SmsAddressBookContact)
    private readonly addressBookContactRepo: Repository<SmsAddressBookContact>,
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
    private readonly contributionsService: ContributionsService,
    private readonly smsService: SmsService,
    private readonly dataSource: DataSource,
    private readonly mobilePushService: MobilePushService,
  ) {}

  async getDashboard(churchId: string, query: any = {}) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }

    const enabledFeatures = normalizeFeatureList(church.enabledFeatures);
    const financeEnabled = enabledFeatures.includes(ChurchFeature.FINANCE);
    const rawSubscription =
      await this.churchSubscriptionsService.getChurchSubscriptionStatus(
        churchId,
      );
    const subscription = sanitizeSubscriptionForTenant(rawSubscription);

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

  async getDiscipleshipSummary(churchId: string) {
    this.triggerDiscipleshipTransactionSync(churchId);
    const today = this.getNairobiDateParts();
    const monthStart = `${today.date.slice(0, 8)}01`;
    const [
      totalMembers,
      activeMembers,
      newThisMonth,
      groups,
      presentToday,
      duplicateClusterData,
    ] = await Promise.all([
      this.discipleshipMemberRepo.count({ where: { churchId } }),
      this.discipleshipMemberRepo.count({
        where: { churchId, status: DiscipleshipMemberStatus.ACTIVE },
      }),
      this.discipleshipMemberRepo
        .createQueryBuilder('member')
        .where('member.churchId = :churchId', { churchId })
        .andWhere('member.enrollmentDate >= :monthStart', { monthStart })
        .getCount(),
      this.discipleshipGroupRepo.count({
        where: { churchId, isActive: true },
      }),
      this.discipleshipAttendanceRepo.count({
        where: { churchId, attendanceDate: today.date },
      }),
      this.buildDiscipleshipDuplicateClusterCandidates(churchId),
    ]);

    const recentAttendance = await this.discipleshipAttendanceRepo.find({
      where: { churchId },
      relations: ['member', 'group', 'markedByUser'],
      order: { attendanceDate: 'DESC', createdAt: 'DESC' },
      take: 8,
    });

    return {
      today,
      totals: {
        totalMembers,
        activeMembers,
        inactiveMembers: Math.max(0, totalMembers - activeMembers),
        newThisMonth,
        activeGroups: groups,
        presentToday,
        duplicateReviews: duplicateClusterData.duplicateGroups.length,
      },
      recentAttendance,
      syncing: this.discipleshipTransactionSyncs.has(churchId),
    };
  }

  async listDiscipleshipGroups(churchId: string) {
    this.triggerDiscipleshipTransactionSync(churchId);
    const groups = await this.discipleshipGroupRepo.find({
      where: { churchId },
      order: { isActive: 'DESC', name: 'ASC' },
    });

    if (groups.length === 0) {
      return [];
    }

    const counts = await this.discipleshipMembershipRepo
      .createQueryBuilder('membership')
      .select('membership.groupId', 'groupId')
      .addSelect('COUNT(membership.id)', 'memberCount')
      .where('membership.churchId = :churchId', { churchId })
      .groupBy('membership.groupId')
      .getRawMany();
    const countByGroupId = new Map(
      counts.map((item) => [item.groupId, Number(item.memberCount || 0)]),
    );

    return groups.map((group) => ({
      ...group,
      memberCount: countByGroupId.get(group.id) || 0,
    }));
  }

  async createDiscipleshipGroup(churchId: string, body: any) {
    const name = this.normalizeOptionalText(body.name, 160);
    if (!name) {
      throw new BadRequestException('Group name is required');
    }

    const existing = await this.discipleshipGroupRepo.findOne({
      where: { churchId, name },
    });
    if (existing) {
      throw new BadRequestException(
        'A discipleship group with this name exists',
      );
    }

    const group = await this.discipleshipGroupRepo.save(
      this.discipleshipGroupRepo.create({
        churchId,
        name,
        description: this.normalizeOptionalText(body.description, 700),
        isActive: this.normalizeBoolean(body.isActive, true),
      }),
    );

    return { ...group, memberCount: 0 };
  }

  async updateDiscipleshipGroup(churchId: string, groupId: string, body: any) {
    const group = await this.discipleshipGroupRepo.findOne({
      where: { id: groupId, churchId },
    });
    if (!group) {
      throw new NotFoundException('Discipleship group not found');
    }

    if (body.name !== undefined) {
      const name = this.normalizeOptionalText(body.name, 160);
      if (!name) {
        throw new BadRequestException('Group name is required');
      }
      if (name !== group.name) {
        const existing = await this.discipleshipGroupRepo.findOne({
          where: { churchId, name },
        });
        if (existing && existing.id !== group.id) {
          throw new BadRequestException(
            'A discipleship group with this name exists',
          );
        }
      }
      group.name = name;
    }
    if (body.description !== undefined) {
      group.description = this.normalizeOptionalText(body.description, 700);
    }
    if (body.isActive !== undefined) {
      group.isActive = this.normalizeBoolean(body.isActive, group.isActive);
    }

    const saved = await this.discipleshipGroupRepo.save(group);
    const memberCount = await this.discipleshipMembershipRepo.count({
      where: { churchId, groupId },
    });
    return { ...saved, memberCount };
  }

  async listDiscipleshipMembers(churchId: string, query: any = {}) {
    this.triggerDiscipleshipTransactionSync(churchId);
    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.min(Math.max(Number(query.limit || 25), 1), 100);
    const qb = this.discipleshipMemberRepo
      .createQueryBuilder('member')
      .where('member.churchId = :churchId', { churchId })
      .orderBy('member.fullName', 'ASC');

    if (query.search) {
      const search = `%${query.search}%`;
      const matchingAliases = await this.discipleshipMemberAliasRepo
        .createQueryBuilder('alias')
        .select('alias.memberId', 'memberId')
        .where('alias.churchId = :churchId', { churchId })
        .andWhere('alias.alias LIKE :search', { search })
        .getRawMany();
      const aliasMemberIds = matchingAliases.map((item) => item.memberId);
      qb.andWhere(
        aliasMemberIds.length > 0
          ? '(member.fullName LIKE :search OR member.phone LIKE :search OR member.email LIKE :search OR member.id IN (:...aliasMemberIds))'
          : '(member.fullName LIKE :search OR member.phone LIKE :search OR member.email LIKE :search)',
        { search, aliasMemberIds },
      );
    }
    if (query.status === 'active' || query.status === 'inactive') {
      qb.andWhere('member.status = :status', { status: query.status });
    }
    if (query.groupId) {
      const memberships = await this.discipleshipMembershipRepo.find({
        where: { churchId, groupId: query.groupId },
      });
      const memberIds = memberships.map((item) => item.memberId);
      if (memberIds.length === 0) {
        return {
          items: [],
          pagination: { page, limit, total: 0, totalPages: 1 },
          syncing: this.discipleshipTransactionSyncs.has(churchId),
        };
      }
      qb.andWhere('member.id IN (:...memberIds)', { memberIds });
    }

    const [members, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      items: await this.withDiscipleshipMemberGroups(members, {
        includeContributionSummary: false,
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
      syncing: this.discipleshipTransactionSyncs.has(churchId),
    };
  }

  async createDiscipleshipMember(
    churchId: string,
    createdByUserId: string,
    body: any,
    userRole?: string | null,
  ) {
    const fullName = this.normalizeOptionalText(
      body.fullName || body.name,
      180,
    );
    if (!fullName) {
      throw new BadRequestException('Member name is required');
    }
    const phone = this.normalizeOptionalText(body.phone, 40);
    if (!phone) {
      throw new BadRequestException('Member phone is required');
    }
    const gender = this.normalizeGenderText(body.gender);
    if (!gender || !['male', 'female'].includes(gender)) {
      throw new BadRequestException('Member gender must be male or female');
    }
    const duplicate = await this.findDiscipleshipCreateConflict(
      churchId,
      fullName,
      phone,
    );
    if (duplicate) {
      throw new ConflictException(
        `${duplicate.reason}: ${duplicate.member.fullName}. Open the existing disciple record instead of creating another one.`,
      );
    }

    const member = await this.discipleshipMemberRepo.save(
      this.discipleshipMemberRepo.create({
        churchId,
        fullName,
        phone,
        email: this.normalizeOptionalText(body.email, 160),
        gender,
        enrollmentDate:
          this.normalizeDateOnly(body.enrollmentDate) ||
          (this.normalizeBoolean(body.isFirstTimeAtChurch, false)
            ? this.getNairobiDateParts().date
            : null),
        isFirstTimeAtChurch: this.normalizeNullableBoolean(
          body.isFirstTimeAtChurch,
        ),
        hasChurchRole: this.normalizeNullableBoolean(body.hasChurchRole),
        churchRoleNotes: this.normalizeOptionalText(body.churchRoleNotes, 1200),
        status: DiscipleshipMemberStatus.ACTIVE,
        notes: this.normalizeOptionalText(body.notes, 1200),
        createdByUserId,
      }),
    );

    await this.syncDiscipleshipMemberGroups(churchId, member.id, body.groupIds);
    await this.ensureDiscipleshipMemberAlias(
      churchId,
      member.id,
      member.fullName,
      'manual',
    );

    return (
      await this.withDiscipleshipMemberGroups([member], {
        includeContributionSummary: this.isPriestRole(userRole),
      })
    )[0];
  }

  async updateDiscipleshipMember(
    churchId: string,
    memberId: string,
    body: any,
    userRole?: string | null,
  ) {
    const member = await this.discipleshipMemberRepo.findOne({
      where: { id: memberId, churchId },
    });
    if (!member) {
      throw new NotFoundException('Discipleship member not found');
    }

    if (body.fullName !== undefined || body.name !== undefined) {
      const fullName = this.normalizeOptionalText(
        body.fullName || body.name,
        180,
      );
      if (!fullName) {
        throw new BadRequestException('Member name is required');
      }
      member.fullName = fullName;
    }
    if (body.phone !== undefined) {
      member.phone = this.normalizeOptionalText(body.phone, 40);
    }
    if (body.email !== undefined) {
      member.email = this.normalizeOptionalText(body.email, 160);
    }
    if (body.gender !== undefined) {
      member.gender = this.normalizeGenderText(body.gender);
    }
    if (body.enrollmentDate !== undefined) {
      member.enrollmentDate = this.normalizeDateOnly(body.enrollmentDate);
    }
    if (body.isFirstTimeAtChurch !== undefined) {
      member.isFirstTimeAtChurch = this.normalizeNullableBoolean(
        body.isFirstTimeAtChurch,
      );
      if (member.isFirstTimeAtChurch && !member.enrollmentDate) {
        member.enrollmentDate = this.getNairobiDateParts().date;
      }
    }
    if (body.hasChurchRole !== undefined) {
      member.hasChurchRole = this.normalizeNullableBoolean(body.hasChurchRole);
    }
    if (body.churchRoleNotes !== undefined) {
      member.churchRoleNotes = this.normalizeOptionalText(
        body.churchRoleNotes,
        1200,
      );
    }
    member.status = DiscipleshipMemberStatus.ACTIVE;
    if (body.notes !== undefined) {
      member.notes = this.normalizeOptionalText(body.notes, 1200);
    }

    const saved = await this.discipleshipMemberRepo.save(member);
    await this.ensureDiscipleshipMemberAlias(
      churchId,
      saved.id,
      saved.fullName,
      'manual',
    );
    if (body.groupIds !== undefined) {
      await this.syncDiscipleshipMemberGroups(
        churchId,
        memberId,
        body.groupIds,
      );
    }

    return (
      await this.withDiscipleshipMemberGroups([saved], {
        includeContributionSummary: this.isPriestRole(userRole),
      })
    )[0];
  }

  async generateDiscipleshipMemberImportTemplate() {
    const headers = [
      'fullName',
      'phone',
      'email',
      'gender',
      'firstTimeAtChurch',
      'enrollmentDate',
      'groups',
      'churchRoleNotes',
      'notes',
    ];
    const example = [
      'Geoffrey Mwangi',
      '254724000000',
      'geoffrey@example.com',
      'male',
      'yes',
      this.getNairobiDateParts().date,
      'Youth, Choir',
      'Choir member',
      'Optional notes',
    ];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Members');
    sheet.columns = [
      { header: headers[0], key: headers[0], width: 24 },
      { header: headers[1], key: headers[1], width: 18 },
      { header: headers[2], key: headers[2], width: 28 },
      { header: headers[3], key: headers[3], width: 14 },
      { header: headers[4], key: headers[4], width: 18 },
      { header: headers[5], key: headers[5], width: 18 },
      { header: headers[6], key: headers[6], width: 30 },
      { header: headers[7], key: headers[7], width: 36 },
      { header: headers[8], key: headers[8], width: 36 },
    ];
    sheet.addRow(example);
    sheet.addRow([
      'Required',
      'Required',
      'Optional',
      'Required: male or female',
      'Optional: yes or no',
      'Optional: YYYY-MM-DD',
      'Optional: existing group names, comma separated',
      'Optional: role or small Christian community notes',
      'Optional',
    ]);
    sheet.getRow(1).font = { bold: true };
    const output = await workbook.xlsx.writeBuffer();
    return Buffer.from(output);
  }

  async importDiscipleshipMembers(
    churchId: string,
    createdByUserId: string,
    file: any,
    userRole?: string | null,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Upload a completed member template');
    }
    const rows = await this.parseDiscipleshipMemberImportRows(file);
    if (rows.length === 0) {
      throw new BadRequestException('The uploaded file has no member rows');
    }

    await this.ensureChurchServiceDiscipleshipGroup(churchId);
    const activeGroups = await this.discipleshipGroupRepo.find({
      where: { churchId, isActive: true },
    });
    const groupIdByName = new Map(
      activeGroups.map((group) => [
        this.normalizeImportKey(group.name),
        group.id,
      ]),
    );
    const issues: {
      row: number;
      member?: string;
      severity: 'warning' | 'error';
      message: string;
    }[] = [];
    const createdMembers: DiscipleshipMember[] = [];
    let skipped = 0;
    let assignedGroups = 0;

    for (const row of rows) {
      const fullName = this.normalizeOptionalText(row.fullName, 180);
      if (!fullName) {
        skipped += 1;
        issues.push({
          row: row.rowNumber,
          severity: 'error',
          message: 'Full name is required',
        });
        continue;
      }
      const phone = this.normalizeOptionalText(row.phone, 40);
      if (!phone) {
        skipped += 1;
        issues.push({
          row: row.rowNumber,
          member: fullName,
          severity: 'error',
          message: 'Phone number is required',
        });
        continue;
      }
      const gender = this.normalizeGenderText(row.gender);
      if (!gender || !['male', 'female'].includes(gender)) {
        skipped += 1;
        issues.push({
          row: row.rowNumber,
          member: fullName,
          severity: 'error',
          message: 'Gender must be male or female',
        });
        continue;
      }
      const duplicate = await this.findDiscipleshipCreateConflict(
        churchId,
        fullName,
        phone,
      );
      if (duplicate) {
        skipped += 1;
        issues.push({
          row: row.rowNumber,
          member: fullName,
          severity: 'warning',
          message: `${duplicate.reason}: ${duplicate.member.fullName}`,
        });
        continue;
      }

      let enrollmentDate: string | null = null;
      const isFirstTimeAtChurch = this.normalizeNullableBoolean(
        row.firstTimeAtChurch,
      );
      try {
        enrollmentDate =
          this.normalizeDateOnly(row.enrollmentDate) ||
          (isFirstTimeAtChurch ? this.getNairobiDateParts().date : null);
      } catch (error: any) {
        skipped += 1;
        issues.push({
          row: row.rowNumber,
          member: fullName,
          severity: 'error',
          message: error?.message || 'Enrollment date is invalid',
        });
        continue;
      }

      const groupNames = this.splitImportGroups(row.groups);
      const groupIds: string[] = [];
      groupNames.forEach((groupName) => {
        const groupId = groupIdByName.get(this.normalizeImportKey(groupName));
        if (groupId) {
          groupIds.push(groupId);
          return;
        }
        issues.push({
          row: row.rowNumber,
          member: fullName,
          severity: 'warning',
          message: `Group "${groupName}" was not found and was skipped`,
        });
      });

      try {
        const member = await this.discipleshipMemberRepo.save(
          this.discipleshipMemberRepo.create({
            churchId,
            fullName,
            phone,
            email: this.normalizeOptionalText(row.email, 160),
            gender,
            enrollmentDate,
            isFirstTimeAtChurch,
            hasChurchRole: Boolean(
              this.normalizeOptionalText(row.churchRoleNotes, 1200),
            ),
            churchRoleNotes: this.normalizeOptionalText(
              row.churchRoleNotes,
              1200,
            ),
            status: DiscipleshipMemberStatus.ACTIVE,
            notes: this.normalizeOptionalText(row.notes, 1200),
            createdByUserId,
          }),
        );

        const uniqueGroupIds = [...new Set(groupIds)];
        await this.ensureDiscipleshipMemberAlias(
          churchId,
          member.id,
          member.fullName,
          'manual',
        );
        await this.syncDiscipleshipMemberGroups(
          churchId,
          member.id,
          uniqueGroupIds,
        );
        assignedGroups += uniqueGroupIds.length;
        createdMembers.push(member);
      } catch (error: any) {
        skipped += 1;
        issues.push({
          row: row.rowNumber,
          member: fullName,
          severity: 'error',
          message: error?.message || 'Unable to save member',
        });
      }
    }

    return {
      totalRows: rows.length,
      created: createdMembers.length,
      skipped,
      assignedGroups,
      warnings: issues.filter((issue) => issue.severity === 'warning').length,
      errors: issues.filter((issue) => issue.severity === 'error').length,
      issues,
      members: await this.withDiscipleshipMemberGroups(createdMembers, {
        includeContributionSummary: this.isPriestRole(userRole),
      }),
    };
  }

  async listDiscipleshipMatchCandidates(churchId: string) {
    this.triggerDiscipleshipTransactionSync(churchId);
    return this.discipleshipMatchCandidateRepo.find({
      where: {
        churchId,
        status: DiscipleshipMatchCandidateStatus.PENDING,
      },
      relations: ['contributor', 'candidateMember'],
      order: { matchScore: 'DESC', createdAt: 'ASC' },
    });
  }

  private async buildDiscipleshipDuplicateClusterCandidates(churchId: string) {
    const members = await this.discipleshipMemberRepo.find({
      where: { churchId },
      order: { createdAt: 'ASC' },
    });
    const emptyResult = {
      members,
      skippedKeys: new Set<string>(),
      duplicateGroups: [] as string[][],
      clusterReasons: new Map<
        string,
        { score: number; reasons: Set<string> }
      >(),
    };
    if (members.length < 2) {
      return emptyResult;
    }

    const [aliases, skippedReviews, contributorLinks] = await Promise.all([
      this.discipleshipMemberAliasRepo.find({ where: { churchId } }),
      this.discipleshipDuplicateReviewRepo.find({
        where: {
          churchId,
          status: DiscipleshipDuplicateReviewStatus.SKIPPED,
        },
      }),
      this.discipleshipMemberContributorRepo.find({
        where: { churchId },
        relations: ['contributor'],
      }),
    ]);
    const skippedKeys = new Set(
      skippedReviews.map((review) => review.clusterKey),
    );
    const memberById = new Map(members.map((member) => [member.id, member]));
    const memberIdByContributorId = new Map<string, string>();
    const numberIdentitiesByMemberId = new Map<string, Set<string>>();
    const addNumberIdentity = (
      memberId: string,
      prefix: 'phone' | 'provider',
      value: unknown,
    ) => {
      const normalized =
        prefix === 'phone'
          ? this.normalizePlainPhone(value)
          : this.normalizeImportKey(value);
      if (!normalized) {
        return;
      }
      const identities =
        numberIdentitiesByMemberId.get(memberId) || new Set<string>();
      identities.add(`${prefix}:${normalized}`);
      numberIdentitiesByMemberId.set(memberId, identities);
    };

    members.forEach((member) => {
      addNumberIdentity(member.id, 'phone', member.phone);
      if (member.contributorId) {
        memberIdByContributorId.set(member.contributorId, member.id);
      }
    });
    contributorLinks.forEach((link) => {
      memberIdByContributorId.set(link.contributorId, link.memberId);
      addNumberIdentity(link.memberId, 'phone', link.contributor?.phone);
    });

    const contributorIds = [...memberIdByContributorId.keys()];
    if (contributorIds.length > 0) {
      const providerRows = await this.contributionRepo
        .createQueryBuilder('contribution')
        .select('contribution.contributorId', 'contributorId')
        .addSelect(
          "GROUP_CONCAT(DISTINCT contribution.providerPayerId SEPARATOR '|||')",
          'providerPayerIds',
        )
        .where('contribution.churchId = :churchId', { churchId })
        .andWhere('contribution.status = :status', {
          status: ContributionStatus.CONFIRMED,
        })
        .andWhere('contribution.contributorId IN (:...contributorIds)', {
          contributorIds,
        })
        .andWhere('contribution.providerPayerId IS NOT NULL')
        .groupBy('contribution.contributorId')
        .getRawMany();
      providerRows.forEach((row) => {
        const memberId = memberIdByContributorId.get(row.contributorId);
        if (!memberId) {
          return;
        }
        `${row.providerPayerIds || ''}`
          .split('|||')
          .filter(Boolean)
          .forEach((providerPayerId) =>
            addNumberIdentity(memberId, 'provider', providerPayerId),
          );
      });
    }

    const memberIds = members.map((member) => member.id);
    const parent = new Map(memberIds.map((id) => [id, id]));
    const clusterReasons = new Map<
      string,
      {
        score: number;
        reasons: Set<string>;
      }
    >();
    const find = (id: string): string => {
      const current = parent.get(id) || id;
      if (current === id) {
        return id;
      }
      const root = find(current);
      parent.set(id, root);
      return root;
    };
    const union = (
      leftId: string,
      rightId: string,
      score: number,
      reason: string,
    ) => {
      const leftRoot = find(leftId);
      const rightRoot = find(rightId);
      if (leftRoot !== rightRoot) {
        parent.set(rightRoot, leftRoot);
      }
      const key = [leftId, rightId].sort().join('|');
      const detail = clusterReasons.get(key) || {
        score: 0,
        reasons: new Set<string>(),
      };
      detail.score = Math.max(detail.score, score);
      detail.reasons.add(reason);
      clusterReasons.set(key, detail);
    };

    const candidateIdsByKey = new Map<string, Set<string>>();
    const addCandidateKey = (key: string, memberId: string) => {
      if (!key) {
        return;
      }
      const ids = candidateIdsByKey.get(key) || new Set<string>();
      ids.add(memberId);
      candidateIdsByKey.set(key, ids);
    };
    members.forEach((member) => {
      const phone = this.normalizePlainPhone(member.phone);
      if (phone) {
        addCandidateKey(`phone:${phone}`, member.id);
      }
      this.getDiscipleshipNameParts(member.fullName).forEach((part) =>
        addCandidateKey(`name:${part}`, member.id),
      );
    });
    aliases.forEach((alias) => {
      this.getDiscipleshipNameParts(alias.alias).forEach((part) =>
        addCandidateKey(`name:${part}`, alias.memberId),
      );
    });
    const candidatePairKeys = new Set<string>();
    candidateIdsByKey.forEach((ids) => {
      const candidateIds = [...ids];
      for (let leftIndex = 0; leftIndex < candidateIds.length; leftIndex += 1) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < candidateIds.length;
          rightIndex += 1
        ) {
          candidatePairKeys.add(
            [candidateIds[leftIndex], candidateIds[rightIndex]]
              .sort()
              .join('|'),
          );
        }
      }
    });

    candidatePairKeys.forEach((pairKey) => {
      const [leftId, rightId] = pairKey.split('|');
      const left = memberById.get(leftId);
      const right = memberById.get(rightId);
      if (!left || !right) {
        return;
      }
      const leftIdentities =
        numberIdentitiesByMemberId.get(left.id) || new Set<string>();
      const rightIdentities =
        numberIdentitiesByMemberId.get(right.id) || new Set<string>();
      const identityConflict = this.hasDiscipleshipNumberIdentityConflict(
        leftIdentities,
        rightIdentities,
      );
      const phoneMatch =
        this.normalizePlainPhone(left.phone) &&
        this.normalizePlainPhone(left.phone) ===
          this.normalizePlainPhone(right.phone);
      const nameScore = this.scoreDiscipleshipDuplicatePair(
        left,
        right,
        aliases,
      );
      if (phoneMatch) {
        union(left.id, right.id, 400, 'same phone number');
      } else if (!identityConflict && nameScore >= 180) {
        union(left.id, right.id, nameScore, 'matching name parts');
      } else if (!identityConflict && nameScore >= 70) {
        union(left.id, right.id, nameScore, 'same first name');
      }
    });

    const groupedIds = new Map<string, string[]>();
    memberIds.forEach((id) => {
      const root = find(id);
      const items = groupedIds.get(root) || [];
      items.push(id);
      groupedIds.set(root, items);
    });
    const duplicateGroups = [...groupedIds.values()]
      .flatMap((ids) => {
        const partitions: string[][] = [];
        [...ids]
          .sort(
            (leftId, rightId) =>
              (numberIdentitiesByMemberId.get(rightId)?.size || 0) -
              (numberIdentitiesByMemberId.get(leftId)?.size || 0),
          )
          .forEach((memberId) => {
            const identities =
              numberIdentitiesByMemberId.get(memberId) || new Set<string>();
            const compatiblePartition = partitions.find((partition) =>
              partition.every(
                (existingId) =>
                  !this.hasDiscipleshipNumberIdentityConflict(
                    identities,
                    numberIdentitiesByMemberId.get(existingId) ||
                      new Set<string>(),
                  ),
              ),
            );
            if (compatiblePartition) {
              compatiblePartition.push(memberId);
            } else {
              partitions.push([memberId]);
            }
          });
        return partitions;
      })
      .filter((ids) => {
        if (ids.length < 2) {
          return false;
        }
        const clusterKey = this.buildDiscipleshipDuplicateClusterKey(ids);
        return !skippedKeys.has(clusterKey);
      });

    return {
      members: members.filter((member) => memberById.has(member.id)),
      skippedKeys,
      duplicateGroups,
      clusterReasons,
    };
  }

  async listDiscipleshipDuplicateMemberClusters(churchId: string) {
    this.triggerDiscipleshipTransactionSync(churchId);
    const { members, skippedKeys, duplicateGroups, clusterReasons } =
      await this.buildDiscipleshipDuplicateClusterCandidates(churchId);
    if (duplicateGroups.length === 0) {
      return [];
    }

    const memberIds = members.map((member) => member.id);
    const enrichedMembers = await this.withDiscipleshipMemberGroups(members, {
      includeContributionSummary: false,
    });
    const enrichedById = new Map(
      enrichedMembers.map((member) => [member.id, member]),
    );
    const attendanceCounts = await this.getDiscipleshipAttendanceCounts(
      churchId,
      memberIds,
    );

    return duplicateGroups
      .map((ids) => {
        const clusterKey = this.buildDiscipleshipDuplicateClusterKey(ids);
        const pairDetails = [...clusterReasons.entries()].filter(([key]) => {
          const pairIds = key.split('|');
          return pairIds.every((id) => ids.includes(id));
        });
        const score = Math.max(
          ...pairDetails.map(([, detail]) => detail.score),
          0,
        );
        const reasons = [
          ...new Set(
            pairDetails.flatMap(([, detail]) => [...detail.reasons.values()]),
          ),
        ];
        const clusterMembers = ids
          .map((id) => enrichedById.get(id))
          .filter(Boolean)
          .map((member: any) => ({
            ...member,
            isManual: Boolean(member.createdByUserId),
            attendanceCount: attendanceCounts.get(member.id) || 0,
          }))
          .sort((left, right) => {
            if (!!left.createdByUserId !== !!right.createdByUserId) {
              return left.createdByUserId ? -1 : 1;
            }
            return `${left.fullName || ''}`.localeCompare(
              `${right.fullName || ''}`,
            );
          });
        return {
          id: clusterKey,
          clusterKey,
          score,
          reasons,
          members: clusterMembers,
          recommendedCanonicalId:
            this.sortDiscipleshipMergeCandidates(
              clusterMembers as DiscipleshipMember[],
            )[0]?.id || null,
        };
      })
      .filter((cluster) => !skippedKeys.has(cluster.clusterKey))
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.members.length - left.members.length,
      );
  }

  async reviewDiscipleshipDuplicateMembers(
    churchId: string,
    reviewedByUserId: string,
    body: any,
  ) {
    const action = body?.action;
    if (action !== 'merge' && action !== 'skip') {
      throw new BadRequestException(
        'Duplicate review action must be merge or skip',
      );
    }
    const memberIds: string[] = Array.from(
      new Set<string>(
        (Array.isArray(body?.memberIds) ? body.memberIds : [])
          .map((id) => this.normalizeOptionalText(id, 36))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (memberIds.length < 2) {
      throw new BadRequestException('Select at least two members to review');
    }
    const members = await this.discipleshipMemberRepo.find({
      where: { churchId, id: In(memberIds) },
    });
    if (members.length !== memberIds.length) {
      throw new BadRequestException(
        'One or more selected members were not found',
      );
    }
    const clusterKey = this.buildDiscipleshipDuplicateClusterKey(memberIds);
    const review = await this.upsertDiscipleshipDuplicateReview(
      churchId,
      reviewedByUserId,
      clusterKey,
      memberIds,
      action === 'merge'
        ? DiscipleshipDuplicateReviewStatus.MERGED
        : DiscipleshipDuplicateReviewStatus.SKIPPED,
    );

    if (action === 'skip') {
      return { review, merged: false };
    }

    const canonicalId = body?.canonicalMemberId;
    const canonical =
      (canonicalId
        ? members.find((member) => member.id === canonicalId)
        : null) || this.sortDiscipleshipMergeCandidates(members)[0];
    const duplicates = members.filter((member) => member.id !== canonical.id);
    await this.mergeDiscipleshipMemberRecords(churchId, canonical, duplicates);
    await this.runDiscipleshipTransactionSync(churchId, true);
    return {
      review,
      merged: true,
      canonical: (
        await this.withDiscipleshipMemberGroups([canonical], {
          includeContributionSummary: false,
        })
      )[0],
    };
  }

  async reviewDiscipleshipMatchCandidate(
    churchId: string,
    reviewedByUserId: string,
    candidateId: string,
    action: unknown,
  ) {
    if (action !== 'confirm' && action !== 'dismiss') {
      throw new BadRequestException('Match action must be confirm or dismiss');
    }
    const candidate = await this.discipleshipMatchCandidateRepo.findOne({
      where: { id: candidateId, churchId },
      relations: ['contributor', 'candidateMember'],
    });
    if (!candidate) {
      throw new NotFoundException('Potential match not found');
    }

    candidate.reviewedByUserId = reviewedByUserId;
    candidate.reviewedAt = new Date();
    candidate.status =
      action === 'confirm'
        ? DiscipleshipMatchCandidateStatus.CONFIRMED
        : DiscipleshipMatchCandidateStatus.DISMISSED;
    await this.discipleshipMatchCandidateRepo.save(candidate);

    if (action === 'dismiss') {
      return candidate;
    }

    const existingLink = await this.discipleshipMemberContributorRepo.findOne({
      where: { churchId, contributorId: candidate.contributorId },
    });
    if (existingLink && existingLink.memberId !== candidate.candidateMemberId) {
      const linkedMember = await this.discipleshipMemberRepo.findOne({
        where: { id: existingLink.memberId, churchId },
      });
      if (linkedMember) {
        await this.mergeDiscipleshipMemberRecords(
          churchId,
          candidate.candidateMember,
          [linkedMember],
        );
      }
    } else if (!existingLink) {
      await this.linkDiscipleshipContributor(
        churchId,
        candidate.candidateMember,
        candidate.contributorId,
        'staff_confirmed',
      );
    }

    await this.ensureDiscipleshipMemberAlias(
      churchId,
      candidate.candidateMemberId,
      candidate.observedName,
      'transaction',
      candidate.contributorId,
    );
    await this.discipleshipMatchCandidateRepo.update(
      {
        churchId,
        contributorId: candidate.contributorId,
        status: DiscipleshipMatchCandidateStatus.PENDING,
      },
      {
        status: DiscipleshipMatchCandidateStatus.DISMISSED,
        reviewedByUserId,
        reviewedAt: new Date(),
      },
    );
    candidate.status = DiscipleshipMatchCandidateStatus.CONFIRMED;
    await this.discipleshipMatchCandidateRepo.save(candidate);
    await this.runDiscipleshipTransactionSync(churchId, true);
    return candidate;
  }

  async importMpesaStatementForDiscipleship(churchId: string, file: any) {
    if (!file?.buffer) {
      throw new BadRequestException('Upload an M-Pesa statement XLSX or CSV');
    }
    const extension = extname(file.originalname || '').toLowerCase();
    if (!['.xlsx', '.csv'].includes(extension)) {
      throw new BadRequestException('Upload an XLSX or CSV statement');
    }
    const matrix =
      extension === '.csv'
        ? this.parseCsvImportMatrix(file.buffer.toString('utf8'))
        : await this.parseExcelImportMatrix(file.buffer);
    if (matrix.length < 2) {
      throw new BadRequestException('The statement has no transaction rows');
    }

    const headers = matrix[0].values.map((value) =>
      this.normalizeImportKey(value).replace(/[^a-z0-9]/g, ''),
    );
    const findHeader = (candidates: string[]) =>
      headers.findIndex((header) => candidates.includes(header));
    const receiptIndex = findHeader([
      'transid',
      'transactionid',
      'mpesareceiptnumber',
      'receiptnumber',
      'receiptno',
      'receipt',
      'reference',
    ]);
    const fullNameIndex = findHeader([
      'customername',
      'payername',
      'fullname',
      'name',
    ]);
    const firstNameIndex = findHeader(['firstname', 'first']);
    const middleNameIndex = findHeader(['middlename', 'middle']);
    const lastNameIndex = findHeader(['lastname', 'surname', 'last']);
    if (receiptIndex < 0) {
      throw new BadRequestException(
        'Statement must include a transaction ID or receipt number column',
      );
    }
    if (
      fullNameIndex < 0 &&
      firstNameIndex < 0 &&
      middleNameIndex < 0 &&
      lastNameIndex < 0
    ) {
      throw new BadRequestException(
        'Statement must include payer name or first/middle/last name columns',
      );
    }

    let matched = 0;
    let updated = 0;
    let skipped = 0;
    const issues: { row: number; message: string }[] = [];
    for (const row of matrix.slice(1)) {
      const receipt = this.normalizeOptionalText(row.values[receiptIndex], 120);
      const fullName =
        this.normalizeOptionalText(row.values[fullNameIndex], 180) ||
        [firstNameIndex, middleNameIndex, lastNameIndex]
          .filter((index) => index >= 0)
          .map((index) => this.normalizeOptionalText(row.values[index], 80))
          .filter(Boolean)
          .join(' ');
      if (!receipt || !fullName) {
        skipped += 1;
        continue;
      }
      const contribution = await this.contributionRepo.findOne({
        where: { churchId, paymentReference: receipt },
      });
      if (!contribution) {
        skipped += 1;
        issues.push({
          row: row.rowNumber,
          message: `No contribution matched receipt ${receipt}`,
        });
        continue;
      }
      matched += 1;
      if (
        this.normalizeImportKey(contribution.payerName) !==
        this.normalizeImportKey(fullName)
      ) {
        contribution.payerName = fullName;
        await this.contributionRepo.save(contribution);
        updated += 1;
      }
    }

    await this.runDiscipleshipTransactionSync(churchId, true);
    return {
      totalRows: matrix.length - 1,
      matched,
      updated,
      skipped,
      issues: issues.slice(0, 100),
    };
  }

  async listDiscipleshipAttendance(churchId: string, query: any = {}) {
    this.triggerDiscipleshipTransactionSync(churchId);
    const qb = this.discipleshipAttendanceRepo
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.member', 'member')
      .leftJoinAndSelect('attendance.group', 'group')
      .leftJoinAndSelect('attendance.markedByUser', 'markedByUser')
      .where('attendance.churchId = :churchId', { churchId })
      .orderBy('attendance.attendanceDate', 'DESC')
      .addOrderBy('attendance.createdAt', 'DESC');

    if (query.from) {
      qb.andWhere('attendance.attendanceDate >= :from', {
        from: this.normalizeDateOnly(query.from),
      });
    }
    if (query.to) {
      qb.andWhere('attendance.attendanceDate <= :to', {
        to: this.normalizeDateOnly(query.to),
      });
    }
    if (query.memberId) {
      qb.andWhere('attendance.memberId = :memberId', {
        memberId: query.memberId,
      });
    }
    if (query.groupId) {
      qb.andWhere('attendance.groupId = :groupId', { groupId: query.groupId });
    }
    if (query.type === 'service' || query.type === 'group') {
      qb.andWhere('attendance.attendanceType = :type', { type: query.type });
    }

    return qb.take(250).getMany();
  }

  async getDiscipleshipMember(
    churchId: string,
    memberId: string,
    userRole?: string | null,
  ) {
    this.triggerDiscipleshipTransactionSync(churchId);
    const member = await this.discipleshipMemberRepo.findOne({
      where: { id: memberId, churchId },
    });
    if (!member) {
      throw new NotFoundException('Discipleship member not found');
    }
    const includeContributions = this.isPriestRole(userRole);
    const detailed = (
      await this.withDiscipleshipMemberGroups([member], {
        includeContributionSummary: includeContributions,
      })
    )[0];
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDayDate = this.getNairobiDateParts(
      ninetyDaysAgo.toISOString(),
    ).date;
    const [latestAttendance, attendanceCount90Days] = await Promise.all([
      this.discipleshipAttendanceRepo.findOne({
        where: { churchId, memberId },
        order: { attendanceDate: 'DESC', createdAt: 'DESC' },
      }),
      this.discipleshipAttendanceRepo
        .createQueryBuilder('attendance')
        .where('attendance.churchId = :churchId', { churchId })
        .andWhere('attendance.memberId = :memberId', { memberId })
        .andWhere('attendance.attendanceDate >= :ninetyDayDate', {
          ninetyDayDate,
        })
        .getCount(),
    ]);
    const contributionDates = detailed.contributionSummary?.dates || [];
    const oldestContribution =
      contributionDates.length > 0
        ? contributionDates[contributionDates.length - 1]?.date
        : null;
    return {
      ...detailed,
      ...(includeContributions
        ? {
            contributionSummary: {
              ...detailed.contributionSummary,
              dates: contributionDates.slice(0, 12),
              contributions: (
                detailed.contributionSummary?.contributions || []
              ).slice(0, 25),
            },
          }
        : {}),
      activitySummary: {
        enrollmentDate: detailed.enrollmentDate || null,
        ...(includeContributions
          ? {
              firstContributionAt: oldestContribution,
              latestContributionAt:
                detailed.contributionSummary?.latestContributionAt || null,
              contributionCount:
                detailed.contributionSummary?.contributionCount || 0,
              contributionTotal: detailed.contributionSummary?.totalAmount || 0,
            }
          : {}),
        latestAttendanceAt: latestAttendance?.attendanceDate || null,
        attendanceCount90Days,
        averageAttendancePerMonth: Number(
          (attendanceCount90Days / 3).toFixed(1),
        ),
      },
    };
  }

  async markDiscipleshipAttendance(
    churchId: string,
    markedByUserId: string,
    body: any,
  ) {
    const memberId = this.normalizeOptionalText(body.memberId, 36);
    if (!memberId) {
      throw new BadRequestException('Select a member to mark present');
    }
    const member = await this.discipleshipMemberRepo.findOne({
      where: { id: memberId, churchId },
    });
    if (!member) {
      throw new BadRequestException('Discipleship member not found');
    }

    const attendanceType = DiscipleshipAttendanceType.GROUP;
    const dateParts = this.getNairobiDateParts(
      this.normalizeDateOnly(body.attendanceDate),
    );
    const eventName = this.normalizeOptionalText(body.eventName, 160);
    const groupId = this.normalizeOptionalText(body.groupId, 36);
    if (!groupId) {
      throw new BadRequestException('Select an attendance group');
    }
    const group = await this.discipleshipGroupRepo.findOne({
      where: { id: groupId, churchId, isActive: true },
    });
    if (!group) {
      throw new BadRequestException('Select an active discipleship group');
    }

    const duplicateQb = this.discipleshipAttendanceRepo
      .createQueryBuilder('attendance')
      .where('attendance.churchId = :churchId', { churchId })
      .andWhere('attendance.memberId = :memberId', { memberId })
      .andWhere('attendance.attendanceDate = :attendanceDate', {
        attendanceDate: dateParts.date,
      })
      .andWhere('attendance.attendanceType = :attendanceType', {
        attendanceType,
      });

    if (groupId) {
      duplicateQb.andWhere('attendance.groupId = :groupId', { groupId });
    } else {
      duplicateQb.andWhere('attendance.groupId IS NULL');
    }
    if (eventName) {
      duplicateQb.andWhere('attendance.eventName = :eventName', { eventName });
    } else {
      duplicateQb.andWhere('attendance.eventName IS NULL');
    }

    const duplicate = await duplicateQb.getOne();
    if (duplicate) {
      throw new BadRequestException(
        'This member is already marked present for this attendance record',
      );
    }

    const attendance = await this.discipleshipAttendanceRepo.save(
      this.discipleshipAttendanceRepo.create({
        churchId,
        memberId,
        attendanceDate: dateParts.date,
        weekday: dateParts.weekday,
        attendanceType,
        groupId,
        eventName,
        markedByUserId,
        markedAt: new Date(),
      }),
    );

    return this.discipleshipAttendanceRepo.findOne({
      where: { id: attendance.id, churchId },
      relations: ['member', 'group', 'markedByUser'],
    });
  }

  async getSubscriptionStatus(churchId: string) {
    return sanitizeSubscriptionForTenant(
      await this.churchSubscriptionsService.getChurchSubscriptionStatus(
        churchId,
      ),
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
      targetAmount: this.normalizeFundAccountTargetAmount(body.targetAmount),
      receiptTemplate:
        this.normalizeReceiptTemplate(body.receiptTemplate) ||
        getDefaultReceiptTemplateForFundCode(code),
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
    if (body.isActive !== undefined) {
      fundAccount.isActive = Boolean(body.isActive);
      if (fundAccount.isActive) {
        fundAccount.archivedAt = null;
        fundAccount.archivedByUserId = null;
        fundAccount.archiveReason = null;
      } else if (!fundAccount.archivedAt) {
        fundAccount.archivedAt = new Date();
      }
    }
    fundAccount.displayOrder = Number(
      body.displayOrder ?? fundAccount.displayOrder,
    );
    if (body.targetAmount !== undefined) {
      fundAccount.targetAmount = this.normalizeFundAccountTargetAmount(
        body.targetAmount,
      );
    }
    fundAccount.receiptTemplate =
      body.receiptTemplate !== undefined
        ? this.normalizeReceiptTemplate(body.receiptTemplate) ||
          fundAccount.receiptTemplate
        : fundAccount.receiptTemplate;

    return this.fundAccountRepo.save(fundAccount);
  }

  async archiveFundAccount(
    churchId: string,
    fundAccountId: string,
    archivedByUserId: string,
    body: any = {},
  ) {
    const fundAccount = await this.fundAccountRepo.findOne({
      where: { id: fundAccountId, churchId },
    });
    if (!fundAccount) {
      throw new NotFoundException('Fund account not found');
    }
    if (this.isGeneralFundAccount(fundAccount)) {
      throw new BadRequestException('General fund account cannot be archived');
    }

    fundAccount.isActive = false;
    fundAccount.archivedAt = fundAccount.archivedAt || new Date();
    fundAccount.archivedByUserId = archivedByUserId || null;
    fundAccount.archiveReason = this.normalizeOptionalText(
      body?.reason || body?.archiveReason,
      255,
    );

    return this.fundAccountRepo.save(fundAccount);
  }

  async restoreFundAccount(churchId: string, fundAccountId: string) {
    const fundAccount = await this.fundAccountRepo.findOne({
      where: { id: fundAccountId, churchId },
    });
    if (!fundAccount) {
      throw new NotFoundException('Fund account not found');
    }

    fundAccount.isActive = true;
    fundAccount.archivedAt = null;
    fundAccount.archivedByUserId = null;
    fundAccount.archiveReason = null;

    return this.fundAccountRepo.save(fundAccount);
  }

  private async assertFundDisplayFundAccountActive(
    churchId: string,
    fundAccountId: string | null | undefined,
  ) {
    if (!fundAccountId) {
      throw new BadRequestException('Fund account is required');
    }

    const fundAccount = await this.fundAccountRepo.findOne({
      where: { id: fundAccountId, churchId, isActive: true },
    });
    if (!fundAccount) {
      throw new BadRequestException(
        'Fund account is archived or unavailable for public display',
      );
    }
  }

  async listChurchUsers(churchId: string) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }
    const users = await this.churchUserRepo.find({
      where: { churchId },
      order: { createdAt: 'DESC' },
    });
    return users.map((user) =>
      this.sanitizeChurchUser(user, church.enabledFeatures),
    );
  }

  async createChurchUser(churchId: string, body: any) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }
    const phone = `${body.phone || ''}`.trim();

    if (!body.name || !body.email || !phone || !body.password || !body.role) {
      throw new BadRequestException(
        'Name, email, phone, password, and role are required',
      );
    }

    const existing = await this.churchUserRepo.findOne({
      where: [
        { email: body.email.toLowerCase() },
        { username: body.username || '' },
        { phone },
      ],
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
      name: body.name,
      email: body.email.toLowerCase(),
      username: body.username || null,
      phone,
      passwordHash: await bcrypt.hash(body.password, 10),
      role,
      permissionOverrides: access.permissionOverrides,
      permissionDenials: access.permissionDenials,
      isActive: body.isActive ?? true,
    });

    const saved = await this.churchUserRepo.save(user);
    const credentialsSms = await this.sendChurchUserCredentialsSms(
      churchId,
      saved,
      `${body.password}`,
    );

    return {
      ...this.sanitizeChurchUser(saved, church.enabledFeatures),
      credentialsSmsSent: credentialsSms.sent,
      credentialsSmsError: credentialsSms.error,
    };
  }

  async updateChurchUser(churchId: string, userId: string, body: any) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }
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
    const nextRole = (
      body.role !== undefined
        ? normalizeChurchRole(body.role)
        : normalizeChurchRole(user.role)
    ) as ChurchUserRole;
    const nextIsActive = body.isActive ?? user.isActive;
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

    if (body.password) {
      user.passwordHash = await bcrypt.hash(body.password, 10);
    }

    const saved = await this.churchUserRepo.save(user);
    return this.sanitizeChurchUser(saved, church.enabledFeatures);
  }

  async resendChurchUserCredentials(churchId: string, userId: string) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }
    const user = await this.churchUserRepo.findOne({
      where: { id: userId, churchId },
    });
    if (!user) {
      throw new NotFoundException('Church user not found');
    }
    if (!user.phone) {
      throw new BadRequestException('This church user has no phone number');
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const credentialsSms = await this.sendChurchUserCredentialsSms(
      churchId,
      user,
      temporaryPassword,
    );
    if (!credentialsSms.sent) {
      throw new BadRequestException(
        credentialsSms.error ||
          'Unable to send credentials SMS. Check the SMS outbox for the provider error.',
      );
    }

    user.passwordHash = await bcrypt.hash(temporaryPassword, 10);
    await this.churchUserRepo.save(user);

    return {
      sent: true,
      user: this.sanitizeChurchUser(user, church.enabledFeatures),
    };
  }

  async listContributions(churchId: string, query: any) {
    return this.contributionsService.listChurchContributionsPage(
      churchId,
      query,
    );
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

  async quoteBulkMessage(churchId: string, body: any) {
    return this.smsService.quoteBulkMessages(churchId, {
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

  async createBulkMessagePurchase(churchId: string, userId: string, body: any) {
    return this.smsService.createBulkSmsPurchase(churchId, userId, {
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
      payerPhone: body.payerPhone,
    });
  }

  async getBulkMessagePurchase(churchId: string, purchaseId: string) {
    return this.smsService.getSmsUnitPurchase(churchId, purchaseId);
  }

  async sendBulkMessagePurchase(
    churchId: string,
    userId: string,
    purchaseId: string,
  ) {
    return this.smsService.sendConfirmedSmsUnitPurchase(
      churchId,
      userId,
      purchaseId,
    );
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

  async listSmsOutboxRecipients(churchId: string, query: any = {}) {
    return this.smsService.listOutboxRecipients(churchId, query);
  }

  async fetchSmsDeliveryReport(churchId: string, messageId: string) {
    return this.smsService.fetchOutboxDeliveryReport(churchId, messageId);
  }

  async refreshSmsDeliveryReports(churchId: string, body: any = {}) {
    return this.smsService.refreshPendingDeliveryReports(churchId, {
      batchId: this.normalizeOptionalText(body.batchId, 80) || undefined,
      hashedOnly: body.hashedOnly === true,
      limit: Number(body.limit || 50),
    });
  }

  async exportSmsOutboxCsv(churchId: string, query: any = {}) {
    const rows = await this.smsService.listOutboxRows(churchId, query);
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

  async deleteAddressBook(churchId: string, addressBookId: string) {
    const book = await this.ensureAddressBook(churchId, addressBookId);
    await this.addressBookContactRepo.delete({ churchId, addressBookId });
    await this.addressBookRepo.remove(book);
    return { deleted: true, id: addressBookId };
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

  async deleteAddressBookContact(
    churchId: string,
    addressBookId: string,
    contactId: string,
  ) {
    await this.ensureAddressBook(churchId, addressBookId);
    const contact = await this.addressBookContactRepo.findOne({
      where: { id: contactId, churchId, addressBookId },
    });
    if (!contact) {
      throw new NotFoundException('Address book contact not found');
    }

    await this.addressBookContactRepo.remove(contact);
    return { deleted: true, id: contactId };
  }

  async importAddressBookContactsFile(
    churchId: string,
    addressBookId: string,
    file: any,
  ) {
    await this.ensureAddressBook(churchId, addressBookId);
    if (!file?.buffer) {
      throw new BadRequestException('Upload a contact XLSX, CSV, or TXT file');
    }

    const extension = extname(file.originalname || '').toLowerCase();
    if (!['.xlsx', '.csv', '.txt'].includes(extension)) {
      throw new BadRequestException('Upload an XLSX, CSV, or TXT contact file');
    }

    const contactsText =
      extension === '.xlsx'
        ? this.importMatrixToContactText(
            await this.parseExcelImportMatrix(file.buffer),
          )
        : file.buffer.toString('utf8');

    return this.importAddressBookContacts(churchId, addressBookId, {
      contactsText,
    });
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

  private importMatrixToContactText(
    matrix: { rowNumber: number; values: unknown[] }[],
  ) {
    return matrix
      .map((row) =>
        row.values
          .map((value) => `${value ?? ''}`.trim())
          .filter(Boolean)
          .join(','),
      )
      .filter(Boolean)
      .join('\n');
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

  async updateCongregationPage(
    churchId: string,
    userId: string,
    userRole: string | null | undefined,
    body: any,
  ) {
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
    let pendingIds: string[] = [];
    if (body.fundDisplays !== undefined) {
      const normalizedFundDisplays = this.normalizeFundDisplays(
        body.fundDisplays,
      );
      const previousFundDisplays = existing.fundDisplays || [];
      normalizedFundDisplays.forEach((display) => {
        display.targetAmount =
          previousFundDisplays.find((item) => item.id === display.id)
            ?.targetAmount || null;
      });
      const approvalState = this.applyFundDisplayApprovalState(
        previousFundDisplays,
        normalizedFundDisplays,
        userId,
        this.isPriestRole(userRole),
      );
      existing.fundDisplays = approvalState.items;
      pendingIds = approvalState.pendingIds;
    }
    existing.galleryImages = this.normalizeGalleryImages(body.galleryImages);
    existing.updatedByUserId = userId;

    const saved = await this.congregationPageRepo.save(existing);
    await this.notifyPriestsForPendingFundDisplays(
      churchId,
      userId,
      saved.fundDisplays || [],
      pendingIds,
    );
    return saved;
  }

  async listCongregationFundDisplays(churchId: string) {
    const page = await this.getCongregationPage(churchId);
    return this.resolveCongregationFundDisplaySummaries(
      churchId,
      page.fundDisplays || [],
    );
  }

  async createCongregationFundDisplay(
    churchId: string,
    userId: string,
    userRole: string | null | undefined,
    body: any,
  ) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }

    const page =
      (await this.congregationPageRepo.findOne({ where: { churchId } })) ||
      this.buildDefaultCongregationPage(church);
    const normalized = this.normalizeFundDisplays([
      { ...body, id: randomUUID(), targetAmount: null },
    ])[0];
    if (!normalized) {
      throw new BadRequestException(
        'Fund account and reporting start date are required',
      );
    }
    await this.assertFundDisplayFundAccountActive(
      churchId,
      normalized.fundAccountId,
    );

    const isPriest = this.isPriestRole(userRole);
    const now = new Date().toISOString();
    const display: CongregationFundDisplay = isPriest
      ? {
          ...normalized,
          createdAt: now,
          createdByUserId: userId,
          updatedAt: now,
          updatedByUserId: userId,
          ...this.buildFundDisplayDurationWindow(body?.durationMinutes),
          approvalStatus: 'approved',
          requestedByUserId: userId,
          approvedByUserId: userId,
          approvedAt: now,
          rejectedAt: null,
          approvalNote: null,
        }
      : {
          ...normalized,
          createdAt: now,
          createdByUserId: userId,
          updatedAt: now,
          updatedByUserId: userId,
          approvalStatus: 'pending',
          requestedByUserId: userId,
          approvedByUserId: null,
          approvedAt: null,
          rejectedAt: null,
          approvalNote: null,
          approvalDurationMinutes: null,
          visibleFrom: null,
          visibleUntil: null,
        };

    page.fundDisplays = [...(page.fundDisplays || []), display];
    page.updatedByUserId = userId;
    await this.congregationPageRepo.save(page);
    if (!isPriest) {
      await this.notifyPriestsForPendingFundDisplays(
        churchId,
        userId,
        page.fundDisplays,
        [display.id as string],
      );
    }

    return this.getCongregationFundDisplaySummary(churchId, display);
  }

  async updateCongregationFundDisplay(
    churchId: string,
    userId: string,
    userRole: string | null | undefined,
    displayId: string,
    body: any,
  ) {
    const page = await this.congregationPageRepo.findOne({
      where: { churchId },
    });
    if (!page) {
      throw new NotFoundException('Congregation page not found');
    }

    const displays = page.fundDisplays || [];
    const index = displays.findIndex((display) => display.id === displayId);
    if (index === -1) {
      throw new NotFoundException('Fund display not found');
    }

    const normalized = this.normalizeFundDisplays([
      {
        ...displays[index],
        ...body,
        id: displayId,
        targetAmount: displays[index].targetAmount || null,
      },
    ])[0];
    if (!normalized) {
      throw new BadRequestException(
        'Fund account and reporting start date are required',
      );
    }
    await this.assertFundDisplayFundAccountActive(
      churchId,
      normalized.fundAccountId,
    );

    const isPriest = this.isPriestRole(userRole);
    const now = new Date().toISOString();
    const wasApproved = displays[index].approvalStatus === 'approved';
    const priestVisibility = isPriest
      ? body?.durationMinutes !== undefined
        ? this.buildFundDisplayDurationWindow(body.durationMinutes)
        : wasApproved
          ? {
              approvalDurationMinutes:
                displays[index].approvalDurationMinutes || null,
              visibleFrom: displays[index].visibleFrom || null,
              visibleUntil: displays[index].visibleUntil || null,
            }
          : this.buildFundDisplayDurationWindow(body?.durationMinutes)
      : null;
    const display: CongregationFundDisplay = isPriest
      ? {
          ...normalized,
          createdAt: displays[index].createdAt || now,
          createdByUserId:
            displays[index].createdByUserId ||
            displays[index].requestedByUserId ||
            userId,
          updatedAt: now,
          updatedByUserId: userId,
          ...priestVisibility,
          approvalStatus: 'approved',
          requestedByUserId: displays[index].requestedByUserId || userId,
          approvedByUserId: userId,
          approvedAt: now,
          rejectedAt: null,
        }
      : {
          ...normalized,
          createdAt: displays[index].createdAt || now,
          createdByUserId:
            displays[index].createdByUserId ||
            displays[index].requestedByUserId ||
            userId,
          updatedAt: now,
          updatedByUserId: userId,
          approvalStatus: 'pending',
          requestedByUserId: userId,
          approvedByUserId: null,
          approvedAt: null,
          rejectedAt: null,
          approvalNote: null,
          approvalDurationMinutes: null,
          visibleFrom: null,
          visibleUntil: null,
        };

    displays[index] = display;
    page.fundDisplays = displays;
    page.updatedByUserId = userId;
    await this.congregationPageRepo.save(page);
    if (!isPriest) {
      await this.notifyPriestsForPendingFundDisplays(
        churchId,
        userId,
        displays,
        [displayId],
      );
    }

    return this.getCongregationFundDisplaySummary(churchId, display);
  }

  async deleteCongregationFundDisplay(
    churchId: string,
    userId: string,
    displayId: string,
  ) {
    const page = await this.congregationPageRepo.findOne({
      where: { churchId },
    });
    if (!page) {
      throw new NotFoundException('Congregation page not found');
    }

    const displays = page.fundDisplays || [];
    if (!displays.some((display) => display.id === displayId)) {
      throw new NotFoundException('Fund display not found');
    }

    page.fundDisplays = displays.filter((display) => display.id !== displayId);
    page.updatedByUserId = userId;
    await this.congregationPageRepo.save(page);
    await this.markFundDisplayNotificationsRead(churchId, displayId);
    return { id: displayId, deleted: true };
  }

  async listChurchNotifications(
    churchId: string,
    userId: string,
    query: any = {},
  ) {
    const includeRead = query?.includeRead === 'true';
    const where: any[] = [
      { churchId, recipientUserId: userId },
      { churchId, recipientUserId: IsNull() },
    ];
    if (!includeRead) {
      where.forEach((item) => (item.isRead = false));
    }

    const notifications = await this.churchNotificationRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(Number(query?.limit || 20) || 20, 50),
    });

    return notifications.map((notification) =>
      this.mapChurchNotification(notification),
    );
  }

  async markChurchNotificationRead(
    churchId: string,
    userId: string,
    notificationId: string,
  ) {
    const notification = await this.churchNotificationRepo.findOne({
      where: [
        { id: notificationId, churchId, recipientUserId: userId },
        { id: notificationId, churchId, recipientUserId: IsNull() },
      ],
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    notification.readAt = new Date();
    const saved = await this.churchNotificationRepo.save(notification);
    return this.mapChurchNotification(saved);
  }

  async reviewCongregationFundDisplay(
    churchId: string,
    userId: string,
    displayId: string,
    action: 'approve' | 'reject',
    options: {
      note?: string | null;
      durationMinutes?: number | string | null;
    } = {},
  ) {
    const page = await this.congregationPageRepo.findOne({
      where: { churchId },
    });
    if (!page) {
      throw new NotFoundException('Congregation page not found');
    }

    const displays = page.fundDisplays || [];
    const index = displays.findIndex((display) => display.id === displayId);
    if (index === -1) {
      throw new NotFoundException('Fund display request not found');
    }

    const now = new Date().toISOString();
    const display = { ...displays[index] };
    if (action === 'approve') {
      const visibility =
        options.durationMinutes === undefined ||
        options.durationMinutes === null ||
        options.durationMinutes === ''
          ? {
              approvalDurationMinutes: null,
              visibleFrom: now,
              visibleUntil: null,
            }
          : this.buildFundDisplayDurationWindow(options.durationMinutes);
      display.approvalStatus = 'approved';
      display.approvedByUserId = userId;
      display.approvedAt = now;
      display.rejectedAt = null;
      display.visibleFrom = visibility.visibleFrom;
      display.visibleUntil = visibility.visibleUntil;
    } else {
      display.approvalStatus = 'rejected';
      display.rejectedAt = now;
    }
    display.approvalNote = this.normalizeOptionalText(options.note, 240);
    display.createdAt = display.createdAt || now;
    display.createdByUserId =
      display.createdByUserId || display.requestedByUserId || userId;
    display.updatedAt = now;
    display.updatedByUserId = userId;
    displays[index] = display;
    page.fundDisplays = displays;
    page.updatedByUserId = userId;

    const saved = await this.congregationPageRepo.save(page);
    await this.markFundDisplayNotificationsRead(churchId, displayId);
    return this.getCongregationFundDisplaySummary(churchId, display);
  }

  async updateCongregationFundDisplayDuration(
    churchId: string,
    userId: string,
    displayId: string,
    body: any,
  ) {
    const page = await this.congregationPageRepo.findOne({
      where: { churchId },
    });
    if (!page) {
      throw new NotFoundException('Congregation page not found');
    }

    const displays = page.fundDisplays || [];
    const index = displays.findIndex((display) => display.id === displayId);
    if (index === -1) {
      throw new NotFoundException('Fund display not found');
    }

    const display = { ...displays[index] };
    if (display.approvalStatus !== 'approved') {
      throw new BadRequestException(
        'Only an approved fund display can have its timer changed',
      );
    }

    const mode = body?.mode === 'extend' ? 'extend' : 'replace';
    const visibility = this.buildFundDisplayDurationWindow(
      body?.durationMinutes,
      {
        mode,
        currentVisibleFrom: display.visibleFrom,
        currentVisibleUntil: display.visibleUntil,
      },
    );

    Object.assign(display, visibility, {
      approvedByUserId: userId,
      approvalNote: this.normalizeOptionalText(body?.note, 240),
      createdAt: display.createdAt || new Date().toISOString(),
      createdByUserId:
        display.createdByUserId || display.requestedByUserId || userId,
      updatedAt: new Date().toISOString(),
      updatedByUserId: userId,
    });
    displays[index] = display;
    page.fundDisplays = displays;
    page.updatedByUserId = userId;
    await this.congregationPageRepo.save(page);

    return this.getCongregationFundDisplaySummary(churchId, display);
  }

  @Interval(60_000)
  async cleanupExpiredFundDisplays() {
    if (this.fundDisplayCleanupRunning) {
      return;
    }

    this.fundDisplayCleanupRunning = true;
    try {
      const pages = await this.congregationPageRepo.find({
        select: ['id'],
      });

      for (const pageSummary of pages) {
        await this.dataSource.transaction(async (manager) => {
          const pageRepo = manager.getRepository(ChurchCongregationPage);
          const notificationRepo = manager.getRepository(ChurchNotification);
          const page = await pageRepo.findOne({
            where: { id: pageSummary.id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!page) {
            return;
          }

          const now = Date.now();
          const expiredIds = (page.fundDisplays || [])
            .filter((display) => {
              const expiresAt = display.visibleUntil
                ? new Date(display.visibleUntil).getTime()
                : Number.NaN;
              return (
                display.approvalStatus === 'approved' &&
                Number.isFinite(expiresAt) &&
                expiresAt <= now
              );
            })
            .map((display) => display.id)
            .filter((id): id is string => Boolean(id));

          if (expiredIds.length === 0) {
            return;
          }

          page.fundDisplays = (page.fundDisplays || []).filter(
            (display) => !display.id || !expiredIds.includes(display.id),
          );
          await pageRepo.save(page);
          await notificationRepo.delete({
            churchId: page.churchId,
            entityType: 'congregation_fund_display',
            entityId: In(expiredIds),
          });
        });
      }
    } finally {
      this.fundDisplayCleanupRunning = false;
    }
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

  async uploadPresentationMedia(churchId: string, file: any) {
    if (!file) {
      throw new BadRequestException('Media file is required');
    }

    const extensionByMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
    };
    const extension =
      extensionByMime[file.mimetype] || extname(file.originalname || '');
    const normalizedExtension = extension.toLowerCase();
    const mediaType = ['.mp4', '.webm'].includes(normalizedExtension)
      ? 'video'
      : 'image';

    if (
      !['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.webm'].includes(
        normalizedExtension,
      )
    ) {
      throw new BadRequestException(
        'Upload a JPG, PNG, WEBP, MP4, or WEBM file',
      );
    }

    if (Number(file.size || 0) > 5 * 1024 * 1024) {
      throw new BadRequestException(
        'Presentation media must be 5MB or smaller',
      );
    }

    const uploadRoot =
      process.env.UPLOAD_ROOT || join(process.cwd(), 'uploads');
    const relativeDir = join('presentations', churchId);
    const absoluteDir = join(uploadRoot, relativeDir);

    if (!existsSync(absoluteDir)) {
      mkdirSync(absoluteDir, { recursive: true });
    }

    const filename = `${Date.now()}-${randomUUID()}${normalizedExtension}`;
    const absolutePath = join(absoluteDir, filename);
    writeFileSync(absolutePath, file.buffer);

    return {
      mediaName: file.originalname || filename,
      mediaType,
      mediaUrl: `/api/uploads/${relativeDir.replace(/\\/g, '/')}/${filename}`,
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

  private async ensureChurchServiceDiscipleshipGroup(churchId: string) {
    let group = await this.discipleshipGroupRepo.findOne({
      where: { churchId, name: DEFAULT_DISCIPLESHIP_SERVICE_GROUP },
    });

    if (group) {
      if (!group.isActive) {
        group.isActive = true;
        group = await this.discipleshipGroupRepo.save(group);
      }
      return group;
    }

    return this.discipleshipGroupRepo.save(
      this.discipleshipGroupRepo.create({
        churchId,
        name: DEFAULT_DISCIPLESHIP_SERVICE_GROUP,
        description:
          'Default group for members discovered from confirmed contributions and normal church service attendance.',
        isActive: true,
      }),
    );
  }

  private triggerDiscipleshipTransactionSync(churchId: string) {
    void this.runDiscipleshipTransactionSync(churchId).catch((error: any) => {
      this.logger.warn(
        `Discipleship background sync failed for church=${churchId}: ${error?.message || error}`,
      );
    });
  }

  private async runDiscipleshipTransactionSync(
    churchId: string,
    force = false,
  ) {
    const existing = this.discipleshipTransactionSyncs.get(churchId);
    if (existing) {
      return existing;
    }
    const lastSyncedAt = this.discipleshipLastSyncedAt.get(churchId) || 0;
    if (!force && Date.now() - lastSyncedAt < 60_000) {
      return null;
    }

    const sync = this.syncTransactionalDiscipleshipMembersUnsafe(churchId)
      .then((result) => {
        this.discipleshipLastSyncedAt.set(churchId, Date.now());
        return result;
      })
      .finally(() => {
        if (this.discipleshipTransactionSyncs.get(churchId) === sync) {
          this.discipleshipTransactionSyncs.delete(churchId);
        }
      });
    this.discipleshipTransactionSyncs.set(churchId, sync);
    return sync;
  }

  @Interval(60_000)
  async syncRecentDiscipleshipTransactions() {
    const cutoff = new Date(Date.now() - 2 * 60_000);
    const rows = await this.contributionRepo
      .createQueryBuilder('contribution')
      .select('DISTINCT contribution.churchId', 'churchId')
      .where('contribution.status = :status', {
        status: ContributionStatus.CONFIRMED,
      })
      .andWhere('contribution.updatedAt >= :cutoff', { cutoff })
      .getRawMany();
    rows.forEach((row) => {
      if (row.churchId) {
        this.triggerDiscipleshipTransactionSync(row.churchId);
      }
    });
  }

  private async syncTransactionalDiscipleshipMembersUnsafe(churchId: string) {
    const serviceGroup =
      await this.ensureChurchServiceDiscipleshipGroup(churchId);
    const preMerged =
      await this.consolidateDuplicateDiscipleshipMembers(churchId);
    const rows = await this.contributionRepo
      .createQueryBuilder('contribution')
      .innerJoin('contribution.contributor', 'contributor')
      .select('contributor.id', 'id')
      .addSelect('contributor.name', 'name')
      .addSelect('contributor.phone', 'phone')
      .addSelect('contributor.gender', 'gender')
      .addSelect(
        "GROUP_CONCAT(DISTINCT contribution.payerName SEPARATOR '|||')",
        'observedNames',
      )
      .addSelect(
        "GROUP_CONCAT(DISTINCT contribution.providerPayerId SEPARATOR '|||')",
        'providerPayerIds',
      )
      .addSelect(
        'MIN(COALESCE(contribution.receivedAt, contribution.createdAt))',
        'firstContributionAt',
      )
      .where('contribution.churchId = :churchId', { churchId })
      .andWhere('contribution.status = :status', {
        status: ContributionStatus.CONFIRMED,
      })
      .groupBy('contributor.id')
      .addGroupBy('contributor.name')
      .addGroupBy('contributor.phone')
      .addGroupBy('contributor.gender')
      .getRawMany();

    if (rows.length === 0) {
      return { serviceGroup, created: 0, assigned: 0, merged: preMerged };
    }

    const identities = this.buildTransactionDiscipleshipIdentities(rows);
    if (identities.length === 0) {
      return { serviceGroup, created: 0, assigned: 0, merged: preMerged };
    }

    const members = await this.discipleshipMemberRepo.find({
      where: { churchId },
      order: { createdAt: 'ASC' },
    });
    members.sort((left, right) => {
      if (!!left.createdByUserId !== !!right.createdByUserId) {
        return left.createdByUserId ? -1 : 1;
      }
      return 0;
    });
    const aliases = await this.discipleshipMemberAliasRepo.find({
      where: { churchId },
    });
    const contributorLinks = await this.discipleshipMemberContributorRepo.find({
      where: { churchId },
    });
    const membersByContributorId = new Map<string, DiscipleshipMember>();
    const membersByPhone = new Map<string, DiscipleshipMember>();
    const membersByName = new Map<string, DiscipleshipMember>();
    members.forEach((member) => {
      if (
        member.contributorId &&
        !membersByContributorId.has(member.contributorId)
      ) {
        membersByContributorId.set(member.contributorId, member);
      }
      const phone = this.normalizePlainPhone(member.phone);
      if (phone && !membersByPhone.has(phone)) {
        membersByPhone.set(phone, member);
      }
      const name = this.normalizeImportKey(member.fullName);
      if (name && !membersByName.has(name)) {
        membersByName.set(name, member);
      }
    });
    contributorLinks.forEach((link) => {
      const member = members.find((item) => item.id === link.memberId);
      if (member) {
        membersByContributorId.set(link.contributorId, member);
      }
    });
    aliases.forEach((alias) => {
      const member = members.find((item) => item.id === alias.memberId);
      if (member && !membersByName.has(alias.normalizedAlias)) {
        membersByName.set(alias.normalizedAlias, member);
      }
    });

    const existingMemberships = await this.discipleshipMembershipRepo.find({
      where: { churchId, groupId: serviceGroup.id },
    });
    const serviceMemberIds = new Set(
      existingMemberships.map((membership) => membership.memberId),
    );
    const membershipsToAdd: DiscipleshipMembership[] = [];
    const memberIdByContributorId = new Map<string, string>();
    let created = 0;

    for (const identity of identities) {
      const linkedMember = identity.contributorIds
        .map((contributorId) => membersByContributorId.get(contributorId))
        .find(Boolean);
      const phoneMatchedMember = identity.phone
        ? membersByPhone.get(identity.phone)
        : null;
      let preferredManualMatch: DiscipleshipMember | null = null;
      if (linkedMember && !linkedMember.createdByUserId) {
        if (
          phoneMatchedMember &&
          phoneMatchedMember.id !== linkedMember.id &&
          phoneMatchedMember.createdByUserId
        ) {
          preferredManualMatch = phoneMatchedMember;
        } else {
          preferredManualMatch =
            (await this.findSafeDiscipleshipNameMatch(
              churchId,
              identity,
              members.filter((member) => member.id !== linkedMember.id),
              aliases.filter((alias) => alias.memberId !== linkedMember.id),
            )) || null;
        }
        if (preferredManualMatch?.createdByUserId) {
          await this.mergeDiscipleshipMemberRecords(
            churchId,
            preferredManualMatch,
            [linkedMember],
          );
        } else {
          preferredManualMatch = null;
        }
      }
      const mappedExactMember = membersByName.get(identity.nameKey);
      const compatibleExactMember =
        mappedExactMember &&
        !this.hasDiscipleshipPhoneConflict(
          identity.phone,
          mappedExactMember.phone,
        )
          ? mappedExactMember
          : null;

      let member =
        preferredManualMatch ||
        linkedMember ||
        phoneMatchedMember ||
        compatibleExactMember ||
        (await this.findSafeDiscipleshipNameMatch(
          churchId,
          identity,
          members,
          aliases,
        )) ||
        (await this.findDiscipleshipMemberForTransactionIdentity(
          churchId,
          identity,
        ));
      if (!member) {
        member = await this.discipleshipMemberRepo.save(
          this.discipleshipMemberRepo.create({
            churchId,
            contributorId: identity.contributorIds[0],
            fullName: identity.fullName,
            phone: identity.phone,
            gender: identity.gender,
            enrollmentDate:
              this.normalizeDateFromImport(identity.firstContributionAt) ||
              this.getNairobiDateParts().date,
            status: DiscipleshipMemberStatus.ACTIVE,
            notes: null,
            createdByUserId: null,
          }),
        );
        created += 1;
        if (identity.phone) {
          membersByPhone.set(identity.phone, member);
        }
        membersByName.set(identity.nameKey, member);
      } else {
        let needsSave = false;
        if (!member.contributorId) {
          member.contributorId = identity.contributorIds[0];
          needsSave = true;
        }
        if (!member.phone && identity.phone) {
          member.phone = identity.phone;
          needsSave = true;
        }
        if (!member.gender && identity.gender) {
          member.gender = identity.gender;
          needsSave = true;
        }
        if (
          member.enrollmentDate &&
          this.normalizeDateFromImport(identity.firstContributionAt) &&
          this.normalizeDateFromImport(identity.firstContributionAt)! <
            member.enrollmentDate
        ) {
          member.enrollmentDate = this.normalizeDateFromImport(
            identity.firstContributionAt,
          )!;
          needsSave = true;
        }
        if (needsSave) {
          member = await this.discipleshipMemberRepo.save(member);
        }
        if (identity.phone) {
          membersByPhone.set(identity.phone, member);
        }
        membersByName.set(identity.nameKey, member);
      }

      for (const contributorId of identity.contributorIds) {
        membersByContributorId.set(contributorId, member);
        memberIdByContributorId.set(contributorId, member.id);
        await this.linkDiscipleshipContributor(
          churchId,
          member,
          contributorId,
          membersByName.get(identity.nameKey)?.id === member.id
            ? 'exact_name'
            : 'transaction_sync',
        );
        for (const name of identity.names) {
          await this.ensureDiscipleshipMemberAlias(
            churchId,
            member.id,
            name,
            'transaction',
            contributorId,
          );
        }
      }
      if (!serviceMemberIds.has(member.id)) {
        membershipsToAdd.push(
          this.discipleshipMembershipRepo.create({
            churchId,
            memberId: member.id,
            groupId: serviceGroup.id,
          }),
        );
        serviceMemberIds.add(member.id);
      }
    }

    if (membershipsToAdd.length > 0) {
      await this.discipleshipMembershipRepo.save(membershipsToAdd);
    }
    const persistedContributorLinks =
      await this.discipleshipMemberContributorRepo.find({
        where: { churchId },
      });
    persistedContributorLinks.forEach((link) => {
      memberIdByContributorId.set(link.contributorId, link.memberId);
    });
    members.forEach((member) => {
      if (member.contributorId) {
        memberIdByContributorId.set(member.contributorId, member.id);
      }
    });
    const attendanceCreated = await this.syncContributionAttendanceForMembers(
      churchId,
      serviceGroup.id,
      memberIdByContributorId,
    );
    const postMerged =
      await this.consolidateDuplicateDiscipleshipMembers(churchId);

    return {
      serviceGroup,
      created,
      assigned: membershipsToAdd.length,
      attendanceCreated,
      merged: preMerged + postMerged,
    };
  }

  private buildTransactionDiscipleshipIdentities(rows: any[]) {
    const identities = new Map<string, TransactionDiscipleshipIdentity>();

    for (const row of rows) {
      const contributorId = this.normalizeOptionalText(row.id, 36);
      const fullName = this.normalizeOptionalText(row.name, 180);
      if (
        !contributorId ||
        !fullName ||
        fullName.toLowerCase() === 'anonymous contributor'
      ) {
        continue;
      }

      const phone = this.normalizePlainPhone(row.phone);
      const nameKey = this.normalizeImportKey(fullName);
      const observedNames = `${row.observedNames || ''}`
        .split('|||')
        .map((name) => this.normalizeOptionalText(name, 180))
        .filter((name): name is string => Boolean(name));
      const names = [...new Set([fullName, ...observedNames])];
      const providerPayerIds = `${row.providerPayerIds || ''}`
        .split('|||')
        .map((value) => this.normalizeOptionalText(value, 180))
        .filter((value): value is string => Boolean(value));
      if (!nameKey) {
        continue;
      }
      const key = phone
        ? `phone:${phone}`
        : providerPayerIds[0]
          ? `provider:${providerPayerIds[0]}`
          : `name:${nameKey}`;
      const existing = identities.get(key);

      if (!existing) {
        identities.set(key, {
          key,
          contributorIds: [contributorId],
          names,
          fullName: this.chooseDiscipleshipTransactionName(names),
          phone,
          providerPayerIds,
          gender: this.normalizeGenderText(row.gender),
          firstContributionAt: row.firstContributionAt,
          nameKey,
        });
        continue;
      }

      if (!existing.contributorIds.includes(contributorId)) {
        existing.contributorIds.push(contributorId);
      }
      for (const name of names) {
        if (!existing.names.includes(name)) {
          existing.names.push(name);
        }
      }
      if (existing.names.length > 1) {
        existing.fullName = this.chooseDiscipleshipTransactionName(
          existing.names,
        );
        existing.nameKey = this.normalizeImportKey(existing.fullName);
      }
      if (!existing.phone && phone) {
        existing.phone = phone;
      }
      existing.providerPayerIds = [
        ...new Set([...existing.providerPayerIds, ...providerPayerIds]),
      ];
      if (!existing.gender && row.gender) {
        existing.gender = this.normalizeGenderText(row.gender);
      }
      existing.firstContributionAt =
        this.pickEarlierDiscipleshipDateValue(
          existing.firstContributionAt,
          row.firstContributionAt,
        ) || existing.firstContributionAt;
    }

    return [...identities.values()];
  }

  private chooseDiscipleshipTransactionName(names: string[]) {
    const uniqueNames = [
      ...new Set(names.map((name) => name.trim()).filter(Boolean)),
    ];
    if (uniqueNames.length === 0) {
      return '';
    }
    return uniqueNames.sort(
      (left, right) => right.length - left.length || left.localeCompare(right),
    )[0];
  }

  private pickEarlierDiscipleshipDateValue(current: unknown, next: unknown) {
    const currentDate = this.normalizeDateFromImport(current);
    const nextDate = this.normalizeDateFromImport(next);
    if (!currentDate) {
      return next;
    }
    if (!nextDate) {
      return current;
    }
    return nextDate < currentDate ? next : current;
  }

  private async findSafeDiscipleshipNameMatch(
    churchId: string,
    identity: TransactionDiscipleshipIdentity,
    members: DiscipleshipMember[],
    aliases: DiscipleshipMemberAlias[],
  ) {
    const observedNameKeys = new Set(
      identity.names
        .map((name) => this.normalizeImportKey(name))
        .filter(Boolean),
    );
    const exactMatches = members.filter((member) => {
      if (observedNameKeys.has(this.normalizeImportKey(member.fullName))) {
        return true;
      }
      return aliases.some(
        (alias) =>
          alias.memberId === member.id &&
          observedNameKeys.has(alias.normalizedAlias),
      );
    });
    const exactCompatible = exactMatches.filter(
      (member) =>
        !this.hasDiscipleshipPhoneConflict(identity.phone, member.phone),
    );
    if (exactCompatible.length === 1) {
      return exactCompatible[0];
    }

    const scored = members
      .map((member) => {
        const names = [
          member.fullName,
          ...aliases
            .filter((alias) => alias.memberId === member.id)
            .map((alias) => alias.alias),
        ];
        const score = Math.max(
          ...identity.names.flatMap((observedName) =>
            names.map((candidateName) =>
              this.scoreDiscipleshipNameMatch(observedName, candidateName),
            ),
          ),
        );
        return {
          member,
          score,
          phoneConflict: this.hasDiscipleshipPhoneConflict(
            identity.phone,
            member.phone,
          ),
        };
      })
      .filter((item) => item.score >= 180)
      .sort((left, right) => right.score - left.score);

    const compatible = scored.filter((item) => !item.phoneConflict);
    if (
      exactCompatible.length === 0 &&
      compatible.length === 1 &&
      (scored.length === 1 || compatible[0].score > scored[1].score)
    ) {
      return compatible[0].member;
    }

    const candidates =
      exactMatches.length > 0
        ? exactMatches.map((member) => ({
            member,
            score: 300,
            phoneConflict: this.hasDiscipleshipPhoneConflict(
              identity.phone,
              member.phone,
            ),
          }))
        : scored;
    if (candidates.length > 0) {
      await this.saveDiscipleshipMatchCandidates(
        churchId,
        identity,
        candidates,
      );
    }

    return null;
  }

  private async findDiscipleshipCreateConflict(
    churchId: string,
    fullName: string,
    phone: string,
  ) {
    const normalizedPhone = this.normalizePlainPhone(phone);
    const normalizedName = this.normalizeImportKey(fullName);
    const members = await this.discipleshipMemberRepo.find({
      where: { churchId },
      order: { createdAt: 'ASC' },
    });
    const aliases = await this.discipleshipMemberAliasRepo.find({
      where: { churchId },
    });

    if (normalizedPhone) {
      const phoneMatch = members.find(
        (member) => this.normalizePlainPhone(member.phone) === normalizedPhone,
      );
      if (phoneMatch) {
        return {
          member: phoneMatch,
          reason: 'A disciple with this phone number already exists',
        };
      }
    }

    const exactNameMatch = members.find((member) => {
      if (this.normalizeImportKey(member.fullName) === normalizedName) {
        return true;
      }
      return aliases.some(
        (alias) =>
          alias.memberId === member.id &&
          alias.normalizedAlias === normalizedName,
      );
    });
    if (exactNameMatch) {
      return {
        member: exactNameMatch,
        reason: 'A disciple with this name already exists',
      };
    }

    const scored = members
      .map((member) => {
        const candidateNames = [
          member.fullName,
          ...aliases
            .filter((alias) => alias.memberId === member.id)
            .map((alias) => alias.alias),
        ];
        const score = Math.max(
          ...candidateNames.map((candidateName) =>
            this.scoreDiscipleshipNameMatch(fullName, candidateName),
          ),
        );
        return {
          member,
          score,
          phoneConflict: this.hasDiscipleshipPhoneConflict(
            normalizedPhone,
            member.phone,
          ),
        };
      })
      .filter((item) => item.score >= 180 && !item.phoneConflict)
      .sort((left, right) => right.score - left.score);

    if (scored.length === 1) {
      return {
        member: scored[0].member,
        reason: 'This looks like an existing disciple',
      };
    }

    return null;
  }

  private scoreDiscipleshipDuplicatePair(
    left: DiscipleshipMember,
    right: DiscipleshipMember,
    aliases: DiscipleshipMemberAlias[],
  ) {
    const leftNames = this.getDiscipleshipKnownNames(left, aliases);
    const rightNames = this.getDiscipleshipKnownNames(right, aliases);
    let bestScore = 0;
    for (const leftName of leftNames) {
      for (const rightName of rightNames) {
        const leftKey = this.normalizeImportKey(leftName);
        const rightKey = this.normalizeImportKey(rightName);
        if (leftKey && leftKey === rightKey) {
          bestScore = Math.max(bestScore, 300);
          continue;
        }
        bestScore = Math.max(
          bestScore,
          this.scoreDiscipleshipNameMatch(leftName, rightName),
          this.scoreDiscipleshipLooseNameReview(leftName, rightName),
        );
      }
    }
    return bestScore;
  }

  private getDiscipleshipKnownNames(
    member: DiscipleshipMember,
    aliases: DiscipleshipMemberAlias[],
  ) {
    return [
      member.fullName,
      ...aliases
        .filter((alias) => alias.memberId === member.id)
        .map((alias) => alias.alias),
    ].filter(Boolean);
  }

  private scoreDiscipleshipLooseNameReview(left: string, right: string) {
    const leftParts = this.getDiscipleshipNameParts(left);
    const rightParts = this.getDiscipleshipNameParts(right);
    if (leftParts.length === 0 || rightParts.length === 0) {
      return 0;
    }
    const leftFirst = leftParts[0];
    const rightFirst = rightParts[0];
    if (leftFirst !== rightFirst) {
      return 0;
    }
    const leftSet = new Set(leftParts);
    const rightSet = new Set(rightParts);
    const shared = [...leftSet].filter((part) => rightSet.has(part));
    if (shared.length >= 2) {
      return shared.length * 80 - Math.abs(leftSet.size - rightSet.size) * 10;
    }
    if (leftParts.length === 1 || rightParts.length === 1) {
      return 70;
    }
    return 0;
  }

  private buildDiscipleshipDuplicateClusterKey(memberIds: string[]) {
    return [...new Set(memberIds)].sort().join('|');
  }

  private async getDiscipleshipAttendanceCounts(
    churchId: string,
    memberIds: string[],
  ) {
    if (memberIds.length === 0) {
      return new Map<string, number>();
    }
    const rows = await this.discipleshipAttendanceRepo
      .createQueryBuilder('attendance')
      .select('attendance.memberId', 'memberId')
      .addSelect('COUNT(*)', 'count')
      .where('attendance.churchId = :churchId', { churchId })
      .andWhere('attendance.memberId IN (:...memberIds)', { memberIds })
      .groupBy('attendance.memberId')
      .getRawMany();
    return new Map(
      rows.map((row) => [row.memberId, Number(row.count || 0)] as const),
    );
  }

  private async upsertDiscipleshipDuplicateReview(
    churchId: string,
    reviewedByUserId: string,
    clusterKey: string,
    memberIds: string[],
    status: DiscipleshipDuplicateReviewStatus,
  ) {
    let review = await this.discipleshipDuplicateReviewRepo.findOne({
      where: { churchId, clusterKey },
    });
    review =
      review ||
      this.discipleshipDuplicateReviewRepo.create({
        churchId,
        clusterKey,
      });
    review.memberIdsSnapshot = JSON.stringify([...new Set(memberIds)].sort());
    review.status = status;
    review.reviewedByUserId = reviewedByUserId;
    review.reviewedAt = new Date();
    return this.discipleshipDuplicateReviewRepo.save(review);
  }

  private scoreDiscipleshipNameMatch(left: string, right: string) {
    const leftParts = this.getDiscipleshipNameParts(left);
    const rightParts = this.getDiscipleshipNameParts(right);
    if (leftParts.length < 2 || rightParts.length < 2) {
      return 0;
    }

    const leftSet = new Set(leftParts);
    const rightSet = new Set(rightParts);
    const shared = [...leftSet].filter((part) => rightSet.has(part));
    const shorter = leftSet.size <= rightSet.size ? leftSet : rightSet;
    const shorterContained = [...shorter].every((part) =>
      (leftSet.size <= rightSet.size ? rightSet : leftSet).has(part),
    );
    if (shared.length < 2 || !shorterContained) {
      return 0;
    }
    return shared.length * 100 - Math.abs(leftSet.size - rightSet.size) * 10;
  }

  private getDiscipleshipNameParts(value: unknown) {
    return this.normalizeImportKey(value)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((part) => part.length > 1);
  }

  private hasDiscipleshipPhoneConflict(
    transactionPhone: string | null,
    memberPhone: string | null,
  ) {
    const normalizedMemberPhone = this.normalizePlainPhone(memberPhone);
    return Boolean(
      transactionPhone &&
      normalizedMemberPhone &&
      transactionPhone !== normalizedMemberPhone,
    );
  }

  private hasDiscipleshipNumberIdentityConflict(
    left: Set<string>,
    right: Set<string>,
  ) {
    if (left.size === 0 || right.size === 0) {
      return false;
    }
    return ![...left].some((identity) => right.has(identity));
  }

  private async saveDiscipleshipMatchCandidates(
    churchId: string,
    identity: TransactionDiscipleshipIdentity,
    candidates: {
      member: DiscipleshipMember;
      score: number;
      phoneConflict: boolean;
    }[],
  ) {
    for (const contributorId of identity.contributorIds) {
      for (const candidate of candidates.slice(0, 5)) {
        let record = await this.discipleshipMatchCandidateRepo.findOne({
          where: {
            contributorId,
            candidateMemberId: candidate.member.id,
          },
        });
        if (record?.status === DiscipleshipMatchCandidateStatus.DISMISSED) {
          continue;
        }
        record =
          record ||
          this.discipleshipMatchCandidateRepo.create({
            churchId,
            contributorId,
            candidateMemberId: candidate.member.id,
            status: DiscipleshipMatchCandidateStatus.PENDING,
            reviewedByUserId: null,
            reviewedAt: null,
          });
        record.observedName = identity.fullName;
        record.normalizedName = identity.nameKey;
        record.matchReason = candidate.phoneConflict
          ? 'matching name parts, but phone numbers conflict'
          : 'matching name parts require confirmation';
        record.matchScore = candidate.score;
        if (record.status !== DiscipleshipMatchCandidateStatus.CONFIRMED) {
          record.status = DiscipleshipMatchCandidateStatus.PENDING;
        }
        await this.discipleshipMatchCandidateRepo.save(record);
      }
    }
  }

  private async ensureDiscipleshipMemberAlias(
    churchId: string,
    memberId: string,
    aliasValue: unknown,
    source: string,
    contributorId: string | null = null,
  ) {
    const alias = this.normalizeOptionalText(aliasValue, 180);
    const normalizedAlias = this.normalizeImportKey(alias);
    if (!alias || !normalizedAlias) {
      return null;
    }
    const existing = await this.discipleshipMemberAliasRepo.findOne({
      where: { memberId, normalizedAlias },
    });
    if (existing) {
      if (!existing.contributorId && contributorId) {
        existing.contributorId = contributorId;
        return this.discipleshipMemberAliasRepo.save(existing);
      }
      return existing;
    }
    return this.discipleshipMemberAliasRepo.save(
      this.discipleshipMemberAliasRepo.create({
        churchId,
        memberId,
        contributorId,
        alias,
        normalizedAlias,
        source,
      }),
    );
  }

  private async linkDiscipleshipContributor(
    churchId: string,
    member: DiscipleshipMember,
    contributorId: string,
    matchMethod: string,
  ) {
    const existing = await this.discipleshipMemberContributorRepo.findOne({
      where: { churchId, contributorId },
    });
    if (existing) {
      return existing;
    }
    return this.discipleshipMemberContributorRepo.save(
      this.discipleshipMemberContributorRepo.create({
        churchId,
        memberId: member.id,
        contributorId,
        matchMethod,
        isConfirmed: true,
      }),
    );
  }

  private async findDiscipleshipMemberForTransactionIdentity(
    churchId: string,
    identity: TransactionDiscipleshipIdentity,
  ) {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {
      churchId,
    };

    if (identity.contributorIds.length > 0) {
      conditions.push('member.contributorId IN (:...contributorIds)');
      params.contributorIds = identity.contributorIds;
    }
    if (identity.phone) {
      conditions.push('member.phone = :phone');
      params.phone = identity.phone;
    }
    if (conditions.length === 0) {
      return null;
    }

    return this.discipleshipMemberRepo
      .createQueryBuilder('member')
      .where('member.churchId = :churchId', { churchId })
      .andWhere(`(${conditions.join(' OR ')})`, params)
      .orderBy('member.createdAt', 'ASC')
      .getOne();
  }

  private async consolidateDuplicateDiscipleshipMembers(churchId: string) {
    const members = await this.discipleshipMemberRepo.find({
      where: { churchId },
      order: { createdAt: 'ASC' },
    });
    const membersByName = new Map<string, DiscipleshipMember[]>();

    members.forEach((member) => {
      const key = this.normalizeImportKey(member.fullName);
      if (!key) {
        return;
      }
      const items = membersByName.get(key) || [];
      items.push(member);
      membersByName.set(key, items);
    });

    let merged = 0;
    for (const group of membersByName.values()) {
      if (
        group.length < 2 ||
        !group.some((member) => Boolean(member.contributorId))
      ) {
        continue;
      }
      const [canonical, ...duplicates] =
        this.sortDiscipleshipMergeCandidates(group);
      await this.mergeDiscipleshipMemberRecords(
        churchId,
        canonical,
        duplicates,
      );
      merged += duplicates.length;
    }

    return merged;
  }

  private sortDiscipleshipMergeCandidates(members: DiscipleshipMember[]) {
    return [...members].sort((left, right) => {
      if (!!left.createdByUserId !== !!right.createdByUserId) {
        return left.createdByUserId ? -1 : 1;
      }
      if (!!left.contributorId !== !!right.contributorId) {
        return left.contributorId ? -1 : 1;
      }
      const leftCreated = left.createdAt
        ? new Date(left.createdAt).getTime()
        : 0;
      const rightCreated = right.createdAt
        ? new Date(right.createdAt).getTime()
        : 0;
      return leftCreated - rightCreated;
    });
  }

  private async mergeDiscipleshipMemberRecords(
    churchId: string,
    canonical: DiscipleshipMember,
    duplicates: DiscipleshipMember[],
  ) {
    const duplicateIds = duplicates.map((member) => member.id);
    if (duplicateIds.length === 0) {
      return;
    }

    const memberIds = [canonical.id, ...duplicateIds];
    const memberships = await this.discipleshipMembershipRepo.find({
      where: { churchId, memberId: In(memberIds) },
    });
    const canonicalGroupIds = new Set(
      memberships
        .filter((membership) => membership.memberId === canonical.id)
        .map((membership) => membership.groupId),
    );
    const membershipsToAdd: DiscipleshipMembership[] = [];

    memberships
      .filter((membership) => duplicateIds.includes(membership.memberId))
      .forEach((membership) => {
        if (canonicalGroupIds.has(membership.groupId)) {
          return;
        }
        canonicalGroupIds.add(membership.groupId);
        membershipsToAdd.push(
          this.discipleshipMembershipRepo.create({
            churchId,
            memberId: canonical.id,
            groupId: membership.groupId,
          }),
        );
      });

    if (membershipsToAdd.length > 0) {
      await this.discipleshipMembershipRepo.save(membershipsToAdd);
    }
    await this.discipleshipMembershipRepo.delete({
      churchId,
      memberId: In(duplicateIds),
    });

    const attendance = await this.discipleshipAttendanceRepo.find({
      where: { churchId, memberId: In(memberIds) },
      order: { createdAt: 'ASC' },
    });
    const canonicalKeys = new Set(
      attendance
        .filter((item) => item.memberId === canonical.id)
        .map((item) => this.getDiscipleshipAttendanceMergeKey(item)),
    );
    const attendanceToDelete: string[] = [];

    for (const item of attendance.filter((row) =>
      duplicateIds.includes(row.memberId),
    )) {
      const key = this.getDiscipleshipAttendanceMergeKey(item);
      if (canonicalKeys.has(key)) {
        attendanceToDelete.push(item.id);
        continue;
      }
      canonicalKeys.add(key);
      await this.discipleshipAttendanceRepo.update(
        { id: item.id, churchId },
        { memberId: canonical.id },
      );
    }

    if (attendanceToDelete.length > 0) {
      await this.discipleshipAttendanceRepo.delete({
        id: In(attendanceToDelete),
        churchId,
      });
    }

    const duplicateAliases = await this.discipleshipMemberAliasRepo.find({
      where: { churchId, memberId: In(duplicateIds) },
    });
    for (const alias of duplicateAliases) {
      await this.ensureDiscipleshipMemberAlias(
        churchId,
        canonical.id,
        alias.alias,
        alias.source,
        alias.contributorId,
      );
    }
    await this.discipleshipMemberAliasRepo.delete({
      churchId,
      memberId: In(duplicateIds),
    });

    const duplicateLinks = await this.discipleshipMemberContributorRepo.find({
      where: { churchId, memberId: In(duplicateIds) },
    });
    for (const link of duplicateLinks) {
      await this.discipleshipMemberContributorRepo.update(
        { id: link.id },
        { memberId: canonical.id },
      );
    }
    await this.discipleshipMatchCandidateRepo.delete({
      churchId,
      candidateMemberId: In(duplicateIds),
    });

    let needsSave = false;
    const earliestEnrollmentDate = [canonical, ...duplicates]
      .map((member) => member.enrollmentDate)
      .filter(Boolean)
      .sort()[0];
    const contributorId = duplicates.find(
      (member) => member.contributorId,
    )?.contributorId;
    const phone = duplicates.find((member) => member.phone)?.phone;
    const email = duplicates.find((member) => member.email)?.email;
    const gender = duplicates.find((member) => member.gender)?.gender;
    const notes = duplicates.find((member) => member.notes)?.notes;

    if (!canonical.contributorId && contributorId) {
      canonical.contributorId = contributorId;
      needsSave = true;
    }
    if (!canonical.phone && phone) {
      canonical.phone = phone;
      needsSave = true;
    }
    if (!canonical.email && email) {
      canonical.email = email;
      needsSave = true;
    }
    if (!canonical.gender && gender) {
      canonical.gender = gender;
      needsSave = true;
    }
    if (!canonical.notes && notes) {
      canonical.notes = notes;
      needsSave = true;
    }
    if (
      earliestEnrollmentDate &&
      (!canonical.enrollmentDate ||
        earliestEnrollmentDate < canonical.enrollmentDate)
    ) {
      canonical.enrollmentDate = earliestEnrollmentDate;
      needsSave = true;
    }
    if (
      canonical.status !== DiscipleshipMemberStatus.ACTIVE &&
      duplicates.some(
        (member) => member.status === DiscipleshipMemberStatus.ACTIVE,
      )
    ) {
      canonical.status = DiscipleshipMemberStatus.ACTIVE;
      needsSave = true;
    }

    if (needsSave) {
      await this.discipleshipMemberRepo.save(canonical);
    }

    await this.discipleshipMemberRepo.delete({
      churchId,
      id: In(duplicateIds),
    });
  }

  private getDiscipleshipAttendanceMergeKey(
    attendance: Pick<
      DiscipleshipAttendance,
      'attendanceDate' | 'attendanceType' | 'groupId' | 'eventName'
    >,
  ) {
    return [
      attendance.attendanceDate,
      attendance.attendanceType,
      attendance.groupId || '',
      this.normalizeImportKey(attendance.eventName),
    ].join('|');
  }

  private async syncContributionAttendanceForMembers(
    churchId: string,
    groupId: string,
    memberIdByContributorId: Map<string, string>,
  ) {
    const contributorIds = [...memberIdByContributorId.keys()];
    if (contributorIds.length === 0) {
      return 0;
    }

    const contributions = await this.contributionRepo.find({
      where: {
        churchId,
        status: ContributionStatus.CONFIRMED,
        contributorId: In(contributorIds),
      },
      order: { receivedAt: 'ASC', createdAt: 'ASC' },
    });
    if (contributions.length === 0) {
      return 0;
    }

    const memberIds = [...new Set(memberIdByContributorId.values())];
    const existingAttendance = await this.discipleshipAttendanceRepo.find({
      where: {
        churchId,
        groupId,
        attendanceType: DiscipleshipAttendanceType.GROUP,
        memberId: In(memberIds),
      },
    });
    const existingKeys = new Set(
      existingAttendance.map(
        (item) => `${item.memberId}|${item.attendanceDate}`,
      ),
    );
    const attendanceToCreate: DiscipleshipAttendance[] = [];

    for (const contribution of contributions) {
      if (!contribution.contributorId) {
        continue;
      }
      const memberId = memberIdByContributorId.get(contribution.contributorId);
      if (!memberId) {
        continue;
      }
      const attendanceDate = this.getNairobiDateFromInstant(
        contribution.receivedAt || contribution.createdAt,
      );
      const key = `${memberId}|${attendanceDate}`;
      if (existingKeys.has(key)) {
        continue;
      }
      existingKeys.add(key);
      const dateParts = this.getNairobiDateParts(attendanceDate);
      attendanceToCreate.push(
        this.discipleshipAttendanceRepo.create({
          churchId,
          memberId,
          attendanceDate,
          weekday: dateParts.weekday,
          attendanceType: DiscipleshipAttendanceType.GROUP,
          groupId,
          eventName: null,
          markedByUserId: null,
          markedAt: contribution.receivedAt || contribution.createdAt,
        }),
      );
    }

    if (attendanceToCreate.length > 0) {
      await this.discipleshipAttendanceRepo.save(attendanceToCreate);
    }

    return attendanceToCreate.length;
  }

  private normalizePlainPhone(value: unknown) {
    const normalized = this.normalizeOptionalText(value, 30);
    if (!normalized) {
      return null;
    }
    const digits = normalized.replace(/[^\d]/g, '');
    if (!/^\d{9,15}$/.test(digits)) {
      return null;
    }
    if (
      !(
        digits.startsWith('254') ||
        digits.startsWith('07') ||
        digits.startsWith('01') ||
        digits.startsWith('7') ||
        digits.startsWith('1')
      )
    ) {
      return null;
    }
    if (/^0[17]\d{8}$/.test(digits)) {
      return `254${digits.slice(1)}`;
    }
    if (/^[17]\d{8}$/.test(digits)) {
      return `254${digits}`;
    }
    return digits;
  }

  private normalizeDateFromImport(value: unknown) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    const text = this.normalizeOptionalText(value, 40);
    if (!text) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      return this.normalizeDateOnly(text.slice(0, 10));
    }
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString().slice(0, 10);
  }

  private getNairobiDateFromInstant(value: unknown) {
    const instant = value instanceof Date ? value : new Date(`${value}`);
    if (Number.isNaN(instant.getTime())) {
      return this.getNairobiDateParts().date;
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
  }

  private async parseDiscipleshipMemberImportRows(file: any) {
    const extension = extname(file.originalname || '').toLowerCase();
    if (!['.xlsx', '.csv'].includes(extension)) {
      throw new BadRequestException('Upload an XLSX or CSV file');
    }

    const matrix =
      extension === '.csv'
        ? this.parseCsvImportMatrix(file.buffer.toString('utf8'))
        : await this.parseExcelImportMatrix(file.buffer);
    if (matrix.length === 0) {
      return [];
    }

    const [header, ...dataRows] = matrix;
    const headerMap = this.buildImportHeaderMap(header.values || []);
    if (!headerMap.has('fullName')) {
      throw new BadRequestException(
        'Template must include a fullName or Full Name column',
      );
    }

    return dataRows
      .map((row) => ({
        rowNumber: row.rowNumber,
        fullName: this.getImportCell(row.values, headerMap, 'fullName'),
        phone: this.getImportCell(row.values, headerMap, 'phone'),
        email: this.getImportCell(row.values, headerMap, 'email'),
        gender: this.getImportCell(row.values, headerMap, 'gender'),
        firstTimeAtChurch: this.getImportCell(
          row.values,
          headerMap,
          'firstTimeAtChurch',
        ),
        enrollmentDate: this.getImportCell(
          row.values,
          headerMap,
          'enrollmentDate',
        ),
        groups: this.getImportCell(row.values, headerMap, 'groups'),
        churchRoleNotes: this.getImportCell(
          row.values,
          headerMap,
          'churchRoleNotes',
        ),
        notes: this.getImportCell(row.values, headerMap, 'notes'),
      }))
      .filter((row) =>
        [
          row.fullName,
          row.phone,
          row.email,
          row.gender,
          row.firstTimeAtChurch,
          row.enrollmentDate,
          row.groups,
          row.churchRoleNotes,
          row.notes,
        ].some((value) => this.normalizeOptionalText(value, 1200)),
      );
  }

  private async parseExcelImportMatrix(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('Unable to read the uploaded workbook');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return [];
    }
    const matrix: { rowNumber: number; values: unknown[] }[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values: unknown[] = [];
      const cellCount = Math.max(row.cellCount, 1);
      for (let index = 1; index <= cellCount; index += 1) {
        values.push(this.getExcelCellValue(row.getCell(index).value));
      }
      matrix.push({ rowNumber, values });
    });
    return matrix;
  }

  private parseCsvImportMatrix(csvText: string) {
    const rows: { rowNumber: number; values: unknown[] }[] = [];
    let row: string[] = [];
    let current = '';
    let inQuotes = false;
    let rowNumber = 1;

    for (let index = 0; index < csvText.length; index += 1) {
      const char = csvText[index];
      const next = csvText[index + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) {
        row.push(current);
        current = '';
        continue;
      }
      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') {
          index += 1;
        }
        row.push(current);
        if (row.some((cell) => cell.trim())) {
          rows.push({ rowNumber, values: row });
        }
        row = [];
        current = '';
        rowNumber += 1;
        continue;
      }
      current += char;
    }

    row.push(current);
    if (row.some((cell) => cell.trim())) {
      rows.push({ rowNumber, values: row });
    }
    return rows;
  }

  private getExcelCellValue(value: ExcelJS.CellValue) {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    if (value && typeof value === 'object') {
      if ('text' in value) {
        return value.text;
      }
      if ('result' in value) {
        return this.getExcelCellValue(value.result as ExcelJS.CellValue);
      }
      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText.map((item) => item.text || '').join('');
      }
    }
    return value ?? '';
  }

  private buildImportHeaderMap(headerRow: unknown[]) {
    const aliases = new Map<string, string>([
      ['fullname', 'fullName'],
      ['full name', 'fullName'],
      ['name', 'fullName'],
      ['member name', 'fullName'],
      ['phone', 'phone'],
      ['phone number', 'phone'],
      ['mobile', 'phone'],
      ['email', 'email'],
      ['email address', 'email'],
      ['gender', 'gender'],
      ['sex', 'gender'],
      ['firsttimeatchurch', 'firstTimeAtChurch'],
      ['first time at church', 'firstTimeAtChurch'],
      ['firsttime', 'firstTimeAtChurch'],
      ['first time', 'firstTimeAtChurch'],
      ['enrollmentdate', 'enrollmentDate'],
      ['enrollment date', 'enrollmentDate'],
      ['enrolment date', 'enrollmentDate'],
      ['date enrolled', 'enrollmentDate'],
      ['groups', 'groups'],
      ['group', 'groups'],
      ['church groups', 'groups'],
      ['churchrolenotes', 'churchRoleNotes'],
      ['church role notes', 'churchRoleNotes'],
      ['role', 'churchRoleNotes'],
      ['small christian community', 'churchRoleNotes'],
      ['small christian community notes', 'churchRoleNotes'],
      ['notes', 'notes'],
      ['note', 'notes'],
    ]);
    const headerMap = new Map<string, number>();

    headerRow.forEach((cell, index) => {
      const key = this.normalizeImportKey(cell);
      const field = aliases.get(key);
      if (field && !headerMap.has(field)) {
        headerMap.set(field, index);
      }
    });

    return headerMap;
  }

  private getImportCell(
    row: unknown[],
    headerMap: Map<string, number>,
    field: string,
  ) {
    const index = headerMap.get(field);
    if (index === undefined) {
      return '';
    }
    return row[index] ?? '';
  }

  private normalizeImportKey(value: unknown) {
    return `${value || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private splitImportGroups(value: unknown) {
    const raw = this.normalizeOptionalText(value, 500);
    if (!raw) {
      return [];
    }
    return [
      ...new Set(
        raw
          .split(/[;,]/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
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
        const visibleFrom = this.normalizeFundDisplayTimestamp(
          item.visibleFrom,
        );
        const visibleUntil = this.normalizeFundDisplayTimestamp(
          item.visibleUntil,
        );
        const storedDuration = this.normalizeFundDisplayDurationMinutes(
          item.approvalDurationMinutes,
          false,
        );
        const derivedDuration =
          !storedDuration && visibleFrom && visibleUntil
            ? Math.max(
                1,
                Math.round(
                  (new Date(visibleUntil).getTime() -
                    new Date(visibleFrom).getTime()) /
                    60_000,
                ),
              )
            : null;

        return {
          id: this.normalizeOptionalText(item.id, 80) || randomUUID(),
          title: this.normalizeOptionalText(item.title, 180),
          description: this.normalizeOptionalText(item.description, 700),
          fundAccountId: this.normalizeOptionalText(item.fundAccountId, 36),
          startDate,
          targetAmount: this.normalizeFundDisplayTargetAmount(
            item.targetAmount,
          ),
          endMode,
          endDate,
          isActive: item.isActive === false ? false : true,
          approvalStatus:
            item.approvalStatus === 'pending' ||
            item.approvalStatus === 'rejected' ||
            item.approvalStatus === 'approved'
              ? item.approvalStatus
              : null,
          requestedByUserId: this.normalizeOptionalText(
            item.requestedByUserId,
            36,
          ),
          approvedByUserId: this.normalizeOptionalText(
            item.approvedByUserId,
            36,
          ),
          approvedAt: this.normalizeOptionalText(item.approvedAt, 40),
          rejectedAt: this.normalizeOptionalText(item.rejectedAt, 40),
          approvalNote: this.normalizeOptionalText(item.approvalNote, 240),
          approvalDurationMinutes: storedDuration || derivedDuration,
          visibleFrom,
          visibleUntil,
          createdAt: this.normalizeFundDisplayTimestamp(item.createdAt),
          createdByUserId: this.normalizeOptionalText(item.createdByUserId, 36),
          updatedAt: this.normalizeFundDisplayTimestamp(item.updatedAt),
          updatedByUserId: this.normalizeOptionalText(item.updatedByUserId, 36),
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

  private applyFundDisplayApprovalState(
    previousDisplays: CongregationFundDisplay[],
    nextDisplays: CongregationFundDisplay[],
    userId: string,
    isPriest: boolean,
  ) {
    const previousById = new Map(
      previousDisplays
        .filter((display) => display.id)
        .map((display) => [display.id as string, display]),
    );
    const now = new Date().toISOString();
    const pendingIds: string[] = [];

    const items = nextDisplays.map((display) => {
      const previous = display.id ? previousById.get(display.id) : undefined;
      const previousStatus = previous?.approvalStatus || 'approved';
      const changed =
        !previous ||
        this.getFundDisplayComparable(previous) !==
          this.getFundDisplayComparable(display);
      const auditedDisplay = {
        ...display,
        createdAt: previous?.createdAt || display.createdAt || now,
        createdByUserId:
          previous?.createdByUserId ||
          display.createdByUserId ||
          previous?.requestedByUserId ||
          userId,
        updatedAt: changed
          ? now
          : previous?.updatedAt || display.updatedAt || now,
        updatedByUserId: changed
          ? userId
          : previous?.updatedByUserId || display.updatedByUserId || userId,
      };

      if (isPriest) {
        const visibility =
          changed && display.approvalDurationMinutes
            ? this.buildFundDisplayDurationWindow(
                display.approvalDurationMinutes,
              )
            : {
                approvalDurationMinutes:
                  previous?.approvalDurationMinutes ||
                  display.approvalDurationMinutes ||
                  null,
                visibleFrom:
                  previous?.visibleFrom || display.visibleFrom || null,
                visibleUntil:
                  previous?.visibleUntil || display.visibleUntil || null,
              };
        return {
          ...auditedDisplay,
          ...visibility,
          approvalStatus: 'approved' as const,
          requestedByUserId: previous?.requestedByUserId || userId,
          approvedByUserId: userId,
          approvedAt: display.approvedAt || now,
          rejectedAt: null,
          approvalNote: display.approvalNote || null,
        };
      }

      if (!changed) {
        return {
          ...auditedDisplay,
          approvalStatus: previousStatus,
          requestedByUserId:
            previous?.requestedByUserId || display.requestedByUserId || null,
          approvedByUserId:
            previous?.approvedByUserId || display.approvedByUserId || null,
          approvedAt: previous?.approvedAt || display.approvedAt || null,
          rejectedAt: previous?.rejectedAt || display.rejectedAt || null,
          approvalNote: previous?.approvalNote || display.approvalNote || null,
        };
      }

      pendingIds.push(display.id as string);
      return {
        ...auditedDisplay,
        approvalStatus: 'pending' as const,
        requestedByUserId: userId,
        approvedByUserId: null,
        approvedAt: null,
        rejectedAt: null,
        approvalNote: null,
      };
    });

    return { items, pendingIds };
  }

  private getFundDisplayComparable(display: CongregationFundDisplay) {
    return JSON.stringify({
      title: display.title || null,
      description: display.description || null,
      fundAccountId: display.fundAccountId,
      startDate: display.startDate,
      endMode: display.endMode || 'to_date',
      endDate: display.endMode === 'static' ? display.endDate || null : null,
      isActive: display.isActive !== false,
      visibleFrom: display.visibleFrom || null,
      visibleUntil: display.visibleUntil || null,
      approvalDurationMinutes: display.approvalDurationMinutes || null,
    });
  }

  private normalizeFundDisplayTimestamp(value: unknown) {
    const normalized = this.normalizeOptionalText(value, 60);
    if (!normalized) {
      return null;
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid fund display visibility date');
    }
    return parsed.toISOString();
  }

  private normalizeFundDisplayTargetAmount(value: unknown) {
    if (
      value === undefined ||
      value === null ||
      `${value}`.trim().length === 0
    ) {
      return null;
    }

    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Fund display target must be a positive amount',
      );
    }

    return Number(amount.toFixed(2));
  }

  private normalizeFundAccountTargetAmount(value: unknown) {
    if (
      value === undefined ||
      value === null ||
      `${value}`.trim().length === 0
    ) {
      return null;
    }

    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Fund account target must be a positive amount',
      );
    }

    return Number(amount.toFixed(2));
  }

  private isGeneralFundAccount(account: Pick<FundAccount, 'code' | 'name'>) {
    return `${account?.code || account?.name || ''}`.trim().toLowerCase() ===
      'general';
  }

  private resolveFundDisplayTargetAmount(
    fundAccount: FundAccount | null | undefined,
    display: Partial<CongregationFundDisplay>,
  ) {
    const accountTarget = Number(fundAccount?.targetAmount || 0);
    if (Number.isFinite(accountTarget) && accountTarget > 0) {
      return Number(accountTarget.toFixed(2));
    }

    const legacyDisplayTarget = Number(display.targetAmount || 0);
    return Number.isFinite(legacyDisplayTarget) && legacyDisplayTarget > 0
      ? Number(legacyDisplayTarget.toFixed(2))
      : null;
  }

  private normalizeFundDisplayDurationMinutes(value: unknown, required = true) {
    if (value === null || value === undefined || value === '') {
      if (required) {
        throw new BadRequestException('Approval duration is required');
      }
      return null;
    }

    const durationMinutes = Number(value);
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 525_600
    ) {
      throw new BadRequestException(
        'Approval duration must be between 1 minute and 365 days',
      );
    }
    return durationMinutes;
  }

  private buildFundDisplayDurationWindow(
    durationValue: unknown,
    options: {
      mode?: 'replace' | 'extend';
      currentVisibleFrom?: string | null;
      currentVisibleUntil?: string | null;
      now?: Date;
    } = {},
  ) {
    const approvalDurationMinutes =
      this.normalizeFundDisplayDurationMinutes(durationValue);
    if (!approvalDurationMinutes) {
      throw new BadRequestException('Approval duration is required');
    }

    const now = options.now || new Date();
    const nowMs = now.getTime();
    const currentUntilMs = options.currentVisibleUntil
      ? new Date(options.currentVisibleUntil).getTime()
      : Number.NaN;
    const isExtension =
      options.mode === 'extend' && Number.isFinite(currentUntilMs);
    const expiryBaseMs = isExtension ? Math.max(nowMs, currentUntilMs) : nowMs;
    const existingStartMs = options.currentVisibleFrom
      ? new Date(options.currentVisibleFrom).getTime()
      : Number.NaN;
    const visibleFrom =
      isExtension &&
      Number.isFinite(existingStartMs) &&
      existingStartMs <= nowMs
        ? new Date(existingStartMs).toISOString()
        : now.toISOString();

    return {
      approvalDurationMinutes,
      visibleFrom,
      visibleUntil: new Date(
        expiryBaseMs + approvalDurationMinutes * 60_000,
      ).toISOString(),
    };
  }

  private async resolveCongregationFundDisplaySummaries(
    churchId: string,
    displays: CongregationFundDisplay[],
  ) {
    return Promise.all(
      displays.map((display) =>
        this.getCongregationFundDisplaySummary(churchId, display),
      ),
    );
  }

  private async getCongregationFundDisplaySummary(
    churchId: string,
    display: CongregationFundDisplay,
  ) {
    const fundAccount = await this.fundAccountRepo.findOne({
      where: { id: display.fundAccountId, churchId },
    });
    const endMode = display.endMode === 'static' ? 'static' : 'to_date';
    const startDate = this.parseFundDisplayDateBoundary(
      display.startDate,
      'start',
    );
    const endDate =
      endMode === 'static' && display.endDate
        ? this.parseFundDisplayDateBoundary(display.endDate, 'end')
        : null;
    const totals = fundAccount
      ? await this.getCongregationFundDisplayTotals(
          churchId,
          fundAccount.id,
          startDate,
          endDate,
        )
      : {
          totalAmount: 0,
          contributionCount: 0,
          lastContributionAt: null,
        };
    const trendByDate = fundAccount
      ? await this.getCongregationFundDisplayTrend(
          churchId,
          fundAccount.id,
          startDate,
          endDate,
        )
      : [];
    const todayKey = this.formatNairobiDate(new Date());
    const todayTrend = trendByDate.find(
      (point: any) => point.date === todayKey,
    );
    const monthPrefix = todayKey.slice(0, 7);
    const monthTrend = trendByDate.filter((point: any) =>
      `${point.date || ''}`.startsWith(monthPrefix),
    );
    const monthAmount = Number(
      monthTrend
        .reduce(
          (sum: number, point: any) =>
            sum + Number(point.totalAmount || 0),
          0,
        )
        .toFixed(2),
    );
    const monthContributionCount = monthTrend.reduce(
      (sum: number, point: any) => sum + Number(point.count || 0),
      0,
    );
    const targetAmount = this.resolveFundDisplayTargetAmount(
      fundAccount,
      display,
    );
    const remainingAmount =
      targetAmount === null
        ? null
        : Math.max(0, targetAmount - totals.totalAmount);
    const progressPercentage =
      targetAmount === null
        ? null
        : Number(((totals.totalAmount / targetAmount) * 100).toFixed(1));

    const approvalStatus = display.approvalStatus || 'approved';
    const now = Date.now();
    const visibleFrom = display.visibleFrom
      ? new Date(display.visibleFrom).getTime()
      : null;
    const visibleUntil = display.visibleUntil
      ? new Date(display.visibleUntil).getTime()
      : null;
    const displayStatus =
      display.isActive === false
        ? 'inactive'
        : approvalStatus !== 'approved'
          ? approvalStatus
          : visibleUntil !== null && visibleUntil <= now
            ? 'expired'
            : visibleFrom !== null && visibleFrom > now
              ? 'scheduled'
              : 'active';

    return {
      ...display,
      approvalStatus,
      displayStatus,
      fundAccountName: fundAccount?.name || 'Unavailable account',
      fundAccountCode: fundAccount?.code || null,
      targetAmount,
      endMode,
      endDate: endMode === 'static' ? display.endDate || null : null,
      ...totals,
      todayAmount: Number(todayTrend?.totalAmount || 0),
      todayContributionCount: Number(todayTrend?.count || 0),
      monthAmount,
      monthContributionCount,
      remainingAmount,
      progressPercentage,
      trendByDate,
    };
  }

  private async getCongregationFundDisplayTotals(
    churchId: string,
    fundAccountId: string,
    startDate: Date,
    endDate: Date | null,
  ) {
    const qb = this.contributionRepo
      .createQueryBuilder('contribution')
      .select('COALESCE(SUM(contribution.amount), 0)', 'grossAmount')
      .addSelect(
        'COALESCE(SUM(COALESCE(contribution.commissionAmount, 0)), 0)',
        'commissionAmount',
      )
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
    const grossAmount = Number(raw?.grossAmount || 0);
    const commissionAmount = Number(raw?.commissionAmount || 0);
    return {
      totalAmount: Number((grossAmount - commissionAmount).toFixed(2)),
      contributionCount: Number(raw?.contributionCount || 0),
      lastContributionAt: raw?.lastContributionAt || null,
    };
  }

  private async getCongregationFundDisplayTrend(
    churchId: string,
    fundAccountId: string,
    startDate: Date,
    endDate: Date | null,
  ) {
    const qb = this.contributionRepo
      .createQueryBuilder('contribution')
      .select(
        "DATE(CONVERT_TZ(COALESCE(contribution.receivedAt, contribution.createdAt), '+00:00', '+03:00'))",
        'date',
      )
      .addSelect(
        'COALESCE(SUM(contribution.amount - COALESCE(contribution.commissionAmount, 0)), 0)',
        'totalAmount',
      )
      .addSelect('COUNT(contribution.id)', 'count')
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
      )
      .groupBy(
        "DATE(CONVERT_TZ(COALESCE(contribution.receivedAt, contribution.createdAt), '+00:00', '+03:00'))",
      )
      .orderBy('date', 'ASC');

    if (endDate) {
      qb.andWhere(
        'COALESCE(contribution.receivedAt, contribution.createdAt) <= :endDate',
        { endDate },
      );
    }

    const rows = await qb.getRawMany();
    return rows.map((row: any) => ({
      date: this.formatNairobiDate(row.date),
      totalAmount: Number(row.totalAmount || 0),
      count: Number(row.count || 0),
    }));
  }

  private formatNairobiDate(value: unknown) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(`${value}`);
    if (Number.isNaN(date.getTime())) {
      return `${value}`.slice(0, 10);
    }
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private parseFundDisplayDateBoundary(
    value: string,
    boundary: 'start' | 'end',
  ) {
    const [year, month, day] = `${value || ''}`.split('-').map(Number);
    if (!year || !month || !day) {
      return new Date();
    }
    return boundary === 'end'
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  private isPriestRole(role?: string | null) {
    return normalizeChurchRole(role) === ChurchUserRole.PRIEST;
  }

  private async notifyPriestsForPendingFundDisplays(
    churchId: string,
    requestingUserId: string,
    displays: CongregationFundDisplay[],
    pendingIds: string[],
  ) {
    if (pendingIds.length === 0) {
      return;
    }

    const priests = await this.churchUserRepo.find({
      where: { churchId, role: ChurchUserRole.PRIEST, isActive: true },
    });
    if (priests.length === 0) {
      return;
    }

    const pendingDisplays = displays.filter(
      (display) => display.id && pendingIds.includes(display.id),
    );

    for (const display of pendingDisplays) {
      const existingUnread = await this.churchNotificationRepo.findOne({
        where: {
          churchId,
          entityType: 'congregation_fund_display',
          entityId: display.id,
          isRead: false,
        },
      });
      if (existingUnread) {
        continue;
      }

      const savedNotifications = await this.churchNotificationRepo.save(
        priests.map((priest) =>
          this.churchNotificationRepo.create({
            churchId,
            recipientUserId: priest.id,
            type: ChurchNotificationType.FUND_DISPLAY_APPROVAL_REQUESTED,
            title: 'Fund display needs approval',
            body: `${display.title || 'A public fund display'} was submitted for priest approval.`,
            entityType: 'congregation_fund_display',
            entityId: display.id || null,
            actionUrl: `/church/fund-displays?review=${display.id}`,
            isRead: priest.id === requestingUserId ? true : false,
            readAt: priest.id === requestingUserId ? new Date() : null,
          }),
        ),
      );
      await Promise.all(
        savedNotifications.map((notification) =>
          this.mobilePushService
            .notifyFundDisplayApprovalRequested({
              notificationId: notification.id,
              displayId: display.id as string,
              churchId,
              recipientUserId: notification.recipientUserId as string,
            })
            .catch((error: any) => {
              this.logger.warn(
                `Mobile approval push skipped for notification=${notification.id}: ${error?.message || error}`,
              );
            }),
        ),
      );
    }
  }

  private async markFundDisplayNotificationsRead(
    churchId: string,
    displayId: string,
  ) {
    const notifications = await this.churchNotificationRepo.find({
      where: {
        churchId,
        entityType: 'congregation_fund_display',
        entityId: displayId,
        isRead: false,
      },
    });
    if (notifications.length === 0) {
      return;
    }

    const now = new Date();
    await this.churchNotificationRepo.save(
      notifications.map((notification) => ({
        ...notification,
        isRead: true,
        readAt: now,
      })),
    );
  }

  private mapChurchNotification(notification: ChurchNotification) {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      entityType: notification.entityType,
      entityId: notification.entityId,
      actionUrl: notification.actionUrl,
      isRead: notification.isRead,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
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
        receiptTemplate: getDefaultReceiptTemplateForFundCode('general'),
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

  private normalizeBoolean(value: unknown, fallback: boolean) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = `${value}`.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }

    return fallback;
  }

  private normalizeNullableBoolean(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    return this.normalizeBoolean(value, false);
  }

  private normalizeGenderText(value: unknown) {
    const gender = this.normalizeOptionalText(value, 20);
    return gender ? gender.toLowerCase() : null;
  }

  private normalizeDiscipleshipMemberStatus(value: unknown) {
    const status = this.normalizeOptionalText(value, 40);
    if (!status) {
      return DiscipleshipMemberStatus.ACTIVE;
    }

    if (
      status === DiscipleshipMemberStatus.ACTIVE ||
      status === DiscipleshipMemberStatus.INACTIVE
    ) {
      return status;
    }

    throw new BadRequestException('Member status must be active or inactive');
  }

  private normalizeDateOnly(value: unknown) {
    const date = this.normalizeOptionalText(value, 40);
    if (!date) {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Date values must use YYYY-MM-DD format.');
    }

    const parsed = new Date(`${date}T12:00:00+03:00`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      throw new BadRequestException('Date value is invalid.');
    }

    return date;
  }

  private getNairobiDateParts(date?: string | null) {
    if (date) {
      const normalized = this.normalizeDateOnly(date) as string;
      const parsed = new Date(`${normalized}T12:00:00+03:00`);
      const weekday = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        timeZone: 'Africa/Nairobi',
      }).format(parsed);
      return { date: normalized, weekday };
    }

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
    }).formatToParts(new Date());
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    return {
      date: `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`,
      weekday: byType.get('weekday') || '',
    };
  }

  private normalizeDiscipleshipGroupIds(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('Group assignments must be a list');
    }

    const groupIds = value
      .map((item) => this.normalizeOptionalText(item, 36))
      .filter(Boolean) as string[];
    return [...new Set(groupIds)];
  }

  private async syncDiscipleshipMemberGroups(
    churchId: string,
    memberId: string,
    value: unknown,
  ) {
    const nextGroupIds = this.normalizeDiscipleshipGroupIds(value);

    if (nextGroupIds.length > 0) {
      const groups = await this.discipleshipGroupRepo.find({
        where: { churchId, id: In(nextGroupIds) },
      });
      if (groups.length !== nextGroupIds.length) {
        throw new BadRequestException(
          'One or more selected discipleship groups could not be found',
        );
      }
    }

    const existing = await this.discipleshipMembershipRepo.find({
      where: { churchId, memberId },
    });
    const existingIds = new Set(existing.map((item) => item.groupId));
    const nextIds = new Set(nextGroupIds);
    const removeIds = existing
      .filter((item) => !nextIds.has(item.groupId))
      .map((item) => item.id);

    if (removeIds.length > 0) {
      await this.discipleshipMembershipRepo.delete({ id: In(removeIds) });
    }

    const additions = nextGroupIds
      .filter((groupId) => !existingIds.has(groupId))
      .map((groupId) =>
        this.discipleshipMembershipRepo.create({
          churchId,
          memberId,
          groupId,
        }),
      );

    if (additions.length > 0) {
      await this.discipleshipMembershipRepo.save(additions);
    }
  }

  private async withDiscipleshipMemberGroups(
    members: DiscipleshipMember[],
    options: { includeContributionSummary?: boolean } = {},
  ) {
    if (members.length === 0) {
      return [];
    }

    const memberIds = members.map((member) => member.id);
    const memberships = await this.discipleshipMembershipRepo.find({
      where: { memberId: In(memberIds) },
      relations: ['group'],
    });
    const aliases = await this.discipleshipMemberAliasRepo.find({
      where: { memberId: In(memberIds) },
      order: { createdAt: 'ASC' },
    });
    const contributorLinks = await this.discipleshipMemberContributorRepo.find({
      where: { memberId: In(memberIds) },
    });
    const pendingMatches = await this.discipleshipMatchCandidateRepo.find({
      where: {
        candidateMemberId: In(memberIds),
        status: DiscipleshipMatchCandidateStatus.PENDING,
      },
    });
    const groupsByMemberId = new Map<string, DiscipleshipGroup[]>();
    const aliasesByMemberId = new Map<string, DiscipleshipMemberAlias[]>();
    const linksByMemberId = new Map<string, DiscipleshipMemberContributor[]>();

    memberships.forEach((membership) => {
      const groups = groupsByMemberId.get(membership.memberId) || [];
      if (membership.group) {
        groups.push(membership.group);
      }
      groupsByMemberId.set(membership.memberId, groups);
    });
    aliases.forEach((alias) => {
      const items = aliasesByMemberId.get(alias.memberId) || [];
      items.push(alias);
      aliasesByMemberId.set(alias.memberId, items);
    });
    contributorLinks.forEach((link) => {
      const items = linksByMemberId.get(link.memberId) || [];
      items.push(link);
      linksByMemberId.set(link.memberId, items);
    });
    const contributionSummaryByMemberId =
      options.includeContributionSummary === false
        ? new Map<string, any>()
        : await this.getDiscipleshipContributionSummaries(members);

    return members.map((member) => ({
      ...member,
      groups: groupsByMemberId.get(member.id) || [],
      groupIds: (groupsByMemberId.get(member.id) || []).map(
        (group) => group.id,
      ),
      aliases: aliasesByMemberId.get(member.id) || [],
      linkedContributorCount: (linksByMemberId.get(member.id) || []).length,
      pendingMatchCount: pendingMatches.filter(
        (candidate) => candidate.candidateMemberId === member.id,
      ).length,
      ...(options.includeContributionSummary === false
        ? {}
        : {
            contributionSummary: contributionSummaryByMemberId.get(
              member.id,
            ) || {
              totalAmount: 0,
              contributionCount: 0,
              latestContributionAt: null,
              dates: [],
              contributions: [],
            },
          }),
    }));
  }

  private async getDiscipleshipContributionSummaries(
    members: DiscipleshipMember[],
  ) {
    const summaryByMemberId = new Map<string, any>();
    if (members.length === 0) {
      return summaryByMemberId;
    }
    const churchId = members[0]?.churchId;
    if (!churchId) {
      return summaryByMemberId;
    }

    const memberByContributorId = new Map<string, DiscipleshipMember>();
    const memberByName = new Map<string, DiscipleshipMember>();
    members.forEach((member) => {
      if (
        member.contributorId &&
        !memberByContributorId.has(member.contributorId)
      ) {
        memberByContributorId.set(member.contributorId, member);
      }
      const nameKey = this.normalizeImportKey(member.fullName);
      if (nameKey && !memberByName.has(nameKey)) {
        memberByName.set(nameKey, member);
      }
    });
    const contributorLinks = await this.discipleshipMemberContributorRepo.find({
      where: { memberId: In(members.map((member) => member.id)) },
    });
    const aliases = await this.discipleshipMemberAliasRepo.find({
      where: { memberId: In(members.map((member) => member.id)) },
    });
    contributorLinks.forEach((link) => {
      const member = members.find((item) => item.id === link.memberId);
      if (member) {
        memberByContributorId.set(link.contributorId, member);
      }
    });
    aliases.forEach((alias) => {
      const member = members.find((item) => item.id === alias.memberId);
      if (member && alias.normalizedAlias) {
        memberByName.set(alias.normalizedAlias, member);
      }
    });

    const contributions = await this.contributionRepo.find({
      where: {
        churchId,
        status: ContributionStatus.CONFIRMED,
      },
      relations: ['contributor'],
      order: { receivedAt: 'DESC', createdAt: 'DESC' },
    });
    const grouped = new Map<
      string,
      { member: DiscipleshipMember; items: Contribution[] }
    >();
    contributions.forEach((contribution) => {
      const member =
        (contribution.contributorId
          ? memberByContributorId.get(contribution.contributorId)
          : null) ||
        memberByName.get(this.normalizeImportKey(contribution.payerName)) ||
        memberByName.get(
          this.normalizeImportKey(contribution.contributor?.name),
        );
      if (!member) {
        return;
      }
      const group = grouped.get(member.id) || { member, items: [] };
      group.items.push(contribution);
      grouped.set(member.id, group);
    });

    grouped.forEach(({ member, items }) => {
      const byDate = new Map<string, { amount: number; count: number }>();
      const contributionRows = items.map((item) => {
        const creditedAmount = Math.max(
          0,
          Number(item.amount || 0) - Number(item.commissionAmount || 0),
        );
        const date = this.getNairobiDateFromInstant(
          item.receivedAt || item.createdAt,
        );
        const current = byDate.get(date) || { amount: 0, count: 0 };
        current.amount += creditedAmount;
        current.count += 1;
        byDate.set(date, current);
        return {
          id: item.id,
          date,
          amount: Number(creditedAmount.toFixed(2)),
          fundAccountName: item.fundAccountName,
          paymentReference: item.paymentReference,
          channel: item.channel,
        };
      });

      summaryByMemberId.set(member.id, {
        totalAmount: Number(
          items
            .reduce(
              (sum, item) =>
                sum +
                Math.max(
                  0,
                  Number(item.amount || 0) - Number(item.commissionAmount || 0),
                ),
              0,
            )
            .toFixed(2),
        ),
        contributionCount: items.length,
        latestContributionAt: contributionRows[0]?.date || null,
        dates: [...byDate.entries()]
          .map(([date, summary]) => ({
            date,
            amount: Number(summary.amount.toFixed(2)),
            count: summary.count,
          }))
          .sort((a, b) => b.date.localeCompare(a.date)),
        contributions: contributionRows,
      });
    });

    return summaryByMemberId;
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

  private generateTemporaryPassword() {
    const first = Math.random().toString(36).slice(2, 6).toUpperCase();
    const second = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `CS-${first}-${second}`;
  }

  private async sendChurchUserCredentialsSms(
    churchId: string,
    user: ChurchUser,
    password: string,
  ) {
    if (!user.phone) {
      return {
        sent: false,
        error: 'No phone number is saved for this church user.',
      };
    }

    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      return {
        sent: false,
        error: 'Church not found.',
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
        : 'Unable to send credentials SMS. Check the SMS outbox for the provider error.',
    };
  }

  private slugify(value: string) {
    return `${value || ''}`
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
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

  private csvEscape(value: unknown) {
    const text = `${value ?? ''}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
}
