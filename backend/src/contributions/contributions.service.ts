import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { Repository } from 'typeorm';
import { formatCurrency } from '../common/subscription.utils';
import { ChurchMpesaConfig, ChurchSmsConfig } from '../common/church.utils';
import { Church, ChurchStatus } from '../entities/church.entity';
import { ChurchUser } from '../entities/church-user.entity';
import {
  Contribution,
  ContributionChannel,
  ContributionStatus,
} from '../entities/contribution.entity';
import { Contributor } from '../entities/contributor.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { MpesaService } from '../payments/mpesa.service';
import { SmsService } from '../sms/sms.service';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';

@Injectable()
export class ContributionsService {
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
    private readonly mpesaService: MpesaService,
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
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

    const contribution = this.contributionRepo.create({
      churchId,
      contributorId: contributor?.id || null,
      fundAccountId: fundAccount.id,
      enteredByUserId,
      fundAccountName: fundAccount.name,
      amount: Number(body.amount),
      channel: ContributionChannel.MANUAL_CASH,
      status: ContributionStatus.CONFIRMED,
      paymentReference: body.paymentReference || body.reference || null,
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
    this.mpesaService.assertConfigured(this.getChurchMpesaConfig(church));
    const contributor = await this.findOrCreateContributor(church.id, body);

    const pending = await this.contributionRepo.save(
      this.contributionRepo.create({
        churchId: church.id,
        contributorId: contributor?.id || null,
        fundAccountId: fundAccount.id,
        fundAccountName: fundAccount.name,
        amount: Number(body.amount),
        channel: ContributionChannel.MPESA,
        status: ContributionStatus.PENDING,
        notes: body.notes || null,
      }),
    );

    const mpesaResponse = await this.mpesaService.stkPush(
      body.phone,
      Number(body.amount),
      fundAccount.code,
      `${church.name} ${fundAccount.name}`,
      this.getChurchMpesaConfig(church),
    );

    pending.providerRequestId =
      mpesaResponse.CheckoutRequestID ||
      mpesaResponse.MerchantRequestID ||
      null;
    await this.contributionRepo.save(pending);

    return {
      contributionId: pending.id,
      checkoutRequestId: pending.providerRequestId,
      message:
        mpesaResponse.CustomerMessage ||
        'STK push sent. Please complete the payment on your phone.',
      response: mpesaResponse,
    };
  }

  async handleMpesaWebhook(body: any) {
    const callback = body?.Body?.stkCallback;
    if (!callback?.CheckoutRequestID) {
      return { ResultCode: 0, ResultDesc: 'Ignored' };
    }

    const contribution = await this.contributionRepo.findOne({
      where: { providerRequestId: callback.CheckoutRequestID },
      relations: ['fundAccount', 'contributor', 'church'],
    });

    if (!contribution) {
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

      await this.contributionRepo.save(contribution);
      await this.sendReceipt(contribution.id);
    } else {
      contribution.status = ContributionStatus.FAILED;
      contribution.notes = callback.ResultDesc || 'M-Pesa payment failed';
      await this.contributionRepo.save(contribution);
    }

    return { ResultCode: 0, ResultDesc: 'Success' };
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

    this.applyContributionFilters(qb, query);
    return qb.getMany();
  }

  async getChurchReportSummary(churchId: string, query: any = {}) {
    const contributions = await this.listChurchContributions(churchId, query);
    const confirmed = contributions.filter(
      (item) => item.status === ContributionStatus.CONFIRMED,
    );

    const totalAmount = confirmed.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const mpesaAmount = confirmed
      .filter((item) => item.channel === ContributionChannel.MPESA)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const cashAmount = confirmed
      .filter((item) => item.channel === ContributionChannel.MANUAL_CASH)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const byFundAccount = confirmed.reduce(
      (acc, item) => {
        const key = item.fundAccountName;
        if (!acc[key]) {
          acc[key] = { fundAccountName: key, totalAmount: 0, count: 0 };
        }
        acc[key].totalAmount += Number(item.amount || 0);
        acc[key].count += 1;
        return acc;
      },
      {} as Record<
        string,
        { fundAccountName: string; totalAmount: number; count: number }
      >,
    );

    return {
      totals: {
        contributionCount: confirmed.length,
        totalAmount,
        mpesaAmount,
        cashAmount,
      },
      byFundAccount: Object.values(byFundAccount).sort(
        (a, b) => b.totalAmount - a.totalAmount,
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

  private async findOrCreateContributor(churchId: string, body: any) {
    if (!body.name && !body.phone) {
      return null;
    }

    const phone = body.phone ? this.smsService.formatPhone(body.phone) : null;
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
      contributor.name = body.name || contributor.name;
      contributor.memberNumber = body.memberNumber || contributor.memberNumber;
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
      !contribution.contributor?.phone ||
      !contribution.fundAccount
    ) {
      return contribution;
    }

    const message = this.renderReceiptMessage(contribution);
    const success = await this.smsService.sendSms(
      contribution.contributor.phone,
      message,
      this.getChurchSmsConfig(contribution.church),
    );

    contribution.receiptMessageBody = message;
    contribution.receiptMessageSent = success;
    contribution.receiptSentAt = new Date();
    contribution.receiptDeliveryStatus = success ? 'sent' : 'failed';
    await this.contributionRepo.save(contribution);

    return contribution;
  }

  private renderReceiptMessage(contribution: Contribution) {
    const template =
      contribution.fundAccount?.receiptTemplate ||
      'Dear {name}, we have received KES {amount} for {account}. Ref: {reference}. Thank you.';

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
      qb.andWhere('contribution.receivedAt >= :from', {
        from: new Date(query.from),
      });
    }

    if (query.to) {
      qb.andWhere('contribution.receivedAt <= :to', {
        to: new Date(query.to),
      });
    }

    if (query.fundAccountId) {
      qb.andWhere('contribution.fundAccountId = :fundAccountId', {
        fundAccountId: query.fundAccountId,
      });
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

  private getChurchSmsConfig(church: Church | null): ChurchSmsConfig {
    return {
      smsPartnerId: church?.smsPartnerId,
      smsApiKey: church?.smsApiKey,
      smsShortcode: church?.smsShortcode,
      smsBaseUrl: church?.smsBaseUrl,
    };
  }

  private getChurchMpesaConfig(church: Church | null): ChurchMpesaConfig {
    return {
      mpesaEnvironment: church?.mpesaEnvironment,
      mpesaConsumerKey: church?.mpesaConsumerKey,
      mpesaConsumerSecret: church?.mpesaConsumerSecret,
      mpesaPasskey: church?.mpesaPasskey,
      mpesaShortcode: church?.mpesaShortcode,
      mpesaCallbackUrl: church?.mpesaCallbackUrl,
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
