import { MobileFundsService } from './mobile-funds.service';

describe('MobileFundsService', () => {
  const churchRepo = {
    findOne: jest.fn(),
  };
  const fundAccountRepo = {
    find: jest.fn(),
  };
  const contributionsService = {
    getChurchReportSummary: jest.fn(),
    listChurchContributions: jest.fn(),
  };

  let service: MobileFundsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MobileFundsService(
      churchRepo as any,
      fundAccountRepo as any,
      contributionsService as any,
    );
  });

  it('returns mobile dashboard totals scoped to the supplied church', async () => {
    churchRepo.findOne.mockResolvedValue({
      id: 'church-1',
      name: 'Test Church',
      slug: 'test-church',
    });
    contributionsService.getChurchReportSummary.mockResolvedValue({
      totals: {
        totalAmount: 950,
        grossAmount: 1000,
        commissionAmount: 50,
        netAmount: 950,
        mpesaAmount: 950,
        cashAmount: 0,
        contributionCount: 1,
      },
      byFundAccount: [],
      trendByDate: [],
      recentContributions: [],
    });

    const result = await service.getDashboard('church-1', {
      from: '2026-06-01',
      to: '2026-06-14',
    });

    expect(churchRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'church-1' },
    });
    expect(contributionsService.getChurchReportSummary).toHaveBeenCalledWith(
      'church-1',
      { from: '2026-06-01', to: '2026-06-14' },
    );
    expect(result.totals.netAmount).toBe(950);
    expect(result.totals.grossAmount).toBe(1000);
    expect(result.church.slug).toBe('test-church');
  });

  it('maps search to contributor filter and paginates transactions', async () => {
    contributionsService.listChurchContributions.mockResolvedValue([
      {
        id: 'c1',
        amount: 100,
        commissionAmount: 5,
        fundAccountId: 'fund-1',
        fundAccountName: 'Tithe',
        fundAccount: { code: 'tithe' },
        channel: 'mpesa',
        status: 'confirmed',
        receivedAt: new Date('2026-06-14T09:00:00Z'),
        paymentReference: 'ABC123',
        payerName: 'Geoffrey',
        contributor: { name: 'Geoffrey' },
      },
    ]);

    const result = await service.listTransactions('church-1', {
      search: 'Geoffrey',
      page: 1,
      limit: 10,
    });

    expect(contributionsService.listChurchContributions).toHaveBeenCalledWith(
      'church-1',
      expect.objectContaining({ contributor: 'Geoffrey' }),
    );
    expect(result.data[0]).toMatchObject({
      id: 'c1',
      grossAmount: 100,
      commissionAmount: 5,
      netAmount: 95,
      payerName: 'Geoffrey',
    });
    expect(result.pagination.total).toBe(1);
  });
});
