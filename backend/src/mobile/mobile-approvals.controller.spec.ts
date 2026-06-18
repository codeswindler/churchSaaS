import { MobileApprovalsController } from './mobile-approvals.controller';

describe('MobileApprovalsController', () => {
  const mobileApprovalsService = {
    listNotifications: jest.fn(),
    markNotificationRead: jest.fn(),
    listFundDisplayApprovals: jest.fn(),
    reviewFundDisplay: jest.fn(),
  };
  const controller = new MobileApprovalsController(
    mobileApprovalsService as any,
  );
  const request = { user: { id: 'priest-1', churchId: 'church-1' } };

  beforeEach(() => jest.clearAllMocks());

  it('lists and marks notifications for the authenticated tenant user', async () => {
    mobileApprovalsService.listNotifications.mockResolvedValue([]);
    mobileApprovalsService.markNotificationRead.mockResolvedValue({
      id: 'notification-1',
      isRead: true,
    });

    await controller.listNotifications(request, { includeRead: 'true' });
    await controller.markNotificationRead(request, 'notification-1');

    expect(mobileApprovalsService.listNotifications).toHaveBeenCalledWith(
      'church-1',
      'priest-1',
      { includeRead: 'true' },
    );
    expect(mobileApprovalsService.markNotificationRead).toHaveBeenCalledWith(
      'church-1',
      'priest-1',
      'notification-1',
    );
  });

  it('lists pending approvals for the authenticated church', async () => {
    mobileApprovalsService.listFundDisplayApprovals.mockResolvedValue({
      data: [],
    });

    await controller.listFundDisplayApprovals(request, { status: 'pending' });

    expect(
      mobileApprovalsService.listFundDisplayApprovals,
    ).toHaveBeenCalledWith('church-1', { status: 'pending' });
  });

  it('passes approve and reject actions without accepting tenant ids from the body', async () => {
    mobileApprovalsService.reviewFundDisplay.mockResolvedValue({
      id: 'display-1',
    });

    await controller.approveFundDisplay(request, 'display-1', {
      durationMinutes: 90,
      note: 'Approved on mobile',
      churchId: 'other-church',
    });
    await controller.rejectFundDisplay(request, 'display-2', {
      note: 'Needs correction',
    });

    expect(mobileApprovalsService.reviewFundDisplay).toHaveBeenNthCalledWith(
      1,
      'church-1',
      'priest-1',
      'display-1',
      'approve',
      { durationMinutes: 90, note: 'Approved on mobile' },
    );
    expect(mobileApprovalsService.reviewFundDisplay).toHaveBeenNthCalledWith(
      2,
      'church-1',
      'priest-1',
      'display-2',
      'reject',
      { note: 'Needs correction' },
    );
  });
});
