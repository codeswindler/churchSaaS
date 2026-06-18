import { MobilePushService } from './mobile-push.service';

describe('MobilePushService fund display approvals', () => {
  const queryBuilder: any = {
    innerJoin: jest.fn(),
    select: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    getRawMany: jest.fn(),
  };
  Object.values(queryBuilder).forEach((method: any) => {
    if (method !== queryBuilder.getRawMany) {
      method.mockReturnValue(queryBuilder);
    }
  });

  const mobileDeviceRepo = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    update: jest.fn(),
  };
  const contributionRepo = { findOne: jest.fn() };
  const messaging = { sendEachForMulticast: jest.fn() };
  let service: MobilePushService;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(queryBuilder).forEach((method: any) => {
      if (method !== queryBuilder.getRawMany) {
        method.mockReturnValue(queryBuilder);
      }
    });
    queryBuilder.getRawMany.mockResolvedValue([{ fcmToken: 'android-token' }]);
    messaging.sendEachForMulticast.mockResolvedValue({
      responses: [{ success: true }],
    });
    service = new MobilePushService(
      mobileDeviceRepo as any,
      contributionRepo as any,
    );
    (service as any).getMessaging = jest.fn(() => messaging);
  });

  it('sends recipient-specific Android data with the notification id', async () => {
    await service.notifyFundDisplayApprovalRequested({
      notificationId: 'notification-1',
      displayId: 'display-1',
      churchId: 'church-1',
      recipientUserId: 'priest-1',
    });

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'device.churchId = :churchId',
      { churchId: 'church-1' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'device.churchUserId = :churchUserId',
      { churchUserId: 'priest-1' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.role = :role', {
      role: 'priest',
    });
    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['android-token'],
        data: {
          type: 'fund_display_approval_requested',
          notificationId: 'notification-1',
          displayId: 'display-1',
          churchId: 'church-1',
        },
        android: expect.objectContaining({ priority: 'high' }),
      }),
    );
  });
});
