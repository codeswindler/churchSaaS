import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { hasChurchPermission, getSession } from '../services/api';

interface ChurchPermissionRouteProps {
  children: ReactNode;
  permission: string;
}

export function ChurchPermissionRoute({
  children,
  permission,
}: ChurchPermissionRouteProps) {
  const session = getSession();

  if (!hasChurchPermission(session?.user, permission)) {
    return <Navigate to="/church/access" replace />;
  }

  return <>{children}</>;
}
