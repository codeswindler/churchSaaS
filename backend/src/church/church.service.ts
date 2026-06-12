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
import { In, Repository } from 'typeorm';
import ExcelJS from 'exceljs';
import {
  ChurchFeature,
  ChurchPermission,
  normalizeChurchRole,
  normalizeFeatureList,
} from '../common/access-control';
import { sanitizeChurchForTenant } from '../common/church.utils';
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
  private readonly receiptTemplateLimit = 306;
  private readonly discipleshipTransactionSyncs = new Map<string, Promise<any>>();

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

  async getDiscipleshipSummary(churchId: string) {
    await this.runDiscipleshipTransactionSync(churchId);
    const today = this.getNairobiDateParts();
    const monthStart = `${today.date.slice(0, 8)}01`;
    const [totalMembers, activeMembers, newThisMonth, groups, presentToday] =
      await Promise.all([
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
      },
      recentAttendance,
    };
  }

  async listDiscipleshipGroups(churchId: string) {
    await this.runDiscipleshipTransactionSync(churchId);
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
      throw new BadRequestException('A discipleship group with this name exists');
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

  async updateDiscipleshipGroup(
    churchId: string,
    groupId: string,
    body: any,
  ) {
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
    await this.runDiscipleshipTransactionSync(churchId);
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
        return [];
      }
      qb.andWhere('member.id IN (:...memberIds)', { memberIds });
    }

    return this.withDiscipleshipMemberGroups(await qb.getMany());
  }

  async createDiscipleshipMember(
    churchId: string,
    createdByUserId: string,
    body: any,
  ) {
    const fullName = this.normalizeOptionalText(body.fullName || body.name, 180);
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
        churchRoleNotes: this.normalizeOptionalText(
          body.churchRoleNotes,
          1200,
        ),
        status: DiscipleshipMemberStatus.ACTIVE,
        notes: this.normalizeOptionalText(body.notes, 1200),
        createdByUserId,
      }),
    );

    await this.syncDiscipleshipMemberGroups(
      churchId,
      member.id,
      body.groupIds,
    );
    await this.ensureDiscipleshipMemberAlias(
      churchId,
      member.id,
      member.fullName,
      'manual',
    );

    return (
      await this.withDiscipleshipMemberGroups([member])
    )[0];
  }

  async updateDiscipleshipMember(
    churchId: string,
    memberId: string,
    body: any,
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
      await this.syncDiscipleshipMemberGroups(churchId, memberId, body.groupIds);
    }

    return (
      await this.withDiscipleshipMemberGroups([saved])
    )[0];
  }

  async generateDiscipleshipMemberImportTemplate() {
    const headers = [
      'fullName',
      'phone',
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
      { header: headers[2], key: headers[2], width: 14 },
      { header: headers[3], key: headers[3], width: 18 },
      { header: headers[4], key: headers[4], width: 18 },
      { header: headers[5], key: headers[5], width: 30 },
      { header: headers[6], key: headers[6], width: 36 },
      { header: headers[7], key: headers[7], width: 36 },
    ];
    sheet.addRow(example);
    sheet.addRow([
      'Required',
      'Required',
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
      members: await this.withDiscipleshipMemberGroups(createdMembers),
    };
  }

  async listDiscipleshipMatchCandidates(churchId: string) {
    await this.runDiscipleshipTransactionSync(churchId);
    return this.discipleshipMatchCandidateRepo.find({
      where: {
        churchId,
        status: DiscipleshipMatchCandidateStatus.PENDING,
      },
      relations: ['contributor', 'candidateMember'],
      order: { matchScore: 'DESC', createdAt: 'ASC' },
    });
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
    if (
      existingLink &&
      existingLink.memberId !== candidate.candidateMemberId
    ) {
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
    await this.runDiscipleshipTransactionSync(churchId);
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
      const receipt = this.normalizeOptionalText(
        row.values[receiptIndex],
        120,
      );
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
      if (this.normalizeImportKey(contribution.payerName) !== this.normalizeImportKey(fullName)) {
        contribution.payerName = fullName;
        await this.contributionRepo.save(contribution);
        updated += 1;
      }
    }

    await this.runDiscipleshipTransactionSync(churchId);
    return {
      totalRows: matrix.length - 1,
      matched,
      updated,
      skipped,
      issues: issues.slice(0, 100),
    };
  }

  async listDiscipleshipAttendance(churchId: string, query: any = {}) {
    await this.runDiscipleshipTransactionSync(churchId);
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

  async getDiscipleshipMember(churchId: string, memberId: string) {
    await this.runDiscipleshipTransactionSync(churchId);
    const member = await this.discipleshipMemberRepo.findOne({
      where: { id: memberId, churchId },
    });
    if (!member) {
      throw new NotFoundException('Discipleship member not found');
    }
    return (await this.withDiscipleshipMemberGroups([member]))[0];
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

    const user = this.churchUserRepo.create({
      churchId,
      name: body.name,
      email: body.email.toLowerCase(),
      username: body.username || null,
      phone,
      passwordHash: await bcrypt.hash(body.password, 10),
      role: normalizeChurchRole(body.role) as ChurchUserRole,
      permissionOverrides: this.normalizePermissionOverrides(
        body.permissionOverrides,
      ),
      isActive: body.isActive ?? true,
    });

    const saved = await this.churchUserRepo.save(user);
    const credentialsSms = await this.sendChurchUserCredentialsSms(
      churchId,
      saved,
      `${body.password}`,
    );

    return {
      ...this.sanitizeChurchUser(saved),
      credentialsSmsSent: credentialsSms.sent,
      credentialsSmsError: credentialsSms.error,
    };
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
    return this.sanitizeChurchUser(saved);
  }

  async resendChurchUserCredentials(churchId: string, userId: string) {
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
      user: this.sanitizeChurchUser(user),
    };
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
      throw new BadRequestException('Upload a JPG, PNG, WEBP, MP4, or WEBM file');
    }

    if (Number(file.size || 0) > 5 * 1024 * 1024) {
      throw new BadRequestException('Presentation media must be 5MB or smaller');
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

  private async runDiscipleshipTransactionSync(churchId: string) {
    const existing = this.discipleshipTransactionSyncs.get(churchId);
    if (existing) {
      return existing;
    }

    const sync = this.syncTransactionalDiscipleshipMembersUnsafe(
      churchId,
    ).finally(() => {
      if (this.discipleshipTransactionSyncs.get(churchId) === sync) {
        this.discipleshipTransactionSyncs.delete(churchId);
      }
    });
    this.discipleshipTransactionSyncs.set(churchId, sync);
    return sync;
  }

  private async syncTransactionalDiscipleshipMembersUnsafe(churchId: string) {
    const serviceGroup =
      await this.ensureChurchServiceDiscipleshipGroup(churchId);
    const preMerged = await this.consolidateDuplicateDiscipleshipMembers(
      churchId,
    );
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
    const attendanceCreated = await this.syncContributionAttendanceForMembers(
      churchId,
      serviceGroup.id,
      memberIdByContributorId,
    );
    const postMerged = await this.consolidateDuplicateDiscipleshipMembers(
      churchId,
    );

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
    const uniqueNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
    if (uniqueNames.length === 0) {
      return '';
    }
    return uniqueNames.sort(
      (left, right) =>
        right.length - left.length || left.localeCompare(right),
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
      identity.names.map((name) => this.normalizeImportKey(name)).filter(Boolean),
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
      (member) => !this.hasDiscipleshipPhoneConflict(identity.phone, member.phone),
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
      const [canonical, ...duplicates] = this.sortDiscipleshipMergeCandidates(
        group,
      );
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
      const leftCreated = left.createdAt ? new Date(left.createdAt).getTime() : 0;
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

    const duplicateLinks =
      await this.discipleshipMemberContributorRepo.find({
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
    const contributorId = duplicates.find((member) => member.contributorId)
      ?.contributorId;
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
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
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
    const contributorLinks =
      await this.discipleshipMemberContributorRepo.find({
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
      await this.getDiscipleshipContributionSummaries(members);

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
      contributionSummary:
        contributionSummaryByMemberId.get(member.id) || {
          totalAmount: 0,
          contributionCount: 0,
          latestContributionAt: null,
          dates: [],
          contributions: [],
        },
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
      if (member.contributorId && !memberByContributorId.has(member.contributorId)) {
        memberByContributorId.set(member.contributorId, member);
      }
      const nameKey = this.normalizeImportKey(member.fullName);
      if (nameKey && !memberByName.has(nameKey)) {
        memberByName.set(nameKey, member);
      }
    });
    const contributorLinks =
      await this.discipleshipMemberContributorRepo.find({
        where: { memberId: In(members.map((member) => member.id)) },
      });
    contributorLinks.forEach((link) => {
      const member = members.find((item) => item.id === link.memberId);
      if (member) {
        memberByContributorId.set(link.contributorId, member);
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
    const grouped = new Map<string, { member: DiscipleshipMember; items: Contribution[] }>();
    contributions.forEach((contribution) => {
      const member =
        (contribution.contributorId
          ? memberByContributorId.get(contribution.contributorId)
          : null) ||
        memberByName.get(this.normalizeImportKey(contribution.contributor?.name));
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
        const date = this.getNairobiDateFromInstant(
          item.receivedAt || item.createdAt,
        );
        const current = byDate.get(date) || { amount: 0, count: 0 };
        current.amount += Number(item.amount || 0);
        current.count += 1;
        byDate.set(date, current);
        return {
          id: item.id,
          date,
          amount: Number(item.amount || 0),
          fundAccountName: item.fundAccountName,
          paymentReference: item.paymentReference,
          channel: item.channel,
        };
      });

      summaryByMemberId.set(member.id, {
        totalAmount: Number(
          items
            .reduce((sum, item) => sum + Number(item.amount || 0), 0)
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

  private sanitizeChurchUser(user: ChurchUser) {
    const { passwordHash, ...result } = user;
    return result;
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
