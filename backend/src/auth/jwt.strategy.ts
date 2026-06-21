import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PERMISSION_FEATURE_MAP,
  ChurchPermission,
  normalizeChurchRole,
  normalizeFeatureList,
  resolveChurchPermissions,
} from '../common/access-control';
import { ChurchUser } from '../entities/church-user.entity';
import { PlatformUser } from '../entities/platform-user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(ChurchUser)
    private readonly churchUserRepo: Repository<ChurchUser>,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepo: Repository<PlatformUser>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET || 'church-system-secret-change-in-production',
    });
  }

  async validate(payload: any) {
    if (payload.userType === 'platform') {
      const platformUser = await this.platformUserRepo.findOne({
        where: { id: payload.sub },
      });
      if (!platformUser?.isActive) {
        throw new UnauthorizedException('Account is inactive');
      }
      return {
        id: platformUser.id,
        role: platformUser.role,
        userType: 'platform',
        tokenUse: payload.tokenUse || 'web',
        scope: payload.scope || [],
      };
    }

    const churchUser = await this.churchUserRepo.findOne({
      where: { id: payload.sub },
      relations: ['church'],
    });
    if (!churchUser?.isActive || !churchUser.church) {
      throw new UnauthorizedException('Account is inactive');
    }
    const role = normalizeChurchRole(churchUser.role);
    const enabledFeatures = normalizeFeatureList(
      churchUser.church.enabledFeatures,
    );
    const permissions = resolveChurchPermissions(
      role,
      churchUser.permissionOverrides,
      churchUser.permissionDenials,
    ).filter((permission) => {
      const requiredFeature = PERMISSION_FEATURE_MAP[permission];
      return (
        permission === ChurchPermission.DASHBOARD_VIEW ||
        !requiredFeature ||
        enabledFeatures.includes(requiredFeature)
      );
    });

    return {
      id: churchUser.id,
      role,
      userType: 'church',
      churchId: churchUser.churchId,
      tokenUse: payload.tokenUse || 'web',
      scope: payload.scope || [],
      permissions,
      enabledFeatures,
      permissionOverrides: churchUser.permissionOverrides || [],
      permissionDenials: churchUser.permissionDenials || [],
    };
  }
}
