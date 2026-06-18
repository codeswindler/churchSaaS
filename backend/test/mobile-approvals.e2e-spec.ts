import {
  Controller,
  ForbiddenException,
  Get,
  INestApplication,
  UseGuards,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { ChurchUser } from '../src/entities/church-user.entity';
import { MobileApprovalsController } from '../src/mobile/mobile-approvals.controller';
import { MobileApprovalsGuard } from '../src/mobile/mobile-approvals.guard';
import { MobileApprovalsService } from '../src/mobile/mobile-approvals.service';
import {
  MOBILE_FUND_DISPLAY_REVIEW_SCOPE,
  MOBILE_FUNDS_SCOPE,
  MOBILE_FUNDS_TOKEN_USE,
} from '../src/mobile/mobile.constants';
import { ChurchSubscriptionsService } from '../src/subscriptions/church-subscriptions.service';

@Controller('church/users')
@UseGuards(JwtAuthGuard)
class ContractWebUsersController {
  @Get()
  listUsers() {
    return { users: [] };
  }
}

describe('Mobile fund display approvals (e2e)', () => {
  const secret = 'mobile-approvals-contract-secret';
  const approvalsService = {
    listNotifications: jest.fn(),
    markNotificationRead: jest.fn(),
    listFundDisplayApprovals: jest.fn(),
    reviewFundDisplay: jest.fn(),
  };
  const subscriptionsService = {
    assertChurchCanOperate: jest.fn(),
  };
  const churchUserRepo = { findOne: jest.fn() };

  let app: INestApplication;
  let jwtService: JwtService;

  const signMobileToken = ({
    churchId = 'church-1',
    userId = 'priest-1',
    role = 'priest',
    scope = [MOBILE_FUNDS_SCOPE, MOBILE_FUND_DISPLAY_REVIEW_SCOPE],
  }: {
    churchId?: string;
    userId?: string;
    role?: string;
    scope?: string[];
  } = {}) =>
    jwtService.sign({
      sub: userId,
      role,
      userType: 'church',
      churchId,
      tokenUse: MOBILE_FUNDS_TOKEN_USE,
      scope,
    });

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret }),
      ],
      controllers: [MobileApprovalsController, ContractWebUsersController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        MobileApprovalsGuard,
        { provide: MobileApprovalsService, useValue: approvalsService },
        {
          provide: ChurchSubscriptionsService,
          useValue: subscriptionsService,
        },
        { provide: getRepositoryToken(ChurchUser), useValue: churchUserRepo },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    jwtService = module.get(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    subscriptionsService.assertChurchCanOperate.mockResolvedValue({
      status: 'active',
    });
    churchUserRepo.findOne.mockResolvedValue({
      id: 'priest-1',
      churchId: 'church-1',
      role: 'priest',
      isActive: true,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists notifications and marks one read for the token tenant and user', async () => {
    approvalsService.listNotifications.mockResolvedValue([
      { id: 'notification-1', isRead: false },
    ]);
    approvalsService.markNotificationRead.mockResolvedValue({
      id: 'notification-1',
      isRead: true,
      readAt: '2026-06-18T17:00:00.000Z',
    });
    const token = signMobileToken();

    await request(app.getHttpServer())
      .get('/api/mobile/notifications?includeRead=true&limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect([{ id: 'notification-1', isRead: false }]);
    await request(app.getHttpServer())
      .patch('/api/mobile/notifications/notification-1/read')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => expect(body.isRead).toBe(true));

    expect(approvalsService.listNotifications).toHaveBeenCalledWith(
      'church-1',
      'priest-1',
      expect.objectContaining({ includeRead: 'true', limit: '10' }),
    );
    expect(approvalsService.markNotificationRead).toHaveBeenCalledWith(
      'church-1',
      'priest-1',
      'notification-1',
    );
  });

  it('lists the pending approval response contract', async () => {
    const response = {
      data: [
        {
          id: 'display-1',
          title: 'Building fund',
          fundAccountId: 'fund-1',
          fundAccountName: 'Building',
          fundAccountCode: 'BUILD',
          approvalStatus: 'pending',
          displayStatus: 'pending',
          startDate: '2026-06-01',
          endDate: null,
          endMode: 'to_date',
          totalAmount: 1250,
          contributionCount: 4,
          createdAt: '2026-06-18T10:00:00.000Z',
          createdByUserId: 'admin-1',
          updatedAt: '2026-06-18T11:00:00.000Z',
          updatedByUserId: 'admin-1',
          requestedByUserId: 'admin-1',
        },
      ],
    };
    approvalsService.listFundDisplayApprovals.mockResolvedValue(response);

    await request(app.getHttpServer())
      .get('/api/mobile/fund-display-approvals')
      .set('Authorization', `Bearer ${signMobileToken()}`)
      .expect(200)
      .expect(response);

    expect(approvalsService.listFundDisplayApprovals).toHaveBeenCalledWith(
      'church-1',
      expect.any(Object),
    );
  });

  it('approves and rejects with the authenticated tenant identity', async () => {
    approvalsService.reviewFundDisplay.mockImplementation(
      async (_churchId, _userId, displayId, action) => ({
        id: displayId,
        approvalStatus: action === 'approve' ? 'approved' : 'rejected',
      }),
    );
    const token = signMobileToken();

    await request(app.getHttpServer())
      .post('/api/mobile/fund-display-approvals/display-1/approve')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Approve indefinitely' })
      .expect(201)
      .expect(({ body }) => expect(body.approvalStatus).toBe('approved'));
    await request(app.getHttpServer())
      .post('/api/mobile/fund-display-approvals/display-2/reject')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Fix the dates' })
      .expect(201)
      .expect(({ body }) => expect(body.approvalStatus).toBe('rejected'));

    expect(approvalsService.reviewFundDisplay).toHaveBeenNthCalledWith(
      1,
      'church-1',
      'priest-1',
      'display-1',
      'approve',
      { durationMinutes: undefined, note: 'Approve indefinitely' },
    );
    expect(approvalsService.reviewFundDisplay).toHaveBeenNthCalledWith(
      2,
      'church-1',
      'priest-1',
      'display-2',
      'reject',
      { note: 'Fix the dates' },
    );
  });

  it('uses the token church even when a different tenant is sent in the body', async () => {
    churchUserRepo.findOne.mockResolvedValue({
      id: 'priest-2',
      churchId: 'church-2',
      role: 'priest',
      isActive: true,
    });
    approvalsService.reviewFundDisplay.mockResolvedValue({ id: 'display-2' });

    await request(app.getHttpServer())
      .post('/api/mobile/fund-display-approvals/display-2/reject')
      .set(
        'Authorization',
        `Bearer ${signMobileToken({ churchId: 'church-2', userId: 'priest-2' })}`,
      )
      .send({ churchId: 'church-1', note: 'Tenant-safe review' })
      .expect(201);

    expect(approvalsService.reviewFundDisplay).toHaveBeenCalledWith(
      'church-2',
      'priest-2',
      'display-2',
      'reject',
      { note: 'Tenant-safe review' },
    );
  });

  it.each(['admin', 'church_admin'])(
    'rejects %s users even when their token claims the review scope',
    async (role) => {
      await request(app.getHttpServer())
        .post('/api/mobile/fund-display-approvals/display-1/approve')
        .set('Authorization', `Bearer ${signMobileToken({ role })}`)
        .send({ durationMinutes: 30 })
        .expect(403);

      expect(approvalsService.reviewFundDisplay).not.toHaveBeenCalled();
    },
  );

  it('rejects priest tokens missing the review scope', async () => {
    await request(app.getHttpServer())
      .get('/api/mobile/fund-display-approvals')
      .set(
        'Authorization',
        `Bearer ${signMobileToken({ scope: [MOBILE_FUNDS_SCOPE] })}`,
      )
      .expect(403);
  });

  it('rejects a stale token when the priest is no longer active', async () => {
    churchUserRepo.findOne.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/api/mobile/fund-display-approvals/display-1/reject')
      .set('Authorization', `Bearer ${signMobileToken()}`)
      .send({ note: 'No longer authorized' })
      .expect(403);
  });

  it('rejects suspended subscriptions before returning mobile data', async () => {
    subscriptionsService.assertChurchCanOperate.mockRejectedValue(
      new ForbiddenException('Church subscription is suspended'),
    );

    await request(app.getHttpServer())
      .get('/api/mobile/notifications')
      .set('Authorization', `Bearer ${signMobileToken()}`)
      .expect(403);

    expect(approvalsService.listNotifications).not.toHaveBeenCalled();
  });

  it('keeps review-capable mobile tokens blocked from church web routes', async () => {
    await request(app.getHttpServer())
      .get('/api/church/users')
      .set('Authorization', `Bearer ${signMobileToken()}`)
      .expect(403);
  });
});
