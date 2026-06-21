import { UnauthorizedException } from '@nestjs/common';
import { ChurchPermission } from '../common/access-control';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy current church access', () => {
  const platformUserRepo = { findOne: jest.fn() };
  const churchUserRepo = { findOne: jest.fn() };
  const strategy = new JwtStrategy(
    churchUserRepo as any,
    platformUserRepo as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses current database denials instead of stale token permissions', async () => {
    churchUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      churchId: 'church-1',
      role: 'user',
      isActive: true,
      permissionOverrides: [],
      permissionDenials: [ChurchPermission.MESSAGING_SEND],
      church: {
        enabledFeatures: [
          'finance',
          'fund_accounts',
          'messaging',
          'staff_management',
          'discipleship',
        ],
      },
    });

    const result = await strategy.validate({
      sub: 'user-1',
      userType: 'church',
      permissions: [ChurchPermission.MESSAGING_SEND],
    });

    expect(result.role).toBe('user');
    expect(result.permissions).not.toContain(ChurchPermission.MESSAGING_SEND);
    expect(result.permissionDenials).toEqual([ChurchPermission.MESSAGING_SEND]);
  });

  it('rejects a token immediately when the account is inactive', async () => {
    churchUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      isActive: false,
      church: {},
    });

    await expect(
      strategy.validate({ sub: 'user-1', userType: 'church' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
