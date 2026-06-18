import { MobileFundsController } from './mobile-funds.controller';

describe('MobileFundsController', () => {
  const mobileFundsService = {
    listFundAccounts: jest.fn(),
  };
  const controller = new MobileFundsController(mobileFundsService as any);

  beforeEach(() => jest.clearAllMocks());

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
