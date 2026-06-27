import { MobileB2cController } from './mobile-b2c.controller';

describe('MobileB2cController', () => {
  const mobileB2cService = {
    listWithdrawals: jest.fn(),
    createWithdrawal: jest.fn(),
    handleResultCallback: jest.fn(),
    handleTimeoutCallback: jest.fn(),
  };
  const controller = new MobileB2cController(mobileB2cService as any);
  const request = { user: { id: 'priest-1', churchId: 'church-1' } };

  beforeEach(() => jest.clearAllMocks());

  it('lists withdrawals scoped to the authenticated church', async () => {
    mobileB2cService.listWithdrawals.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    });

    await controller.listWithdrawals(request, { page: '1', limit: '10' });

    expect(mobileB2cService.listWithdrawals).toHaveBeenCalledWith(
      'church-1',
      { page: '1', limit: '10' },
    );
  });

  it('creates withdrawals without accepting tenant ids from the body', async () => {
    mobileB2cService.createWithdrawal.mockResolvedValue({
      id: 'withdrawal-1',
    });

    await controller.createWithdrawal(request, {
      churchId: 'other-church',
      phoneNumber: '254712345678',
      amount: 1000,
      remarks: 'Reason',
    });

    expect(mobileB2cService.createWithdrawal).toHaveBeenCalledWith(
      'church-1',
      'priest-1',
      {
        churchId: 'other-church',
        phoneNumber: '254712345678',
        amount: 1000,
        remarks: 'Reason',
      },
    );
  });

  it('accepts Daraja result and timeout callbacks without mobile auth context', async () => {
    mobileB2cService.handleResultCallback.mockResolvedValue({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });
    mobileB2cService.handleTimeoutCallback.mockResolvedValue({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });

    await controller.handleResultCallback({ Result: { ResultCode: 0 } });
    await controller.handleTimeoutCallback({ Result: { ResultCode: 1 } });

    expect(mobileB2cService.handleResultCallback).toHaveBeenCalledWith({
      Result: { ResultCode: 0 },
    });
    expect(mobileB2cService.handleTimeoutCallback).toHaveBeenCalledWith({
      Result: { ResultCode: 1 },
    });
  });
});
