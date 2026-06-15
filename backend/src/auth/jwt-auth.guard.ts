import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const canActivate = (await super.canActivate(context)) as boolean;
    const request = context.switchToHttp().getRequest();
    if (request.user?.tokenUse === 'mobile_funds') {
      throw new ForbiddenException(
        'Mobile funds tokens cannot access web endpoints',
      );
    }

    return canActivate;
  }
}
