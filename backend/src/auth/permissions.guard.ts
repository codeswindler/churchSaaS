import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ChurchPermission,
  hasEffectiveChurchPermission,
} from '../common/access-control';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<ChurchPermission[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    if (!requiredPermissions?.length) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || user.userType !== 'church') {
      return false;
    }

    return requiredPermissions.every((permission) =>
      hasEffectiveChurchPermission(
        permission,
        user.role,
        user.permissionOverrides,
        user.enabledFeatures,
      ),
    );
  }
}
