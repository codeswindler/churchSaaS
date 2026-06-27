import { BadRequestException } from '@nestjs/common';
import { ChurchService } from './church.service';

describe('ChurchService discipleship name matching', () => {
  const service = Object.create(ChurchService.prototype) as ChurchService;
  const scoreName = (left: string, right: string) =>
    (service as any).scoreDiscipleshipNameMatch(left, right) as number;

  it('matches a shortened two-part transaction name to a fuller manual name', () => {
    expect(scoreName('Wilson Mwiro', 'Wilson Murioki Mwiro')).toBeGreaterThan(
      0,
    );
  });

  it('does not fuzzy-match a single transaction name', () => {
    expect(scoreName('Wilson', 'Wilson Murioki Mwiro')).toBe(0);
    expect(scoreName('JOSEPH', 'Joseph Njunji')).toBe(0);
  });

  it('does not match names that share only one part', () => {
    expect(scoreName('Wilson Mwiro', 'Wilson Muriuki')).toBe(0);
  });

  it('matches name parts independently of case and spacing', () => {
    expect(scoreName('  WILSON   MWIR0 ', 'Wilson Murioki Mwiro')).toBe(0);
    expect(
      scoreName('  WILSON   MWIRO ', 'Wilson Murioki Mwiro'),
    ).toBeGreaterThan(0);
  });

  it('detects contradictory known phone numbers', () => {
    const hasConflict = (
      transactionPhone: string | null,
      memberPhone: string | null,
    ) =>
      (service as any).hasDiscipleshipPhoneConflict(
        transactionPhone,
        memberPhone,
      ) as boolean;

    expect(hasConflict('254724075174', '0724075174')).toBe(false);
    expect(hasConflict('254724075174', '254700000000')).toBe(true);
    expect(hasConflict('254724075174', '254724075174')).toBe(false);
    expect(hasConflict(null, '254724075174')).toBe(false);
  });

  it('does not treat different hashed payer identities as the same person', () => {
    const hasConflict = (left: string[], right: string[]) =>
      (service as any).hasDiscipleshipNumberIdentityConflict(
        new Set(left),
        new Set(right),
      ) as boolean;

    expect(hasConflict(['provider:hash-a'], ['provider:hash-b'])).toBe(true);
    expect(
      hasConflict(
        ['phone:254724075174', 'provider:hash-a'],
        ['phone:254724075174', 'provider:hash-b'],
      ),
    ).toBe(false);
    expect(hasConflict([], ['provider:hash-b'])).toBe(false);
  });

  it('stores removable User permissions but strips Priest-only access', () => {
    const access = (service as any).normalizeChurchUserAccess(
      'user',
      ['messaging.send', 'dashboard.view', 'users.manage'],
      ['discipleship.manage'],
    );

    expect(access.permissionOverrides).toEqual(['messaging.send']);
    expect(access.permissionDenials).toEqual(['discipleship.manage']);
  });

  it('clears custom permission changes for Priest', () => {
    expect(
      (service as any).normalizeChurchUserAccess(
        'priest',
        ['messaging.send'],
        ['reports.view'],
      ),
    ).toEqual({
      permissionOverrides: null,
      permissionDenials: null,
    });
  });

  it('protects the last active Priest from demotion', async () => {
    (service as any).churchUserRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'priest-1', role: 'priest', isActive: true },
        { id: 'user-1', role: 'user', isActive: true },
      ]),
    };

    await expect(
      (service as any).assertLastActivePriestRemains(
        'church-1',
        { id: 'priest-1', role: 'priest', isActive: true },
        'user',
        true,
      ),
    ).rejects.toThrow('last active Priest');
  });

  it('starts approval duration immediately and validates its bounds', () => {
    const buildWindow = (durationMinutes?: number) =>
      (service as any).buildFundDisplayDurationWindow(durationMinutes, {
        now: new Date('2026-06-18T06:00:00.000Z'),
      });

    expect(buildWindow(60)).toEqual({
      approvalDurationMinutes: 60,
      visibleFrom: '2026-06-18T06:00:00.000Z',
      visibleUntil: '2026-06-18T07:00:00.000Z',
    });
    expect(() => buildWindow()).toThrow(BadRequestException);
    expect(() => buildWindow(0)).toThrow(
      'Approval duration must be between 1 minute and 365 days',
    );
  });

  it('extends an active timer from its current expiry', () => {
    const window = (service as any).buildFundDisplayDurationWindow(30, {
      mode: 'extend',
      currentVisibleFrom: '2026-06-18T06:00:00.000Z',
      currentVisibleUntil: '2026-06-18T07:00:00.000Z',
      now: new Date('2026-06-18T06:15:00.000Z'),
    });

    expect(window).toEqual({
      approvalDurationMinutes: 30,
      visibleFrom: '2026-06-18T06:00:00.000Z',
      visibleUntil: '2026-06-18T07:30:00.000Z',
    });
  });

  it('keeps legacy approved fund displays compatible without visibility dates', () => {
    const normalized = (service as any).normalizeFundDisplays([
      {
        id: 'legacy-display',
        fundAccountId: 'fund-1',
        startDate: '2026-01-01',
        approvalStatus: 'approved',
      },
    ]);

    expect(normalized).toEqual([
      expect.objectContaining({
        id: 'legacy-display',
        approvalStatus: 'approved',
        visibleFrom: null,
        visibleUntil: null,
      }),
    ]);
  });

  it('normalizes an optional positive fund account target', () => {
    expect(
      (service as any).normalizeFundAccountTargetAmount('1500000.50'),
    ).toBe(1500000.5);
    expect((service as any).normalizeFundAccountTargetAmount('')).toBeNull();
    expect(() =>
      (service as any).normalizeFundAccountTargetAmount('-1'),
    ).toThrow('Fund account target must be a positive amount');
  });

  it('uses the fund account target before the legacy display fallback', () => {
    expect(
      (service as any).resolveFundDisplayTargetAmount(
        { targetAmount: 200000 },
        { targetAmount: 100000 },
      ),
    ).toBe(200000);
    expect(
      (service as any).resolveFundDisplayTargetAmount(
        { targetAmount: null },
        { targetAmount: 100000 },
      ),
    ).toBe(100000);
    expect(
      (service as any).resolveFundDisplayTargetAmount(
        { targetAmount: null },
        {},
      ),
    ).toBeNull();
  });

  it('keeps legacy display targets normalized for compatibility', () => {
    const normalized = (service as any).normalizeFundDisplays([
      {
        id: 'target-display',
        fundAccountId: 'fund-1',
        startDate: '2026-01-01',
        targetAmount: '1500000.50',
      },
    ]);
    expect(normalized[0]).toEqual(
      expect.objectContaining({
        targetAmount: 1500000.5,
      }),
    );
    expect(() =>
      (service as any).normalizeFundDisplays([
        {
          fundAccountId: 'fund-1',
          startDate: '2026-01-01',
          targetAmount: '-1',
        },
      ]),
    ).toThrow('Fund display target must be a positive amount');
  });

  it('marks non-priest fund display edits as pending', () => {
    const previous = {
      id: 'display-1',
      title: 'Building fund',
      fundAccountId: 'fund-1',
      startDate: '2026-01-01',
      endMode: 'to_date',
      isActive: true,
      approvalStatus: 'approved',
      visibleFrom: '2026-06-18T06:00:00.000Z',
      visibleUntil: '2026-06-18T15:00:00.000Z',
    };
    const next = { ...previous, title: 'Updated building fund' };

    const result = (service as any).applyFundDisplayApprovalState(
      [previous],
      [next],
      'admin-1',
      false,
    );

    expect(result.pendingIds).toEqual(['display-1']);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        approvalStatus: 'pending',
        requestedByUserId: 'admin-1',
        approvedByUserId: null,
      }),
    );
  });

  it('does not treat a legacy display target as editable display content', () => {
    const previous = {
      id: 'display-1',
      fundAccountId: 'fund-1',
      startDate: '2026-01-01',
      targetAmount: 100000,
      endMode: 'to_date',
      isActive: true,
      approvalStatus: 'approved',
    };

    const result = (service as any).applyFundDisplayApprovalState(
      [previous],
      [{ ...previous, targetAmount: 150000 }],
      'admin-1',
      false,
    );

    expect(result.pendingIds).toEqual([]);
    expect(result.items[0].approvalStatus).toBe('approved');
  });

  it('archives fund accounts without deleting their history target', async () => {
    const account = {
      id: 'fund-1',
      churchId: 'church-1',
      code: 'building',
      name: 'Building',
      isActive: true,
      archivedAt: null,
      archivedByUserId: null,
      archiveReason: null,
      targetAmount: 500000,
    };
    const save = jest.fn(async (value) => value);
    (service as any).fundAccountRepo = {
      findOne: jest.fn().mockResolvedValue(account),
      save,
    };

    const archived = await service.archiveFundAccount(
      'church-1',
      'fund-1',
      'priest-1',
      { reason: 'Project complete' },
    );

    expect(archived).toEqual(
      expect.objectContaining({
        isActive: false,
        archivedByUserId: 'priest-1',
        archiveReason: 'Project complete',
        targetAmount: 500000,
      }),
    );
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalledWith(account);
  });

  it('does not archive the General fallback account', async () => {
    (service as any).fundAccountRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'general',
        churchId: 'church-1',
        code: 'general',
        name: 'General',
        isActive: true,
      }),
    };

    await expect(
      service.archiveFundAccount('church-1', 'general', 'priest-1', {}),
    ).rejects.toThrow('General fund account cannot be archived');
  });

  it('uses the same outbox filters for CSV exports', async () => {
    const listOutboxRows = jest.fn().mockResolvedValue([]);
    (service as any).smsService = { listOutboxRows };
    const filters = { search: 'Geoffrey', deliveryStatus: 'delivered' };

    const csv = await service.exportSmsOutboxCsv('church-1', filters);

    expect(listOutboxRows).toHaveBeenCalledWith('church-1', filters);
    expect(csv).toContain('Recipient');
  });

  it('transactionally removes expired fund displays and their notifications', async () => {
    const page = {
      id: 'page-1',
      churchId: 'church-1',
      fundDisplays: [
        {
          id: 'expired-display',
          approvalStatus: 'approved',
          visibleUntil: '2000-01-01T00:00:00.000Z',
        },
        {
          id: 'active-display',
          approvalStatus: 'approved',
          visibleUntil: '2999-01-01T00:00:00.000Z',
        },
      ],
    };
    const pageRepo = {
      findOne: jest.fn().mockResolvedValue(page),
      save: jest.fn().mockResolvedValue(page),
    };
    const notificationRepo = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = {
      getRepository: jest
        .fn()
        .mockReturnValueOnce(pageRepo)
        .mockReturnValueOnce(notificationRepo),
    };
    (service as any).congregationPageRepo = {
      find: jest.fn().mockResolvedValue([{ id: 'page-1' }]),
    };
    (service as any).dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    };

    await service.cleanupExpiredFundDisplays();

    expect(pageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fundDisplays: [expect.objectContaining({ id: 'active-display' })],
      }),
    );
    expect(notificationRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        churchId: 'church-1',
        entityType: 'congregation_fund_display',
      }),
    );
  });

  it('approves within the supplied tenant and automatically reads display notifications', async () => {
    const page = {
      id: 'page-1',
      churchId: 'church-1',
      updatedByUserId: null,
      fundDisplays: [
        {
          id: 'display-1',
          title: 'Building fund',
          fundAccountId: 'fund-1',
          startDate: '2026-06-01',
          endMode: 'to_date',
          approvalStatus: 'pending',
          requestedByUserId: 'admin-1',
        },
      ],
    };
    const pageRepo = {
      findOne: jest.fn(({ where }) =>
        Promise.resolve(where.churchId === 'church-1' ? page : null),
      ),
      save: jest.fn(async (value) => value),
    };
    const notificationRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'notification-1',
          churchId: 'church-1',
          entityId: 'display-1',
          isRead: false,
          readAt: null,
        },
      ]),
      save: jest.fn(async (value) => value),
    };
    (service as any).congregationPageRepo = pageRepo;
    (service as any).churchNotificationRepo = notificationRepo;
    (service as any).fundAccountRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const result = await service.reviewCongregationFundDisplay(
      'church-1',
      'priest-1',
      'display-1',
      'approve',
      { note: 'Approved from mobile' },
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'display-1',
        approvalStatus: 'approved',
        displayStatus: 'active',
        visibleUntil: null,
        updatedByUserId: 'priest-1',
      }),
    );
    expect(notificationRepo.find).toHaveBeenCalledWith({
      where: {
        churchId: 'church-1',
        entityType: 'congregation_fund_display',
        entityId: 'display-1',
        isRead: false,
      },
    });
    expect(notificationRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'notification-1',
        isRead: true,
        readAt: expect.any(Date),
      }),
    ]);

    await expect(
      service.reviewCongregationFundDisplay(
        'church-2',
        'priest-1',
        'display-1',
        'reject',
      ),
    ).rejects.toThrow('Congregation page not found');
  });

  it('creates recipient-specific mobile pushes for new approval notifications', async () => {
    const notificationRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (values: any[]) =>
        values.map((value, index) => ({
          ...value,
          id: `notification-${index + 1}`,
        })),
      ),
    };
    const mobilePushService = {
      notifyFundDisplayApprovalRequested: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    (service as any).churchUserRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'priest-1', role: 'priest', isActive: true },
        { id: 'priest-2', role: 'priest', isActive: true },
      ]),
    };
    (service as any).churchNotificationRepo = notificationRepo;
    (service as any).mobilePushService = mobilePushService;

    await (service as any).notifyPriestsForPendingFundDisplays(
      'church-1',
      'admin-1',
      [
        {
          id: 'display-1',
          title: 'Building fund',
          approvalStatus: 'pending',
        },
      ],
      ['display-1'],
    );

    expect(
      mobilePushService.notifyFundDisplayApprovalRequested,
    ).toHaveBeenCalledTimes(2);
    expect(
      mobilePushService.notifyFundDisplayApprovalRequested,
    ).toHaveBeenNthCalledWith(1, {
      notificationId: 'notification-1',
      displayId: 'display-1',
      churchId: 'church-1',
      recipientUserId: 'priest-1',
    });
  });
});
