import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';
import { MOBILE_FUNDS_SCOPE, MOBILE_FUNDS_TOKEN_USE } from './mobile.constants';

@Injectable()
export class MobileFundsGuard extends AuthGuard('jwt') {
  constructor(
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const canActivate = (await super.canActivate(context)) as boolean;
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const scopes = Array.isArray(user?.scope) ? user.scope : [];

    if (
      !user ||
      user.userType !== 'church' ||
      !user.churchId ||
      user.tokenUse !== MOBILE_FUNDS_TOKEN_USE ||
      !scopes.includes(MOBILE_FUNDS_SCOPE)
    ) {
      throw new ForbiddenException('Mobile funds access required');
    }

    await this.churchSubscriptionsService.assertChurchCanOperate(user.churchId);
    return canActivate;
  }
}
