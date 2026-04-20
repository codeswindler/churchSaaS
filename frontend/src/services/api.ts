import axios from 'axios';

const STORAGE_KEY = 'church_saas_session';

export interface StoredSession {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    username?: string | null;
    phone?: string | null;
    role: string;
    userType: 'platform' | 'church';
    churchId?: string;
  };
  church?: any;
  subscription?: any;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const session = getSession();
  if (session?.accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearSession();
    }
    return Promise.reject(error);
  },
);

export function getSession(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function getPortalPath(
  user?: StoredSession['user'] | null,
  fallback = '/',
) {
  if (!user) {
    return fallback;
  }

  return user.userType === 'platform'
    ? '/platform/dashboard'
    : '/church/dashboard';
}

export function saveSession(payload: any) {
  const session: StoredSession = {
    accessToken: payload.access_token,
    user: payload.user,
    church: payload.church,
    subscription: payload.subscription,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function updateSessionProfile(profile: any) {
  const session = getSession();
  if (!session) {
    return null;
  }

  const nextSession: StoredSession = {
    ...session,
    user: {
      ...session.user,
      name: profile.name,
      email: profile.email,
      username: profile.username ?? null,
      phone: profile.phone ?? null,
      role: profile.role || session.user.role,
      userType: profile.userType || session.user.userType,
      ...(profile.churchId ? { churchId: profile.churchId } : {}),
    },
    church: profile.church || session.church,
    subscription: profile.subscription || session.subscription,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
  return nextSession;
}

export default api;
