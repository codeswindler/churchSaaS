import {
  Controller,
  ForbiddenException,
  Get,
  INestApplication,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { MobileAuthController } from '../src/mobile/mobile-auth.controller';
import {
  MOBILE_FUND_DISPLAY_REVIEW_SCOPE,
  MOBILE_FUNDS_SCOPE,
  MOBILE_FUNDS_TOKEN_USE,
} from '../src/mobile/mobile.constants';
import { MobileFundsController } from '../src/mobile/mobile-funds.controller';
import { MobileFundsGuard } from '../src/mobile/mobile-funds.guard';
import { MobileFundsService } from '../src/mobile/mobile-funds.service';
import { ChurchSubscriptionsService } from '../src/subscriptions/church-subscriptions.service';

@Controller('church/users')
@UseGuards(JwtAuthGuard)
class ContractWebUsersController {
  @Get()
  listUsers() {
    return { users: [] };
  }
}

describe('Mobile funds API contracts (e2e)', () => {
  const secret = 'mobile-funds-contract-secret';
  const authService = { mobileFundsLogin: jest.fn() };
  const fundsService = {
    getDashboard: jest.fn(),
    getSummary: jest.fn(),
    listTransactions: jest.fn(),
    listFundAccounts: jest.fn(),
  };
  const subscriptionsService = {
    assertChurchCanOperate: jest.fn(),
  };

  let app: INestApplication;
  let jwtService: JwtService;

  const signMobileToken = (churchId = 'church-1', role = 'priest') =>
    jwtService.sign({
      sub: 'user-1',
      role,
      userType: 'church',
      churchId,
      tokenUse: MOBILE_FUNDS_TOKEN_USE,
      scope: [MOBILE_FUNDS_SCOPE, MOBILE_FUND_DISPLAY_REVIEW_SCOPE],
    });

  const signWebToken = () =>
    jwtService.sign({
      sub: 'user-1',
      role: 'priest',
      userType: 'church',
      churchId: 'church-1',
      tokenUse: 'web',
      scope: [],
    });

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret }),
      ],
      controllers: [
        MobileAuthController,
        MobileFundsController,
        ContractWebUsersController,
      ],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        MobileFundsGuard,
        { provide: AuthService, useValue: authService },
        { provide: MobileFundsService, useValue: fundsService },
        {
          provide: ChurchSubscriptionsService,
          useValue: subscriptionsService,
        },
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns both mobile scopes for a priest login', async () => {
    const role = 'priest';
    const token = signMobileToken('church-1', role);
    authService.mobileFundsLogin.mockResolvedValue({
      access_token: token,
      tokenUse: MOBILE_FUNDS_TOKEN_USE,
      scope: [MOBILE_FUNDS_SCOPE, MOBILE_FUND_DISPLAY_REVIEW_SCOPE],
      user: {
        id: 'user-1',
        name: 'Bishop Geoffrey',
        role,
        userType: 'church',
        churchId: 'church-1',
      },
      church: {
        id: 'church-1',
        name: 'Test Church',
        slug: 'test-church',
        billingModel: 'commission',
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/mobile/auth/login')
      .send({ identifier: 'bishop', password: 'secret' })
      .expect(200);

    expect(authService.mobileFundsLogin).toHaveBeenCalledWith(
      'bishop',
      'secret',
    );
    expect(response.body).toEqual({
      access_token: token,
      tokenUse: MOBILE_FUNDS_TOKEN_USE,
      scope: [MOBILE_FUNDS_SCOPE, MOBILE_FUND_DISPLAY_REVIEW_SCOPE],
      user: {
        id: 'user-1',
        name: 'Bishop Geoffrey',
        role,
        userType: 'church',
        churchId: 'church-1',
      },
      church: {
        id: 'church-1',
        name: 'Test Church',
        slug: 'test-church',
        billingModel: 'commission',
      },
    });
  });

  it('returns the dashboard contract scoped to the token church', async () => {
    const dashboard = {
      church: { id: 'church-1', name: 'Test Church', slug: 'test-church' },
      period: {
        from: '2026-06-01',
        to: '2026-06-30',
        fundAccountId: null,
        channel: null,
        status: null,
      },
      totals: {
        totalReceived: 950,
        totalAmount: 950,
        grossAmount: 1000,
        commissionAmount: 50,
        netAmount: 950,
        mpesaAmount: 950,
        cashAmount: 0,
        contributionCount: 1,
      },
      fundAccountTotals: [],
      trendData: [],
      recentContributions: [],
    };
    fundsService.getDashboard.mockResolvedValue(dashboard);

    const response = await request(app.getHttpServer())
      .get('/api/mobile/funds/dashboard?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${signMobileToken()}`)
      .expect(200);

    expect(fundsService.getDashboard).toHaveBeenCalledWith(
      'church-1',
      expect.objectContaining({
        from: '2026-06-01',
        to: '2026-06-30',
      }),
    );
    expect(response.body).toEqual(dashboard);
  });

  it('returns the paginated transactions contract', async () => {
    const transactions = {
      data: [
        {
          id: 'contribution-1',
          amount: 100,
          grossAmount: 100,
          commissionAmount: 5,
          netAmount: 95,
          fundAccountId: 'fund-1',
          fundAccountName: 'Tithe',
          fundAccountCode: 'tithe',
          channel: 'mpesa',
          status: 'confirmed',
          receivedAt: '2026-06-14T09:00:00.000Z',
          paymentReference: 'ABC123',
          payerName: 'Geoffrey',
          contributorName: 'Geoffrey',
        },
      ],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    };
    fundsService.listTransactions.mockResolvedValue(transactions);

    const response = await request(app.getHttpServer())
      .get('/api/mobile/funds/transactions?search=Geoffrey&page=1&limit=25')
      .set('Authorization', `Bearer ${signMobileToken()}`)
      .expect(200);

    expect(fundsService.listTransactions).toHaveBeenCalledWith(
      'church-1',
      expect.objectContaining({ search: 'Geoffrey', page: '1', limit: '25' }),
    );
    expect(response.body).toEqual(transactions);
  });

  it('keeps the exact fundAccounts envelope and fields', async () => {
    const result = {
      fundAccounts: [
        {
          id: 'fund-1',
          name: 'Tithe',
          code: 'tithe',
          description: 'Regular tithe contributions',
          displayOrder: 1,
          isActive: true,
        },
      ],
    };
    fundsService.listFundAccounts.mockResolvedValue(result);

    const response = await request(app.getHttpServer())
      .get('/api/mobile/funds/fund-accounts')
      .set('Authorization', `Bearer ${signMobileToken()}`)
      .expect(200);

    expect(fundsService.listFundAccounts).toHaveBeenCalledWith('church-1');
    expect(response.body).toEqual(result);
  });

  it('rejects suspended subscriptions before funds data is returned', async () => {
    subscriptionsService.assertChurchCanOperate.mockRejectedValue(
      new ForbiddenException('Church subscription is suspended'),
    );

    await request(app.getHttpServer())
      .get('/api/mobile/funds/dashboard')
      .set('Authorization', `Bearer ${signMobileToken()}`)
      .expect(403);

    expect(fundsService.getDashboard).not.toHaveBeenCalled();
  });

  it('returns the login subscription rejection unchanged', async () => {
    authService.mobileFundsLogin.mockRejectedValue(
      new UnauthorizedException('Church subscription is suspended'),
    );

    await request(app.getHttpServer())
      .post('/api/mobile/auth/login')
      .send({ identifier: 'bishop', password: 'secret' })
      .expect(401)
      .expect(({ body }) => {
        expect(body.message).toBe('Church subscription is suspended');
      });
  });

  it('rejects web tokens on mobile routes', async () => {
    await request(app.getHttpServer())
      .get('/api/mobile/funds/fund-accounts')
      .set('Authorization', `Bearer ${signWebToken()}`)
      .expect(403);
  });

  it('rejects mobile funds tokens on normal church web routes', async () => {
    await request(app.getHttpServer())
      .get('/api/church/users')
      .set('Authorization', `Bearer ${signMobileToken()}`)
      .expect(403);
  });
});
