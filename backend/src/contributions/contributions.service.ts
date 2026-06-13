import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { Repository } from 'typeorm';
import { formatCurrency } from '../common/subscription.utils';
import { ChurchSmsConfig } from '../common/church.utils';
import {
  getDefaultReceiptTemplateForFundCode,
  normalizeReceiptTemplateDefaultWording,
} from '../common/receipt-templates';
import {
  Church,
  ChurchBillingModel,
  ChurchStatus,
} from '../entities/church.entity';
import { ChurchUser } from '../entities/church-user.entity';
import {
  Contribution,
  ContributionChannel,
  ContributionSourceType,
  ContributionStatus,
} from '../entities/contribution.entity';
import { Contributor } from '../entities/contributor.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { MpesaService } from '../payments/mpesa.service';
import { SmsMessageType } from '../entities/sms-outbox.entity';
import { SmsService } from '../sms/sms.service';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';

@Injectable()
export class ContributionsService {
  private readonly logger = new Logger(ContributionsService.name);

  constructor(
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(ChurchUser)
    private readonly churchUserRepo: Repository<ChurchUser>,
    @InjectRepository(FundAccount)
    private readonly fundAccountRepo: Repository<FundAccount>,
    @InjectRepository(Contributor)
    private readonly contributorRepo: Repository<Contributor>,
    @InjectRepository(Contribution)
    private readonly contributionRepo: Repository<Contribution>,
    private readonly smsService: SmsService,
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
    private readonly mpesaService: MpesaService,
  ) {}

  async createManualContribution(
    churchId: string,
    enteredByUserId: string,
    body: any,
  ) {
    await this.churchSubscriptionsService.assertChurchCanOperate(churchId);
    const fundAccount = await this.ensureFundAccount(
      churchId,
      body.fundAccountId,
    );
    const contributor = await this.findOrCreateContributor(churchId, body);
    const channel = this.resolveRecordedChannel(body.channel);
    const paymentReference = body.paymentReference || body.reference || null;

    if (channel === ContributionChannel.MPESA && !paymentReference) {
      throw new BadRequestException('M-Pesa receipt/reference is required');
    }

    const contribution = this.contributionRepo.create({
      churchId,
      contributorId: contributor?.id || null,
      fundAccountId: fundAccount.id,
      enteredByUserId,
      fundAccountName: fundAccount.name,
      amount: Number(body.amount),
      channel,
      status: ContributionStatus.CONFIRMED,
      sourceType: ContributionSourceType.MANUAL_ENTRY,
      commissionRatePctApplied: null,
      commissionAmount: null,
      paymentReference,
      payerName: contributor?.name || body.name || null,
      providerPayerId: body.providerPayerId || null,
      notes: body.notes || null,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
    });

    const saved = await this.contributionRepo.save(contribution);
    await this.sendReceipt(saved.id);
    return this.getContributionById(saved.id, churchId);
  }

  async createPublicMpesaContribution(churchSlug: string, body: any) {
    const church = await this.churchRepo.findOne({
      where: { slug: churchSlug },
    });
    if (!church || church.status !== ChurchStatus.ACTIVE) {
      throw new NotFoundException('Church not found');
    }

    const subscription =
      await this.churchSubscriptionsService.assertChurchCanOperate(church.id);
    if (subscription.status === 'suspended') {
      throw new ForbiddenException(
        'This church is not accepting contributions',
      );
    }

    const fundAccount = await this.ensureFundAccount(
      church.id,
      body.fundAccountId,
      true,
    );
    const contributor = await this.findOrCreateContributor(church.id, body);
    const amount = Number(body.amount);
    const paymentReference = body.paymentReference || body.reference || null;

    if (!paymentReference) {
      throw new BadRequestException('M-Pesa receipt/reference is required');
    }

    const contribution = await this.contributionRepo.save(
      this.contributionRepo.create({
        churchId: church.id,
        contributorId: contributor?.id || null,
        fundAccountId: fundAccount.id,
        fundAccountName: fundAccount.name,
        amount,
        channel: ContributionChannel.MPESA,
        status: ContributionStatus.CONFIRMED,
        sourceType: ContributionSourceType.PUBLIC_MPESA,
        commissionRatePctApplied: null,
        commissionAmount: null,
        paymentReference,
        payerName: contributor?.name || body.name || null,
        providerPayerId: body.providerPayerId || body.phone || null,
        notes: body.notes || null,
        receivedAt: new Date(),
      }),
    );

    this.logger.log(
      `Recorded public M-Pesa contribution ${contribution.id} for church=${church.slug} fund=${fundAccount.code} amount=${amount} reference=${paymentReference}`,
    );
    await this.sendReceipt(contribution.id);

    return {
      contributionId: contribution.id,
      message:
        'Payment details recorded. Receipt confirmation will be sent shortly.',
    };
  }

  async initiatePublicStkContribution(churchSlug: string, body: any) {
    const church = await this.churchRepo.findOne({
      where: { slug: churchSlug },
    });
    if (!church || church.status !== ChurchStatus.ACTIVE) {
      throw new NotFoundException('Church not found');
    }

    const subscription =
      await this.churchSubscriptionsService.assertChurchCanOperate(church.id);
    if (subscription.status === 'suspended') {
      throw new ForbiddenException(
        'This church is not accepting contributions',
      );
    }

    this.mpesaService.assertConfigured(church);

    const fundAccount = await this.ensureFundAccount(
      church.id,
      body.fundAccountId,
      true,
    );
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 1) {
      throw new BadRequestException('Amount must be at least KES 1');
    }

    const phone = this.extractKenyanPhone(body.phone);
    if (!phone) {
      throw new BadRequestException(
        'Phone must start with 01, 07, 2541, 2547, 1, or 7.',
      );
    }

    const contributor = await this.findOrCreateContributor(church.id, {
      ...body,
      phone,
    });

    const contribution = await this.contributionRepo.save(
      this.contributionRepo.create({
        churchId: church.id,
        contributorId: contributor?.id || null,
        fundAccountId: fundAccount.id,
        fundAccountName: fundAccount.name,
        amount,
        channel: ContributionChannel.MPESA,
        status: ContributionStatus.PENDING,
        sourceType: ContributionSourceType.PUBLIC_MPESA,
        commissionRatePctApplied: null,
        commissionAmount: null,
        providerRequestId: null,
        paymentReference: null,
        payerName: contributor?.name || body.name || null,
        providerPayerId: phone,
        notes: body.notes || 'Public STK push initiated',
        receivedAt: null,
      }),
    );

    try {
      const stkResponse = await this.mpesaService.stkPush(
        phone,
        amount,
        fundAccount.code || fundAccount.name,
        `Giving to ${church.name}`,
        church,
      );

      contribution.providerRequestId =
        stkResponse.CheckoutRequestID || contribution.providerRequestId;
      contribution.notes = [
        contribution.notes,
        stkResponse.MerchantRequestID
          ? `merchant request: ${stkResponse.MerchantRequestID}`
          : null,
      ]
        .filter(Boolean)
        .join('; ');
      await this.contributionRepo.save(contribution);

      return {
        contributionId: contribution.id,
        checkoutRequestId: stkResponse.CheckoutRequestID || null,
        merchantRequestId: stkResponse.MerchantRequestID || null,
        responseCode: stkResponse.ResponseCode || null,
        message:
          stkResponse.CustomerMessage ||
          'STK push sent. Complete the prompt on your phone.',
      };
    } catch (error: any) {
      contribution.status = ContributionStatus.FAILED;
      contribution.notes =
        error?.response?.data?.errorMessage ||
        error?.response?.data?.ResponseDescription ||
        error?.message ||
        'Unable to initiate STK push';
      await this.contributionRepo.save(contribution);
      throw new BadRequestException(contribution.notes);
    }
  }

  async handleMpesaWebhook(body: any) {
    const callback = body?.Body?.stkCallback;
    if (!callback?.CheckoutRequestID) {
      if (body?.TransID || body?.BusinessShortCode || body?.BillRefNumber) {
        this.logger.log(
          'Received C2B-style M-Pesa payload on legacy webhook; routing to C2B confirmation handler.',
        );
        return this.handleMpesaC2BConfirmation(body);
      }

      this.logger.warn('Ignored M-Pesa webhook without CheckoutRequestID');
      return { ResultCode: 0, ResultDesc: 'Ignored' };
    }

    this.logger.log(
      `M-Pesa webhook received. checkoutRequestId=${callback.CheckoutRequestID} resultCode=${callback.ResultCode}`,
    );

    const contribution = await this.contributionRepo.findOne({
      where: { providerRequestId: callback.CheckoutRequestID },
      relations: ['fundAccount', 'contributor', 'church'],
    });

    if (!contribution) {
      this.logger.warn(
        `No contribution matched checkoutRequestId=${callback.CheckoutRequestID}`,
      );
      return { ResultCode: 0, ResultDesc: 'Contribution not found' };
    }

    if (callback.ResultCode === 0) {
      const metadataItems = callback.CallbackMetadata?.Item || [];
      let receipt: string | null = null;
      let amount: number | null = null;
      let phone: string | null = null;

      for (const item of metadataItems) {
        if (item.Name === 'MpesaReceiptNumber') receipt = `${item.Value || ''}`;
        if (item.Name === 'Amount') amount = Number(item.Value || 0);
        if (item.Name === 'PhoneNumber') phone = `${item.Value || ''}`;
      }

      contribution.status = ContributionStatus.CONFIRMED;
      contribution.sourceType = ContributionSourceType.MPESA_WEBHOOK;
      contribution.paymentReference = receipt || contribution.providerRequestId;
      contribution.receivedAt = new Date();
      if (amount) {
        contribution.amount = amount;
      }

      if (phone && contribution.contributorId) {
        await this.contributorRepo.update(contribution.contributorId, {
          phone,
        });
      }

      this.applyCommissionFields(contribution, contribution.church);
      await this.contributionRepo.save(contribution);
      this.logger.log(
        `Contribution ${contribution.id} confirmed from webhook. receipt=${contribution.paymentReference || 'n/a'}`,
      );
      await this.sendReceipt(contribution.id);
    } else {
      contribution.status = ContributionStatus.FAILED;
      contribution.notes = callback.ResultDesc || 'M-Pesa payment failed';
      await this.contributionRepo.save(contribution);
      this.logger.warn(
        `Contribution ${contribution.id} failed from webhook. resultDesc=${callback.ResultDesc || 'M-Pesa payment failed'}`,
      );
    }

    return { ResultCode: 0, ResultDesc: 'Success' };
  }

  async handleMpesaC2BValidation(body: any) {
    const payload = this.parseMpesaC2BPayload(body);
    const { church, fundAccount } = await this.resolveMpesaC2BTarget(payload);

    if (!church) {
      this.logger.warn(
        `Rejected M-Pesa C2B validation for unknown shortcode=${payload.shortcode || 'n/a'} account=${payload.billRefNumber || 'n/a'}`,
      );
      return {
        ResultCode: 1,
        ResultDesc: 'Unknown receiving account',
      };
    }

    const subscription =
      await this.churchSubscriptionsService.getChurchSubscriptionStatus(
        church.id,
      );
    if (subscription.status === 'suspended') {
      this.logger.warn(
        `Rejected M-Pesa C2B validation for suspended church=${church.slug}`,
      );
      return {
        ResultCode: 1,
        ResultDesc: 'Church is not accepting contributions',
      };
    }

    if (!fundAccount) {
      this.logger.warn(
        `Accepted M-Pesa C2B validation for church=${church.slug} unmatched account=${payload.billRefNumber || 'n/a'}; confirmation will be grouped under General.`,
      );
    }

    return {
      ResultCode: 0,
      ResultDesc: 'Accepted',
    };
  }

  async handleMpesaC2BConfirmation(body: any) {
    const payload = this.parseMpesaC2BPayload(body);
    this.logger.log(
      `M-Pesa C2B confirmation received. transId=${payload.transId || 'n/a'} shortcode=${payload.shortcode || 'n/a'} account=${payload.billRefNumber || 'n/a'} amount=${payload.amount || 0}`,
    );

    if (!payload.transId) {
      this.logger.warn('Ignored M-Pesa C2B confirmation without TransID');
      return { ResultCode: 0, ResultDesc: 'Accepted - missing TransID' };
    }

    let { church, fundAccount } = await this.resolveMpesaC2BTarget(payload);
    if (!church) {
      this.logger.warn(
        `Ignored M-Pesa C2B confirmation ${payload.transId}; no active church matches shortcode=${payload.shortcode || 'n/a'}`,
      );
      return { ResultCode: 0, ResultDesc: 'Accepted - no matching church' };
    }

    const existing = await this.contributionRepo.findOne({
      where: {
        churchId: church.id,
        paymentReference: payload.transId,
      },
    });
    if (existing) {
      this.logger.log(
        `Ignored duplicate M-Pesa C2B confirmation ${payload.transId} for church=${church.slug}`,
      );
      return { ResultCode: 0, ResultDesc: 'Accepted - duplicate' };
    }

    const usedGeneralFallback = !fundAccount;
    if (!fundAccount) {
      fundAccount = await this.getOrCreateGeneralFundAccount(church.id);
      this.logger.warn(
        `Grouped M-Pesa C2B confirmation ${payload.transId} under General for unmatched account=${payload.billRefNumber || 'n/a'}`,
      );
    }

    const contributor = await this.findOrCreateContributor(church.id, {
      name: payload.customerName || 'M-Pesa Contributor',
      phone: payload.phoneForContributor,
    });

    const contribution = await this.contributionRepo.save(
      this.contributionRepo.create({
        churchId: church.id,
        contributorId: contributor?.id || null,
        fundAccountId: fundAccount.id,
        fundAccountName: fundAccount.name,
        amount: payload.amount,
        channel: ContributionChannel.MPESA,
        status: ContributionStatus.CONFIRMED,
        sourceType: ContributionSourceType.MPESA_C2B,
        ...this.calculateCommissionFields(church, payload.amount),
        providerRequestId: payload.phoneForContributor ? null : payload.phone,
        paymentReference: payload.transId,
        payerName: payload.customerName || contributor?.name || null,
        providerPayerId: payload.phoneForContributor || payload.phone,
        notes: this.buildMpesaC2BNote(
          payload,
          fundAccount,
          usedGeneralFallback,
        ),
        receivedAt: payload.receivedAt,
      }),
    );

    this.logger.log(
      `Recorded M-Pesa C2B contribution ${contribution.id} for church=${church.slug} fund=${fundAccount.code} amount=${payload.amount} reference=${payload.transId}`,
    );
    await this.sendReceipt(contribution.id);

    return { ResultCode: 0, ResultDesc: 'Accepted - recorded' };
  }

  async listChurchContributions(churchId: string, query: any = {}) {
    const qb = this.contributionRepo
      .createQueryBuilder('contribution')
      .leftJoinAndSelect('contribution.contributor', 'contributor')
      .leftJoinAndSelect('contribution.fundAccount', 'fundAccount')
      .leftJoinAndSelect('contribution.enteredByUser', 'enteredByUser')
      .where('contribution.churchId = :churchId', { churchId })
      .orderBy('contribution.receivedAt', 'DESC')
      .addOrderBy('contribution.createdAt', 'DESC');

    const filterQuery = { ...query };
    if (query.fundAccountId) {
      const fundAccount = await this.fundAccountRepo.findOne({
        where: { id: query.fundAccountId, churchId },
      });
      filterQuery.includeUnassignedFallback = fundAccount?.code === 'general';
    }

    this.applyContributionFilters(qb, filterQuery);
    return qb.getMany();
  }

  async getChurchReportSummary(churchId: string, query: any = {}) {
    const [church, contributions] = await Promise.all([
      this.churchRepo.findOne({ where: { id: churchId } }),
      this.listChurchContributions(churchId, query),
    ]);
    if (!church) {
      throw new NotFoundException('Church not found');
    }
    const confirmed = contributions.filter(
      (item) => item.status === ContributionStatus.CONFIRMED,
    );

    const grossAmount = confirmed.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const commissionAmount = confirmed.reduce(
      (sum, item) => sum + this.getContributionCommissionAmount(item, church),
      0,
    );
    const netAmount = Number((grossAmount - commissionAmount).toFixed(2));
    const mpesaAmount = confirmed
      .filter((item) => item.channel === ContributionChannel.MPESA)
      .reduce(
        (sum, item) =>
          sum +
          (Number(item.amount || 0) -
            this.getContributionCommissionAmount(item, church)),
        0,
      );
    const cashAmount = confirmed
      .filter((item) => item.channel === ContributionChannel.MANUAL_CASH)
      .reduce(
        (sum, item) =>
          sum +
          (Number(item.amount || 0) -
            this.getContributionCommissionAmount(item, church)),
        0,
      );

    const byFundAccount = confirmed.reduce(
      (acc, item) => {
        const isUnassignedFallback = !item.fundAccountId;
        const key = item.fundAccountId || 'general-fallback';
        if (!acc[key]) {
          acc[key] = {
            fundAccountId: item.fundAccountId,
            fundAccountName: isUnassignedFallback
              ? 'General'
              : item.fundAccountName,
            code:
              item.fundAccount?.code ||
              (isUnassignedFallback ? 'general' : null),
            totalAmount: 0,
            grossAmount: 0,
            commissionAmount: 0,
            netAmount: 0,
            count: 0,
          };
        }
        const gross = Number(item.amount || 0);
        const commission = this.getContributionCommissionAmount(item, church);
        const net = gross - commission;
        acc[key].grossAmount += gross;
        acc[key].commissionAmount += commission;
        acc[key].netAmount += net;
        acc[key].totalAmount += net;
        acc[key].count += 1;
        return acc;
      },
      {} as Record<
        string,
        {
          fundAccountId: string | null;
          fundAccountName: string;
          code: string | null;
          totalAmount: number;
          grossAmount: number;
          commissionAmount: number;
          netAmount: number;
          count: number;
        }
      >,
    );

    const trendByDate = confirmed.reduce(
      (acc, item) => {
        const date = new Date(item.receivedAt || item.createdAt)
          .toISOString()
          .slice(0, 10);

        if (!acc[date]) {
          acc[date] = {
            date,
            totalAmount: 0,
            grossAmount: 0,
            commissionAmount: 0,
            netAmount: 0,
            count: 0,
          };
        }

        const gross = Number(item.amount || 0);
        const commission = this.getContributionCommissionAmount(item, church);
        const net = gross - commission;
        acc[date].grossAmount += gross;
        acc[date].commissionAmount += commission;
        acc[date].netAmount += net;
        acc[date].totalAmount += net;
        acc[date].count += 1;
        return acc;
      },
      {} as Record<
        string,
        {
          date: string;
          totalAmount: number;
          grossAmount: number;
          commissionAmount: number;
          netAmount: number;
          count: number;
        }
      >,
    );

    return {
      totals: {
        contributionCount: confirmed.length,
        totalAmount: netAmount,
        grossAmount,
        commissionAmount,
        netAmount,
        mpesaAmount: Number(mpesaAmount.toFixed(2)),
        cashAmount: Number(cashAmount.toFixed(2)),
      },
      byFundAccount: Object.values(byFundAccount).sort(
        (a, b) => b.totalAmount - a.totalAmount,
      ),
      trendByDate: Object.values(trendByDate).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      recentContributions: contributions.slice(0, 10),
    };
  }

  async exportChurchReport(
    churchId: string,
    query: any,
    format: 'csv' | 'pdf',
  ) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }

    const contributions = await this.listChurchContributions(churchId, query);
    const summary = await this.getChurchReportSummary(churchId, query);

    if (format === 'pdf') {
      const pdf = await this.buildPdfReport(
        church.name,
        contributions,
        summary,
      );
      return {
        fileName: `${church.slug}-contributions.pdf`,
        contentType: 'application/pdf',
        buffer: pdf,
      };
    }

    const rows = [
      [
        'Date',
        'Contributor',
        'Phone',
        'Fund Account',
        'Channel',
        'Status',
        'Amount',
        'Reference',
        'Notes',
      ],
      ...contributions.map((item) => [
        item.receivedAt
          ? new Date(item.receivedAt).toISOString()
          : new Date(item.createdAt).toISOString(),
        item.contributor?.name || '',
        item.contributor?.phone || '',
        item.fundAccountName,
        item.channel,
        item.status,
        Number(item.amount || 0).toFixed(2),
        item.paymentReference || '',
        item.notes || '',
      ]),
    ];

    const csv = rows
      .map((row) =>
        row.map((cell) => `"${`${cell ?? ''}`.replace(/"/g, '""')}"`).join(','),
      )
      .join('\n');

    return {
      fileName: `${church.slug}-contributions.csv`,
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(csv, 'utf8'),
    };
  }

  async sendExportResponse(
    response: Response,
    churchId: string,
    query: any,
    format: 'csv' | 'pdf',
  ) {
    const exported = await this.exportChurchReport(churchId, query, format);
    response.setHeader('Content-Type', exported.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.fileName}"`,
    );
    response.send(exported.buffer);
  }

  async getContributionById(id: string, churchId?: string) {
    const contribution = await this.contributionRepo.findOne({
      where: churchId ? { id, churchId } : { id },
      relations: ['contributor', 'fundAccount', 'enteredByUser'],
    });

    if (!contribution) {
      throw new NotFoundException('Contribution not found');
    }

    return contribution;
  }

  private async ensureFundAccount(
    churchId: string,
    fundAccountId: string,
    requireActive = false,
  ) {
    const fundAccount = await this.fundAccountRepo.findOne({
      where: { id: fundAccountId, churchId },
    });

    if (!fundAccount) {
      throw new NotFoundException('Fund account not found');
    }

    if (requireActive && !fundAccount.isActive) {
      throw new BadRequestException('Fund account is inactive');
    }

    return fundAccount;
  }

  private async resolveMpesaC2BTarget(payload: ParsedMpesaC2BPayload) {
    const shortcode = payload.shortcode;
    const church = shortcode
      ? await this.churchRepo.findOne({
          where: {
            mpesaShortcode: shortcode,
            status: ChurchStatus.ACTIVE,
          },
        })
      : null;

    if (!church) {
      return { church: null, fundAccount: null };
    }

    const fundAccount = await this.findFundAccountByReference(
      church.id,
      payload.billRefNumber,
    );

    return { church, fundAccount };
  }

  private async findFundAccountByReference(
    churchId: string,
    reference?: string | null,
  ) {
    if (!reference) {
      return null;
    }

    const code = this.slugify(reference);
    const byCode = await this.fundAccountRepo.findOne({
      where: { churchId, code, isActive: true },
    });
    if (byCode) {
      return byCode;
    }

    const normalizedReference = this.normalizeComparisonText(reference);
    const activeAccounts = await this.fundAccountRepo.find({
      where: { churchId, isActive: true },
    });

    return (
      activeAccounts.find(
        (account) =>
          this.normalizeComparisonText(account.name) === normalizedReference ||
          this.normalizeComparisonText(account.code) === normalizedReference,
      ) || null
    );
  }

  private async getOrCreateGeneralFundAccount(churchId: string) {
    const existing = await this.fundAccountRepo.findOne({
      where: { churchId, code: 'general' },
    });
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        return this.fundAccountRepo.save(existing);
      }
      return existing;
    }

    return this.fundAccountRepo.save(
      this.fundAccountRepo.create({
        churchId,
        name: 'General',
        code: 'general',
        description:
          'Fallback account for C2B payments whose account reference does not match an existing fund account.',
        displayOrder: 999,
        isActive: true,
        receiptTemplate: getDefaultReceiptTemplateForFundCode('general'),
      }),
    );
  }

  private resolveRecordedChannel(channel?: string) {
    return channel === ContributionChannel.MPESA
      ? ContributionChannel.MPESA
      : ContributionChannel.MANUAL_CASH;
  }

  private parseMpesaC2BPayload(body: any): ParsedMpesaC2BPayload {
    const transTime = this.normalizeOptionalText(body?.TransTime);
    const rawPhone = this.normalizeOptionalText(
      body?.MSISDN || body?.PhoneNumber || body?.phone,
    );
    const customerName = this.buildMpesaC2BCustomerName(body);

    return {
      transId: this.normalizeOptionalText(
        body?.TransID || body?.TransId || body?.transactionId,
      ),
      transTime,
      amount: Number(body?.TransAmount || body?.Amount || 0),
      shortcode: this.normalizeOptionalText(
        body?.BusinessShortCode || body?.ShortCode || body?.shortcode,
      ),
      billRefNumber: this.normalizeOptionalText(
        body?.BillRefNumber || body?.AccountReference || body?.accountReference,
      ),
      phone: rawPhone,
      phoneForContributor: this.extractKenyanPhone(rawPhone),
      customerName,
      invoiceNumber: this.normalizeOptionalText(body?.InvoiceNumber),
      orgAccountBalance: this.normalizeOptionalText(body?.OrgAccountBalance),
      thirdPartyTransId: this.normalizeOptionalText(body?.ThirdPartyTransID),
      receivedAt: this.parseMpesaTimestamp(transTime),
      raw: body,
    };
  }

  private buildMpesaC2BCustomerName(body: any) {
    const directName = [
      body?.CustomerName,
      body?.customerName,
      body?.FullName,
      body?.fullName,
      body?.PayerName,
      body?.payerName,
      body?.Name,
      body?.name,
    ]
      .map((item) => this.normalizeOptionalText(item))
      .find(Boolean);
    if (directName) {
      return directName;
    }

    const kycParts = this.extractMpesaKycNameParts(body?.KYCInfo);
    const bodyParts = {
      firstName: this.normalizeOptionalText(body?.FirstName || body?.firstName),
      middleName: this.normalizeOptionalText(
        body?.MiddleName || body?.middleName,
      ),
      lastName: this.normalizeOptionalText(body?.LastName || body?.lastName),
    };
    const parts = [
      bodyParts.firstName || kycParts.firstName,
      bodyParts.middleName || kycParts.middleName,
      bodyParts.lastName || kycParts.lastName,
    ].filter(Boolean);

    return parts.length > 0 ? [...new Set(parts)].join(' ') : null;
  }

  private extractMpesaKycNameParts(kycInfo: any) {
    const parts: {
      firstName: string | null;
      middleName: string | null;
      lastName: string | null;
    } = {
      firstName: null,
      middleName: null,
      lastName: null,
    };
    if (!Array.isArray(kycInfo)) {
      return parts;
    }

    kycInfo.forEach((item) => {
      const key = this.normalizeOptionalText(
        item?.KYCName || item?.key || item?.name,
      )
        ?.toLowerCase()
        .replace(/[^a-z]/g, '');
      const value = this.normalizeOptionalText(
        item?.KYCValue || item?.value || item?.Value,
      );
      if (!key || !value) {
        return;
      }
      if (key.includes('firstname')) {
        parts.firstName = value;
      } else if (key.includes('middlename')) {
        parts.middleName = value;
      } else if (key.includes('lastname') || key.includes('surname')) {
        parts.lastName = value;
      }
    });

    return parts;
  }

  private parseMpesaTimestamp(value?: string | null) {
    if (!value || !/^\d{14}$/.test(value)) {
      return new Date();
    }

    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(8, 10));
    const minute = Number(value.slice(10, 12));
    const second = Number(value.slice(12, 14));
    return new Date(year, month, day, hour, minute, second);
  }

  private buildMpesaC2BNote(
    payload: ParsedMpesaC2BPayload,
    fundAccount: FundAccount | null,
    usedGeneralFallback = false,
  ) {
    const pieces = [
      'M-Pesa C2B confirmation',
      payload.billRefNumber ? `account ref: ${payload.billRefNumber}` : null,
      usedGeneralFallback && payload.billRefNumber
        ? 'grouped under General fallback account'
        : null,
      !fundAccount && payload.billRefNumber ? 'fund account not matched' : null,
      payload.phone && !payload.phoneForContributor
        ? `payer reference: ${payload.phone.slice(0, 12)}...`
        : null,
      payload.invoiceNumber ? `invoice: ${payload.invoiceNumber}` : null,
      payload.thirdPartyTransId
        ? `third party ref: ${payload.thirdPartyTransId}`
        : null,
    ].filter(Boolean);

    return pieces.join('; ');
  }

  private normalizeOptionalText(value: any) {
    const normalized = `${value ?? ''}`.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private extractKenyanPhone(value?: string | null) {
    if (!value) {
      return null;
    }
    return this.smsService.normalizeKenyanPhone(value);
  }

  private normalizeComparisonText(value: string) {
    return this.slugify(value).replace(/-/g, '');
  }

  private slugify(value: string) {
    return `${value || ''}`
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async findOrCreateContributor(churchId: string, body: any) {
    if (!body.name && !body.phone) {
      return null;
    }

    const phone = body.phone
      ? this.smsService.normalizeKenyanPhone(body.phone)
      : null;
    if (body.phone && !phone) {
      throw new BadRequestException(
        'Phone must start with 01, 07, 2541, 2547, 1, or 7.',
      );
    }
    let contributor = phone
      ? await this.contributorRepo.findOne({ where: { churchId, phone } })
      : null;

    if (!contributor) {
      contributor = this.contributorRepo.create({
        churchId,
        name: body.name || 'Anonymous Contributor',
        phone,
        memberNumber: body.memberNumber || null,
      });
    } else {
      if (
        (!contributor.name ||
          contributor.name === 'Anonymous Contributor' ||
          contributor.name === 'M-Pesa Contributor') &&
        body.name
      ) {
        contributor.name = body.name;
      }
      contributor.memberNumber = body.memberNumber || contributor.memberNumber;
    }

    if (body.gender === 'male' || body.gender === 'female') {
      contributor.gender = body.gender;
    }

    return this.contributorRepo.save(contributor);
  }

  private async sendReceipt(contributionId: string) {
    const contribution = await this.contributionRepo.findOne({
      where: { id: contributionId },
      relations: ['contributor', 'fundAccount', 'church'],
    });

    if (
      !contribution ||
      contribution.status !== ContributionStatus.CONFIRMED ||
      !contribution.fundAccount
    ) {
      return contribution;
    }

    const message = this.renderReceiptMessage(contribution);
    const churchSmsConfig = this.getChurchSmsConfig(contribution.church);
    const hashedSafaricomMobile =
      this.resolveHashedSafaricomMobile(contribution);
    const success = contribution.contributor?.phone
      ? await this.smsService.sendSms(
          contribution.contributor.phone,
          message,
          churchSmsConfig,
          {
            messageType: SmsMessageType.RECEIPT,
            contributorId: contribution.contributorId,
            createdByUserId: contribution.enteredByUserId,
            recipientName: contribution.contributor?.name,
          },
        )
      : hashedSafaricomMobile
        ? await this.smsService.sendSmsToHashedSafaricomNumber(
            hashedSafaricomMobile,
            message,
            churchSmsConfig,
            {
              messageType: SmsMessageType.RECEIPT,
              contributorId: contribution.contributorId,
              createdByUserId: contribution.enteredByUserId,
              recipientName: contribution.contributor?.name,
            },
          )
        : false;

    if (
      !success &&
      !contribution.contributor?.phone &&
      !hashedSafaricomMobile
    ) {
      return contribution;
    }

    contribution.receiptMessageBody = message;
    contribution.receiptMessageSent = success;
    contribution.receiptSentAt = new Date();
    contribution.receiptDeliveryStatus = success ? 'sent' : 'failed';
    await this.contributionRepo.save(contribution);

    return contribution;
  }

  private resolveHashedSafaricomMobile(contribution: Contribution) {
    const value = contribution.providerRequestId;
    if (!value || this.extractKenyanPhone(value)) {
      return null;
    }

    return value.length >= 32 ? value : null;
  }

  private calculateCommissionFields(church: Church | null, amount: number) {
    const billingModel =
      church?.billingModel ||
      (Number(church?.commissionRatePct || 0) > 0
        ? ChurchBillingModel.COMMISSION
        : ChurchBillingModel.SUBSCRIPTION);
    const rate =
      billingModel === ChurchBillingModel.COMMISSION
        ? Number(church?.commissionRatePct || 0)
        : 0;
    if (!rate || rate < 0) {
      return {
        commissionRatePctApplied: 0,
        commissionAmount: 0,
      };
    }

    return {
      commissionRatePctApplied: rate,
      commissionAmount: Math.ceil((Number(amount || 0) * rate) / 100),
    };
  }

  private getContributionCommissionAmount(
    contribution: Contribution,
    church: Church | null,
  ) {
    if (
      contribution.commissionAmount !== null &&
      contribution.commissionAmount !== undefined
    ) {
      return Number(contribution.commissionAmount || 0);
    }

    if (contribution.channel !== ContributionChannel.MPESA) {
      return 0;
    }

    return this.calculateCommissionFields(
      church,
      Number(contribution.amount || 0),
    ).commissionAmount;
  }

  private applyCommissionFields(contribution: Contribution, church: Church | null) {
    const fields = this.calculateCommissionFields(
      church,
      Number(contribution.amount || 0),
    );
    contribution.commissionRatePctApplied = fields.commissionRatePctApplied;
    contribution.commissionAmount = fields.commissionAmount;
  }

  private renderReceiptMessage(contribution: Contribution) {
    const template = normalizeReceiptTemplateDefaultWording(
      contribution.fundAccount?.receiptTemplate,
      contribution.fundAccount?.code,
    );

    const values: Record<string, string> = {
      name: contribution.contributor?.name || 'Friend',
      amount: formatCurrency(Number(contribution.amount || 0)),
      account: contribution.fundAccountName,
      date: new Date(
        contribution.receivedAt || contribution.createdAt,
      ).toLocaleString('en-KE', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      reference:
        contribution.paymentReference ||
        contribution.providerRequestId ||
        'N/A',
    };

    return template.replace(/\{(\w+)\}/g, (_, key) => values[key] || '');
  }

  private applyContributionFilters(qb: any, query: any) {
    if (query.from) {
      qb.andWhere(
        'COALESCE(contribution.receivedAt, contribution.createdAt) >= :from',
        {
          from: this.parseDateFilterBoundary(query.from, 'start'),
        },
      );
    }

    if (query.to) {
      qb.andWhere(
        'COALESCE(contribution.receivedAt, contribution.createdAt) <= :to',
        {
          to: this.parseDateFilterBoundary(query.to, 'end'),
        },
      );
    }

    if (query.fundAccountId) {
      if (query.includeUnassignedFallback) {
        qb.andWhere(
          '(contribution.fundAccountId = :fundAccountId OR contribution.fundAccountId IS NULL)',
          {
            fundAccountId: query.fundAccountId,
          },
        );
      } else {
        qb.andWhere('contribution.fundAccountId = :fundAccountId', {
          fundAccountId: query.fundAccountId,
        });
      }
    }

    if (query.channel) {
      qb.andWhere('contribution.channel = :channel', {
        channel: query.channel,
      });
    }

    if (query.status) {
      qb.andWhere('contribution.status = :status', { status: query.status });
    }

    if (query.enteredBy) {
      qb.andWhere('contribution.enteredByUserId = :enteredBy', {
        enteredBy: query.enteredBy,
      });
    }

    if (query.contributor) {
      qb.andWhere(
        '(contributor.name LIKE :search OR contributor.phone LIKE :search)',
        {
          search: `%${query.contributor}%`,
        },
      );
    }
  }

  private parseDateFilterBoundary(value: any, boundary: 'start' | 'end') {
    const rawValue = `${value || ''}`.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      const [year, month, day] = rawValue.split('-').map(Number);
      if (boundary === 'end') {
        return new Date(year, month - 1, day, 23, 59, 59, 999);
      }

      return new Date(year, month - 1, day, 0, 0, 0, 0);
    }

    const parsed = new Date(rawValue);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date filter');
    }

    return parsed;
  }

  private getChurchSmsConfig(church: Church | null): ChurchSmsConfig {
    return {
      churchId: church?.id,
      smsPartnerId: church?.smsPartnerId,
      smsApiKey: church?.smsApiKey,
      smsShortcode: church?.smsShortcode,
      smsBaseUrl: church?.smsBaseUrl,
    };
  }

  private buildPdfReport(
    churchName: string,
    contributions: Contribution[],
    summary: any,
  ) {
    return new Promise<Buffer>((resolve) => {
      const doc = new PDFDocument({ margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(20).text(`${churchName} Contribution Report`, {
        align: 'left',
      });
      doc.moveDown(0.5);
      doc
        .fontSize(11)
        .fillColor('#555')
        .text(
          `Generated: ${new Date().toLocaleString('en-KE', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}`,
        );
      doc.moveDown();

      doc.fillColor('#111').fontSize(12).text('Summary');
      doc
        .fontSize(10)
        .text(`Total contributions: ${summary.totals.contributionCount}`);
      doc.text(
        `Total amount: KES ${formatCurrency(summary.totals.totalAmount)}`,
      );
      doc.text(`M-Pesa: KES ${formatCurrency(summary.totals.mpesaAmount)}`);
      doc.text(`Cash: KES ${formatCurrency(summary.totals.cashAmount)}`);
      doc.moveDown();

      doc.fontSize(12).text('Contributions');
      doc.moveDown(0.5);
      contributions.slice(0, 40).forEach((item) => {
        doc
          .fontSize(9)
          .text(
            `${new Date(item.receivedAt || item.createdAt).toLocaleString('en-KE')} | ${item.contributor?.name || 'Unknown'} | ${item.fundAccountName} | ${item.channel} | ${item.status} | KES ${formatCurrency(Number(item.amount || 0))} | ${item.paymentReference || '-'}`,
          );
      });

      if (contributions.length > 40) {
        doc
          .moveDown()
          .text(
            'Only the first 40 rows are shown in the PDF preview. Export CSV for the full data set.',
          );
      }

      doc.end();
    });
  }
}

interface ParsedMpesaC2BPayload {
  transId: string | null;
  transTime: string | null;
  amount: number;
  shortcode: string | null;
  billRefNumber: string | null;
  phone: string | null;
  phoneForContributor: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
  orgAccountBalance: string | null;
  thirdPartyTransId: string | null;
  receivedAt: Date;
  raw: any;
}
