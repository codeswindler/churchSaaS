import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ChurchSubscriptionsService } from '../subscriptions/church-subscriptions.service';

@Injectable()
export class ChurchAccessGuard implements CanActivate {
  constructor(
    private readonly churchSubscriptionsService: ChurchSubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.userType !== 'church' || !user.churchId) {
      return true;
    }

    try {
      await this.churchSubscriptionsService.assertChurchCanOperate(
        user.churchId,
      );
      return true;
    } catch (error) {
      throw new ForbiddenException(error.message);
    }
  }
}
