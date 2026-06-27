import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeChurchRole } from '../common/access-control';
import { ChurchUser, ChurchUserRole } from '../entities/church-user.entity';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';
import {
  MOBILE_B2C_READ_SCOPE,
  MOBILE_B2C_WRITE_SCOPE,
  MOBILE_FUNDS_TOKEN_USE,
} from './mobile.constants';

@Injectable()
export class MobileB2cGuard extends AuthGuard('jwt') {
  constructor(
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
    @InjectRepository(ChurchUser)
    private readonly churchUserRepo: Repository<ChurchUser>,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const canActivate = (await super.canActivate(context)) as boolean;
    const request = context.switchToHttp().getRequest<{
      method?: string;
      user?: {
        id?: string;
        churchId?: string;
        role?: string;
        userType?: string;
        tokenUse?: string;
        scope?: string[];
      };
    }>();
    const user = request.user;
    const scopes = Array.isArray(user?.scope) ? user.scope : [];
    const requiresWrite = `${request.method || 'GET'}`.toUpperCase() !== 'GET';

    if (
      !user ||
      !user.id ||
      user.userType !== 'church' ||
      !user.churchId ||
      user.tokenUse !== MOBILE_FUNDS_TOKEN_USE ||
      normalizeChurchRole(user.role) !== ChurchUserRole.PRIEST ||
      !scopes.includes(MOBILE_B2C_READ_SCOPE) ||
      (requiresWrite && !scopes.includes(MOBILE_B2C_WRITE_SCOPE))
    ) {
      throw new ForbiddenException('Priest mobile B2C access required');
    }

    const activeUser = await this.churchUserRepo.findOne({
      where: { id: user.id, churchId: user.churchId, isActive: true },
    });
    if (
      !activeUser ||
      normalizeChurchRole(activeUser.role) !== ChurchUserRole.PRIEST
    ) {
      throw new ForbiddenException('Active priest account required');
    }

    await this.churchSubscriptionsService.assertChurchCanOperate(user.churchId);
    return canActivate;
  }
}
