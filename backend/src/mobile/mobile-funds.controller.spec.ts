import { MobileFundsController } from './mobile-funds.controller';

describe('MobileFundsController', () => {
  const mobileFundsService = {
    getAnalysis: jest.fn(),
    listFundAccounts: jest.fn(),
  };
  const controller = new MobileFundsController(mobileFundsService as any);

  beforeEach(() => jest.clearAllMocks());

  it('returns analysis scoped to the authenticated church', async () => {
    mobileFundsService.getAnalysis.mockResolvedValue({
      dailyTotals: [],
      contributorTotals: [],
    });

    await controller.getAnalysis(
      { user: { churchId: 'church-1' } },
      { from: '2026-06-01', to: '2026-06-30' },
    );

    expect(mobileFundsService.getAnalysis).toHaveBeenCalledWith('church-1', {
      from: '2026-06-01',
      to: '2026-06-30',
    });
  });

  it('returns the documented fundAccounts envelope for the authenticated church', async () => {
    mobileFundsService.listFundAccounts.mockResolvedValue({
      fundAccounts: [
        {
          id: 'fund-1',
          name: 'Offering',
          code: 'offering',
          description: null,
          displayOrder: 2,
          isActive: true,
        },
      ],
    });

    const result = await controller.listFundAccounts({
      user: { churchId: 'church-1' },
    });

    expect(mobileFundsService.listFundAccounts).toHaveBeenCalledWith(
      'church-1',
    );
    expect(result).toEqual({
      fundAccounts: [
        {
          id: 'fund-1',
          name: 'Offering',
          code: 'offering',
          description: null,
          displayOrder: 2,
          isActive: true,
        },
      ],
    });
  });
});
