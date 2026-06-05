import { Navigate, Route, Routes } from 'react-router-dom';
import { ChurchPermissionRoute } from './components/ChurchPermissionRoute';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './layouts/AppShell';
import ChurchSignup from './pages/auth/ChurchSignup';
import Login from './pages/auth/Login';
import ChurchContributions from './pages/church/Contributions';
import ChurchCongregation from './pages/church/Congregation';
import ChurchDashboard from './pages/church/Dashboard';
import ChurchFundAccounts from './pages/church/FundAccounts';
import ChurchMessaging from './pages/church/Messaging';
import ChurchPresentation from './pages/church/Presentation';
import ChurchReports from './pages/church/Reports';
import ChurchUsers from './pages/church/Users';
import PresentationDisplay from './pages/display/PresentationDisplay';
import PlatformChurches from './pages/platform/Churches';
import PlatformCollections from './pages/platform/Collections';
import PlatformDashboard from './pages/platform/Dashboard';
import PlatformEnquiries from './pages/platform/Enquiries';
import PlatformMessaging from './pages/platform/Messaging';
import PlatformUsers from './pages/platform/Users';
import PublicCongregation from './pages/public/Congregation';
import PublicGive from './pages/public/Give';
import { getPortalPath, getSession } from './services/api';

function PublicEntry() {
  const session = getSession();

  if (session?.user) {
    return <Navigate to={getPortalPath(session.user)} replace />;
  }

  return <Login />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicEntry />} />
      <Route path="/login" element={<PublicEntry />} />
      <Route path="/signup" element={<ChurchSignup />} />
      <Route path="/c/:slug" element={<PublicCongregation />} />
      <Route path="/c/:slug/give" element={<PublicGive />} />
      <Route path="/display/church-presentation" element={<PresentationDisplay />} />

      <Route
        path="/platform"
        element={
          <ProtectedRoute userType="platform">
            <AppShell userType="platform" />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<PlatformDashboard />} />
        <Route path="churches" element={<PlatformChurches />} />
        <Route path="collections" element={<PlatformCollections />} />
        <Route path="messaging" element={<PlatformMessaging />} />
        <Route path="enquiries" element={<PlatformEnquiries />} />
        <Route path="users" element={<PlatformUsers />} />
        <Route index element={<Navigate to="/platform/dashboard" replace />} />
      </Route>

      <Route
        path="/church"
        element={
          <ProtectedRoute userType="church">
            <AppShell userType="church" />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<ChurchDashboard />} />
        <Route path="fund-accounts" element={<ChurchFundAccounts />} />
        <Route path="contributions" element={<ChurchContributions />} />
        <Route path="congregation" element={<ChurchCongregation />} />
        <Route path="messaging" element={<ChurchMessaging />} />
        <Route path="users" element={<ChurchUsers />} />
        <Route path="reports" element={<ChurchReports />} />
        <Route
          path="presentation"
          element={
            <ChurchPermissionRoute permission="presentation.manage">
              <ChurchPresentation />
            </ChurchPermissionRoute>
          }
        />
        <Route index element={<Navigate to="/church/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
