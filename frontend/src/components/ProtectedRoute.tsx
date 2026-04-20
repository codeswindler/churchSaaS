import { Navigate } from 'react-router-dom';
import { getPortalPath, getSession } from '../services/api';

interface ProtectedRouteProps {
  userType: 'platform' | 'church';
  children: React.ReactNode;
}

export function ProtectedRoute({
  userType,
  children,
}: ProtectedRouteProps) {
  const session = getSession();

  if (!session?.user) {
    return <Navigate to="/" replace />;
  }

  if (session.user.userType !== userType) {
    return <Navigate to={getPortalPath(session.user)} replace />;
  }

  return <>{children}</>;
}
