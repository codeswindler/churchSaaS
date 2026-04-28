import { SetMetadata } from '@nestjs/common';
import { ChurchPermission } from '../common/access-control';

export const PERMISSIONS_KEY = 'church_permissions';
export const Permissions = (...permissions: ChurchPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
