import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContributionsService } from '../contributions/contributions.service';
import { Church } from '../entities/church.entity';
import { Contribution } from '../entities/contribution.entity';
import { FundAccount } from '../entities/fund-account.entity';
import { MobileFundAccountsResponseDto } from './mobile-funds.dto';

@Injectable()
export class MobileFundsService {
  constructor(
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(FundAccount)
    private readonly fundAccountRepo: Repository<FundAccount>,
    private readonly contributionsService: ContributionsService,
  ) {}

  async getDashboard(churchId: string, query: any = {}) {
    const [church, summary] = await Promise.all([
      this.churchRepo.findOne({ where: { id: churchId } }),
      this.contributionsService.getChurchReportSummary(churchId, query),
    ]);
    if (!church) {
      throw new NotFoundException('Church not found');
    }

    return {
      church: {
        id: church.id,
        name: church.name,
        slug: church.slug,
      },
      period: this.buildPeriod(query),
      totals: this.mapTotals(summary.totals),
      fundAccountTotals: summary.byFundAccount || [],
      trendData: summary.trendByDate || [],
      recentContributions: (summary.recentContributions || []).map((item) =>
        this.mapContribution(item),
      ),
    };
  }

  async getSummary(churchId: string, query: any = {}) {
    const dashboard = await this.getDashboard(churchId, query);
    return {
      church: dashboard.church,
      period: dashboard.period,
      totals: dashboard.totals,
    };
  }

  async listTransactions(churchId: string, query: any = {}) {
    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.min(Math.max(Number(query.limit || 25), 1), 100);
    const filterQuery = {
      ...query,
      contributor: query.contributor || query.search || undefined,
    };
    const allContributions =
      await this.contributionsService.listChurchContributions(
        churchId,
        filterQuery,
      );
    const start = (page - 1) * limit;
    const records = allContributions.slice(start, start + limit);

    return {
      data: records.map((item) => this.mapContribution(item)),
      pagination: {
        page,
        limit,
        total: allContributions.length,
        totalPages: Math.max(Math.ceil(allContributions.length / limit), 1),
      },
    };
  }

  async listFundAccounts(
    churchId: string,
  ): Promise<MobileFundAccountsResponseDto> {
    const accounts = await this.fundAccountRepo.find({
      where: { churchId, isActive: true },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });

    return {
      fundAccounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        code: account.code,
        description: account.description,
        displayOrder: account.displayOrder,
        isActive: account.isActive,
      })),
    };
  }

  private buildPeriod(query: any) {
    return {
      from: query.from || null,
      to: query.to || null,
      fundAccountId: query.fundAccountId || null,
      channel: query.channel || null,
      status: query.status || null,
    };
  }

  private mapTotals(totals: any) {
    return {
      totalReceived: Number(totals?.netAmount ?? totals?.totalAmount ?? 0),
      totalAmount: Number(totals?.totalAmount || 0),
      grossAmount: Number(totals?.grossAmount || 0),
      commissionAmount: Number(totals?.commissionAmount || 0),
      netAmount: Number(totals?.netAmount ?? totals?.totalAmount ?? 0),
      mpesaAmount: Number(totals?.mpesaAmount || 0),
      cashAmount: Number(totals?.cashAmount || 0),
      contributionCount: Number(totals?.contributionCount || 0),
    };
  }

  private mapContribution(item: Contribution) {
    const grossAmount = Number(item.amount || 0);
    const commissionAmount = Number(item.commissionAmount || 0);
    return {
      id: item.id,
      amount: grossAmount,
      grossAmount,
      commissionAmount,
      netAmount: Number((grossAmount - commissionAmount).toFixed(2)),
      fundAccountId: item.fundAccountId,
      fundAccountName: item.fundAccountName,
      fundAccountCode: item.fundAccount?.code || null,
      channel: item.channel,
      status: item.status,
      receivedAt: item.receivedAt || item.createdAt,
      paymentReference: item.paymentReference,
      payerName: item.payerName || item.contributor?.name || null,
      contributorName: item.contributor?.name || null,
    };
  }
}
