import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  MOBILE_FUND_DISPLAY_REVIEW_SCOPE,
  MOBILE_FUNDS_SCOPE,
} from '../mobile/mobile.constants';

describe('AuthService mobile approval scopes', () => {
  const jwtService = { sign: jest.fn(() => 'mobile-token') };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      {} as any,
      {} as any,
      jwtService as any,
      {} as any,
    );
    jest.spyOn(service as any, 'findChurchIdentity').mockResolvedValue({
      user: {},
      ambiguousName: false,
    });
  });

  it('adds the review scope to a validated active priest token', async () => {
    jest
      .spyOn(service as any, 'validateChurchUserCredentials')
      .mockResolvedValue({
        id: 'priest-1',
        name: 'Priest',
        email: 'priest@example.com',
        username: 'priest',
        phone: null,
        passwordHash: 'hash',
        role: 'priest',
        isActive: true,
        churchId: 'church-1',
        permissionOverrides: null,
        permissionDenials: null,
        church: {
          id: 'church-1',
          name: 'Test Church',
          slug: 'test-church',
          billingModel: 'commission',
          enabledFeatures: [],
        },
      });

    const result = await service.mobileFundsLogin('priest', 'secret');

    expect(result.scope).toEqual([
      MOBILE_FUNDS_SCOPE,
      MOBILE_FUND_DISPLAY_REVIEW_SCOPE,
    ]);
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'priest',
        scope: [MOBILE_FUNDS_SCOPE, MOBILE_FUND_DISPLAY_REVIEW_SCOPE],
      }),
      { expiresIn: '30d' },
    );
  });

  it.each(['user', 'admin'])(
    'does not issue a mobile token to %s users',
    async (role) => {
      jest
        .spyOn(service as any, 'validateChurchUserCredentials')
        .mockResolvedValue({ role });

      await expect(
        service.mobileFundsLogin('user', 'secret'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtService.sign).not.toHaveBeenCalled();
    },
  );
});
