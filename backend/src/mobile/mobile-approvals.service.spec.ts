import { MobileApprovalsService } from './mobile-approvals.service';

describe('MobileApprovalsService', () => {
  const churchService = {
    listChurchNotifications: jest.fn(),
    markChurchNotificationRead: jest.fn(),
    listCongregationFundDisplays: jest.fn(),
    reviewCongregationFundDisplay: jest.fn(),
    updateCongregationFundDisplayDuration: jest.fn(),
    deleteCongregationFundDisplay: jest.fn(),
  };
  let service: MobileApprovalsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MobileApprovalsService(churchService as any);
  });

  it('keeps notification access scoped to the supplied church and user', async () => {
    churchService.listChurchNotifications.mockResolvedValue([]);
    churchService.markChurchNotificationRead.mockResolvedValue({
      id: 'notification-1',
      isRead: true,
    });

    await service.listNotifications('church-1', 'priest-1', { limit: '10' });
    await service.markNotificationRead(
      'church-1',
      'priest-1',
      'notification-1',
    );

    expect(churchService.listChurchNotifications).toHaveBeenCalledWith(
      'church-1',
      'priest-1',
      { limit: '10' },
    );
    expect(churchService.markChurchNotificationRead).toHaveBeenCalledWith(
      'church-1',
      'priest-1',
      'notification-1',
    );
  });

  it('returns only pending displays by default with the mobile contract fields', async () => {
    churchService.listCongregationFundDisplays.mockResolvedValue([
      {
        id: 'display-1',
        title: 'Building fund',
        description: 'not part of the mobile response',
        fundAccountId: 'fund-1',
        fundAccountName: 'Building',
        fundAccountCode: 'BUILD',
        approvalStatus: 'pending',
        displayStatus: 'pending',
        startDate: '2026-06-01',
        endDate: null,
        endMode: 'to_date',
        targetAmount: '5000',
        totalAmount: '1250',
        contributionCount: '4',
        createdAt: '2026-06-18T10:00:00.000Z',
        createdByUserId: 'admin-1',
        updatedAt: '2026-06-18T11:00:00.000Z',
        updatedByUserId: 'admin-1',
        requestedByUserId: 'admin-1',
      },
      { id: 'display-2', approvalStatus: 'approved' },
    ]);

    const result = await service.listFundDisplayApprovals('church-1');

    expect(churchService.listCongregationFundDisplays).toHaveBeenCalledWith(
      'church-1',
    );
    expect(result).toEqual({
      data: [
        {
          id: 'display-1',
          title: 'Building fund',
          description: 'not part of the mobile response',
          fundAccountId: 'fund-1',
          fundAccountName: 'Building',
          fundAccountCode: 'BUILD',
          approvalStatus: 'pending',
          displayStatus: 'pending',
          startDate: '2026-06-01',
          endDate: null,
          endMode: 'to_date',
          targetAmount: 5000,
          totalAmount: 1250,
          contributionCount: 4,
          approvalDurationMinutes: null,
          visibleFrom: null,
          visibleUntil: null,
          approvalNote: null,
          createdAt: '2026-06-18T10:00:00.000Z',
          createdByUserId: 'admin-1',
          updatedAt: '2026-06-18T11:00:00.000Z',
          updatedByUserId: 'admin-1',
          requestedByUserId: 'admin-1',
        },
      ],
    });
  });

  it.each(['approve', 'reject'] as const)(
    'delegates %s with the authenticated tenant identity',
    async (action) => {
      churchService.reviewCongregationFundDisplay.mockResolvedValue({
        id: 'display-1',
      });
      const options =
        action === 'approve'
          ? { durationMinutes: 30, note: 'Okay' }
          : { note: 'Fix dates' };

      await service.reviewFundDisplay(
        'church-1',
        'priest-1',
        'display-1',
        action,
        options,
      );

      expect(churchService.reviewCongregationFundDisplay).toHaveBeenCalledWith(
        'church-1',
        'priest-1',
        'display-1',
        action,
        options,
      );
    },
  );

  it('filters approved displays by their live display status', async () => {
    churchService.listCongregationFundDisplays.mockResolvedValue([
      {
        id: 'active-display',
        approvalStatus: 'approved',
        displayStatus: 'active',
      },
      {
        id: 'scheduled-display',
        approvalStatus: 'approved',
        displayStatus: 'scheduled',
      },
      {
        id: 'pending-display',
        approvalStatus: 'pending',
        displayStatus: 'pending',
      },
    ]);

    const result = await service.listFundDisplayApprovals('church-1', {
      status: 'approved',
      displayStatus: 'active',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('active-display');
  });

  it('delegates duration changes and cancellation with tenant identity', async () => {
    churchService.updateCongregationFundDisplayDuration.mockResolvedValue({
      id: 'display-1',
    });
    churchService.deleteCongregationFundDisplay.mockResolvedValue({
      id: 'display-1',
      deleted: true,
    });

    await service.updateFundDisplayDuration(
      'church-1',
      'priest-1',
      'display-1',
      { durationMinutes: 60, mode: 'replace', note: 'Updated' },
    );
    await service.cancelFundDisplay('church-1', 'priest-1', 'display-1');

    expect(
      churchService.updateCongregationFundDisplayDuration,
    ).toHaveBeenCalledWith('church-1', 'priest-1', 'display-1', {
      durationMinutes: 60,
      mode: 'replace',
      note: 'Updated',
    });
    expect(churchService.deleteCongregationFundDisplay).toHaveBeenCalledWith(
      'church-1',
      'priest-1',
      'display-1',
    );
  });
});
