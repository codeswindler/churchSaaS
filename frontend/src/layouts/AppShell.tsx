import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ChartColumn,
  Clock4,
  Coins,
  Landmark,
  LogOut,
  Menu,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  UserCircle2,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CountdownBadge } from '../components/CountdownBadge';
import api, {
  clearSession,
  getSession,
  updateSessionProfile,
} from '../services/api';

interface AppShellProps {
  userType: 'platform' | 'church';
}

const THEME_STORAGE_KEY = 'church_saas_theme';
const COLOR_MODE_STORAGE_KEY = 'church_saas_color_mode';

const platformLinks = [
  { to: '/platform/dashboard', label: 'Overview', icon: Landmark },
  { to: '/platform/churches', label: 'Churches', icon: Building2 },
  { to: '/platform/users', label: 'Platform Users', icon: Users },
];

const churchLinks = [
  { to: '/church/dashboard', label: 'Overview', icon: ChartColumn },
  { to: '/church/fund-accounts', label: 'Fund Accounts', icon: Coins },
  { to: '/church/contributions', label: 'Contributions', icon: Clock4 },
  { to: '/church/users', label: 'Staff Users', icon: Users },
  { to: '/church/reports', label: 'Reports', icon: ShieldCheck },
];

const themeOptions = [
  { value: 'forest', label: 'Forest' },
  { value: 'sand', label: 'Sandstone' },
  { value: 'midnight', label: 'Midnight' },
];

const pageMeta = {
  platform: [
    {
      prefix: '/platform/dashboard',
      title: 'Customer church operations',
      eyebrow: 'Business System',
      variant: 'hero',
    },
    { prefix: '/platform/churches', title: 'Churches', variant: 'compact' },
    {
      prefix: '/platform/users',
      title: 'Platform users',
      variant: 'compact',
    },
  ],
  church: [
    {
      prefix: '/church/dashboard',
      title: 'Church finance operations',
      eyebrow: 'Business System',
      variant: 'hero',
    },
    {
      prefix: '/church/fund-accounts',
      title: 'Fund accounts',
      variant: 'compact',
    },
    {
      prefix: '/church/contributions',
      title: 'Contributions',
      variant: 'compact',
    },
    { prefix: '/church/users', title: 'Staff users', variant: 'compact' },
    { prefix: '/church/reports', title: 'Reports', variant: 'compact' },
  ],
} as const;

function resolvePageMeta(pathname: string, userType: 'platform' | 'church') {
  return (
    pageMeta[userType].find((item) => pathname.startsWith(item.prefix)) ||
    pageMeta[userType][0]
  );
}

function getInitials(name?: string | null) {
  const parts = `${name || 'User'}`
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || 'U';
}

export function AppShell({ userType }: AppShellProps) {
  const session = getSession();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const links = userType === 'platform' ? platformLinks : churchLinks;
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'forest';
  });
  const [colorMode, setColorMode] = useState(() => {
    return localStorage.getItem(COLOR_MODE_STORAGE_KEY) || 'dark';
  });
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    username: '',
    phone: '',
    password: '',
  });

  const { data: profile } = useQuery({
    queryKey: ['auth-profile'],
    queryFn: () => api.get('/auth/profile').then((response) => response.data),
  });

  const { data: subscription } = useQuery({
    queryKey: ['church-subscription-header'],
    queryFn: () =>
      api.get('/church/subscription/status').then((response) => response.data),
    enabled: userType === 'church',
    refetchInterval: 15_000,
  });

  const currentUser = profile || session?.user;
  const organizationName =
    userType === 'platform'
      ? 'Choice Networks Church SaaS'
      : profile?.church?.name || session?.church?.name || 'Church Workspace';
  const currentPage = useMemo(
    () => resolvePageMeta(location.pathname, userType),
    [location.pathname, userType],
  );
  const isOverviewPage = currentPage.variant === 'hero';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.colorMode = colorMode;
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, colorMode);
  }, [colorMode]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    setProfileForm({
      name: currentUser.name || '',
      email: currentUser.email || '',
      username: currentUser.username || '',
      phone: currentUser.phone || '',
      password: '',
    });
  }, [
    currentUser?.email,
    currentUser?.name,
    currentUser?.phone,
    currentUser?.username,
  ]);

  useEffect(() => {
    if (!isProfileOpen && !isNavOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isNavOpen, isProfileOpen]);

  useEffect(() => {
    setIsNavOpen(false);
  }, [location.pathname]);

  const profileMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string | null> = {
        name: profileForm.name,
        email: profileForm.email,
        username: profileForm.username || null,
        phone: profileForm.phone || null,
      };

      if (profileForm.password.trim()) {
        payload.password = profileForm.password.trim();
      }

      const response = await api.patch('/auth/profile', payload);
      return response.data;
    },
    onSuccess: (data) => {
      updateSessionProfile(data);
      queryClient.setQueryData(['auth-profile'], data);
      if (userType === 'church' && data.subscription) {
        queryClient.setQueryData(['church-subscription-header'], data.subscription);
      }
      toast.success('Profile updated');
      setIsProfileOpen(false);
      setProfileForm((current) => ({ ...current, password: '' }));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to update profile');
    },
  });

  const handleLogout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  const activeThemeLabel =
    themeOptions.find((option) => option.value === theme)?.label || 'Theme';
  const cycleTheme = () => {
    const currentIndex = themeOptions.findIndex((option) => option.value === theme);
    const nextTheme =
      themeOptions[(currentIndex + 1 + themeOptions.length) % themeOptions.length];
    setTheme(nextTheme.value);
  };
  const toggleColorMode = () => {
    setColorMode((current) => (current === 'light' ? 'dark' : 'light'));
  };
  const isLightMode = colorMode === 'light';

  const sidebarIntro = (
    <div className="space-y-4">
      <div className="sidebar-header-row">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
          {userType === 'platform' ? 'Platform Admin' : 'Church Console'}
        </p>
        <div className="sidebar-header-actions">
          <button
            aria-label={`Change theme. Current theme is ${activeThemeLabel}`}
            className="shell-icon-button shell-icon-button-sm"
            title={`Theme: ${activeThemeLabel}`}
            type="button"
            onClick={cycleTheme}
          >
            <Palette size={14} />
          </button>

          <button
            aria-label={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            className="shell-icon-button shell-icon-button-sm"
            title={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            type="button"
            onClick={toggleColorMode}
          >
            {isLightMode ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>
      </div>
      <h1 className="mt-2 text-2xl font-semibold text-white">
        {organizationName}
      </h1>
    </div>
  );

  const sidebarProfileButton = (
    <button
      className="sidebar-profile-button"
      type="button"
      onClick={() => setIsProfileOpen(true)}
    >
      <span className="profile-avatar">{getInitials(currentUser?.name)}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-white">
          {currentUser?.name || 'User'}
        </span>
        <span className="block truncate text-xs text-stone-400">
          {currentUser?.role?.replace(/_/g, ' ') || 'Account'}
        </span>
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
        Edit
      </span>
    </button>
  );

  const sidebarNavigation = (
    <nav className="space-y-2">
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
              isActive
                ? 'bg-amber-200/15 text-white ring-1 ring-amber-200/30'
                : 'text-stone-300 hover:bg-white/5 hover:text-white'
            }`
          }
          onClick={() => setIsNavOpen(false)}
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  const sidebarLogoutButton = (
    <button
      className="sidebar-logout-button"
      aria-label="Log out"
      title="Log out"
      type="button"
      onClick={() => {
        setIsNavOpen(false);
        handleLogout();
      }}
    >
      <LogOut size={18} />
    </button>
  );

  const sidebarFooter = (
    <div className="mt-auto flex justify-end">{sidebarLogoutButton}</div>
  );

  return (
    <div className="app-shell-background min-h-screen text-stone-50">
      <div className="mx-auto grid min-h-screen max-w-[1960px] gap-7 px-4 py-4 lg:grid-cols-[276px_minmax(0,1fr)] xl:px-8 2xl:px-10">
        <aside className="panel hidden flex-col gap-5 p-6 lg:flex">
          {sidebarIntro}
          {sidebarProfileButton}
          {sidebarNavigation}
          {sidebarFooter}
        </aside>

        <main className="min-w-0 space-y-6">
          <div className="mobile-shell-bar lg:hidden">
            <button
              aria-label="Open navigation menu"
              className="shell-icon-button"
              type="button"
              onClick={() => setIsNavOpen(true)}
            >
              <Menu size={18} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-stone-400">
                {userType === 'platform' ? 'Platform Admin' : 'Church Console'}
              </p>
              <div className="mt-1 truncate text-base font-semibold text-white">
                {organizationName}
              </div>
            </div>
          </div>

          {isOverviewPage ? (
            <header className="panel shell-hero">
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-stone-400">
                  {currentPage.eyebrow}
                </p>
                <h2 className="mt-3 text-3xl font-semibold text-white">
                  {currentPage.title}
                </h2>
              </div>

              {userType === 'church' && subscription ? (
                <CountdownBadge
                  status={subscription.status}
                  expiresAt={subscription.expiresAt}
                  graceEndsAt={subscription.graceEndsAt}
                  label={subscription.countdown?.label}
                />
              ) : null}
            </header>
          ) : (
            <div className="shell-toolbar">
              <div className="shell-toolbar-chip">{currentPage.title}</div>
            </div>
          )}

          <Outlet />
        </main>
      </div>

      {isNavOpen ? (
        <div
          className="mobile-nav-backdrop lg:hidden"
          role="presentation"
          onClick={() => setIsNavOpen(false)}
        >
          <aside
            className="panel mobile-nav-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full flex-col gap-5">
              {sidebarIntro}
              <div className="mobile-drawer-user">
                {sidebarProfileButton}
              </div>
              {sidebarNavigation}
              {sidebarFooter}
            </div>
          </aside>
        </div>
      ) : null}

      {isProfileOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsProfileOpen(false)}
        >
          <div className="modal-shell">
            <section
              aria-labelledby="profile-settings-title"
              aria-modal="true"
              className="panel modal-card p-6 sm:p-7"
              role="dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Profile
                  </p>
                  <h3
                    id="profile-settings-title"
                    className="mt-2 text-2xl font-semibold text-white"
                  >
                    Manage your account
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-stone-300">
                    Update your personal details, login preferences, and sign out
                    from one place.
                  </p>
                </div>

              </div>

              <form
                className="mt-6 grid gap-4 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  profileMutation.mutate();
                }}
              >
                <div>
                  <label className="label">Full name</label>
                  <input
                    className="input"
                    value={profileForm.name}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="label">Email</label>
                  <input
                    className="input"
                    type="email"
                    value={profileForm.email}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="label">Username</label>
                  <input
                    className="input"
                    value={profileForm.username}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="label">Phone number</label>
                  <input
                    className="input"
                    value={profileForm.phone}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="label">New password</label>
                  <input
                    className="input"
                    placeholder="Leave blank to keep current password"
                    type="password"
                    value={profileForm.password}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row">
                  <button
                    className="btn-secondary justify-center sm:flex-1"
                    type="button"
                    onClick={() => setIsProfileOpen(false)}
                  >
                    Close
                  </button>
                  <button
                    className="btn-danger justify-center sm:flex-1"
                    type="button"
                    onClick={handleLogout}
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                  <button
                    className="btn-primary justify-center sm:flex-1"
                    type="submit"
                  >
                    <UserCircle2 size={16} />
                    {profileMutation.isPending ? 'Saving...' : 'Save profile'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
