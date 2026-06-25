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

  async getAnalysis(churchId: string, query: any = {}) {
    const [church, analysis] = await Promise.all([
      this.churchRepo.findOne({ where: { id: churchId } }),
      this.contributionsService.getChurchMobileAnalysis(churchId, query),
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
      totals: this.mapTotals(analysis.totals),
      dailyTotals: analysis.dailyTotals || [],
      trendData: analysis.trendData || [],
      fundAccountTotals: analysis.fundAccountTotals || [],
      contributorTotals: analysis.contributorTotals || [],
    };
  }

  async listTransactions(churchId: string, query: any = {}) {
    const filterQuery = {
      ...query,
      contributor: query.contributor || query.search || undefined,
      page: Math.max(Number(query.page || 1), 1),
      limit: Math.min(Math.max(Number(query.limit || 25), 1), 100),
    };
    const result = await this.contributionsService.listChurchContributionsPage(
      churchId,
      filterQuery,
    );
    return {
      data: result.items.map((item: any) => this.mapContribution(item)),
      pagination: result.pagination,
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
        targetAmount:
          Number(account.targetAmount || 0) > 0
            ? Number(account.targetAmount)
            : null,
        createdAt: account.createdAt?.toISOString() || null,
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
      contributorId: query.contributorId || null,
    };
  }

  private mapTotals(totals: any) {
    return {
      totalReceived: Number(totals?.totalAmount || 0),
      totalAmount: Number(totals?.totalAmount || 0),
      mpesaAmount: Number(totals?.mpesaAmount || 0),
      cashAmount: Number(totals?.cashAmount || 0),
      contributionCount: Number(totals?.contributionCount || 0),
    };
  }

  private mapContribution(item: Contribution | any) {
    return {
      id: item.id,
      amount: Number(item.amount || 0),
      contributorId: item.contributorId || null,
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
