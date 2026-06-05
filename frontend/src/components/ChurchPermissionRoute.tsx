import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getPortalPath, getSession } from '../services/api';

interface ChurchPermissionRouteProps {
  children: ReactNode;
  permission: string;
}

export function ChurchPermissionRoute({
  children,
  permission,
}: ChurchPermissionRouteProps) {
  const session = getSession();
  const permissions = session?.user?.permissions || [];

  if (permissions.length > 0 && !permissions.includes(permission)) {
    return <Navigate to={getPortalPath(session?.user)} replace />;
  }

  return <>{children}</>;
}
