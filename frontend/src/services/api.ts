import axios from "axios";

const STORAGE_KEY = "church_saas_session";

export interface StoredSession {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    username?: string | null;
    phone?: string | null;
    role: string;
    userType: "platform" | "church";
    churchId?: string;
    enabledFeatures?: string[];
    permissionOverrides?: string[];
    permissionDenials?: string[];
    permissions?: string[];
  };
  church?: any;
  subscription?: any;
}

const rolePermissionPresets: Record<string, string[]> = {
  priest: [
    "dashboard.view",
    "contributions.view",
    "contributions.record",
    "reports.view",
    "reports.export",
    "fundAccounts.view",
    "fundAccounts.manage",
    "contributors.view",
    "contributors.tag",
    "messaging.view",
    "messaging.send",
    "outbox.view",
    "congregation.manage",
    "presentation.manage",
    "users.view",
    "users.manage",
    "discipleship.view",
    "discipleship.manage",
    "discipleship.attendanceRecord",
  ],
  user: [
    "fundAccounts.view",
    "fundAccounts.manage",
    "contributors.view",
    "contributors.tag",
    "messaging.view",
    "messaging.send",
    "outbox.view",
    "congregation.manage",
    "presentation.manage",
    "users.view",
    "discipleship.view",
    "discipleship.manage",
    "discipleship.attendanceRecord",
  ],
};

const financialPermissions = new Set([
  "dashboard.view",
  "contributions.view",
  "contributions.record",
  "reports.view",
  "reports.export",
]);
const priestOnlyPermissions = new Set([
  ...financialPermissions,
  "users.manage",
]);

const permissionFeatureMap: Record<string, string | null> = {
  "dashboard.view": "finance",
  "contributions.view": "finance",
  "contributions.record": "finance",
  "reports.view": "finance",
  "reports.export": "finance",
  "fundAccounts.view": "fund_accounts",
  "fundAccounts.manage": "fund_accounts",
  "contributors.view": "messaging",
  "contributors.tag": "messaging",
  "messaging.view": "messaging",
  "messaging.send": "messaging",
  "outbox.view": "messaging",
  "congregation.manage": "messaging",
  "presentation.manage": null,
  "users.view": "staff_management",
  "users.manage": "staff_management",
  "discipleship.view": "discipleship",
  "discipleship.manage": "discipleship",
  "discipleship.attendanceRecord": "discipleship",
};

function normalizeChurchRole(role?: string | null) {
  if (role === "church_admin") return "priest";
  if (role === "priest") return "priest";
  if (
    role === "user" ||
    role === "admin" ||
    role === "treasurer" ||
    role === "secretary" ||
    role === "media" ||
    role === "cashier"
  ) {
    return "user";
  }
  return "user";
}

export function getChurchUserPermissions(user?: StoredSession["user"] | null) {
  if (!user || user.userType !== "church") {
    return [];
  }

  const normalizedRole = normalizeChurchRole(user.role);
  const denials = new Set(user.permissionDenials || []);
  const permissions = Array.isArray(user.permissions)
    ? [...user.permissions]
    : Array.from(
        new Set([
          ...(rolePermissionPresets[normalizedRole] || []),
          ...(user.permissionOverrides || []),
        ]),
      ).filter((permission) => !denials.has(permission));
  const enabledFeatures = new Set(user.enabledFeatures || []);

  return permissions.filter((permission) => {
    if (normalizedRole !== "priest" && priestOnlyPermissions.has(permission)) {
      return false;
    }
    const requiredFeature = permissionFeatureMap[permission];
    return (
      !requiredFeature ||
      enabledFeatures.size === 0 ||
      enabledFeatures.has(requiredFeature)
    );
  });
}

export function hasChurchPermission(
  user: StoredSession["user"] | null | undefined,
  permission: string,
) {
  return getChurchUserPermissions(user).includes(permission);
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: {
    "Content-Type": "application/json",
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
  user?: StoredSession["user"] | null,
  fallback = "/",
) {
  if (!user) {
    return fallback;
  }

  if (user.userType === "platform") {
    return "/platform/dashboard";
  }

  const permissions = new Set(getChurchUserPermissions(user));
  if (permissions.has("dashboard.view")) {
    return "/church/dashboard";
  }
  if (permissions.has("discipleship.view")) {
    return "/church/discipleship";
  }
  if (permissions.has("messaging.view")) {
    return "/church/messaging";
  }
  if (permissions.has("presentation.manage")) {
    return "/church/presentation";
  }
  if (permissions.has("fundAccounts.view")) {
    return "/church/fund-accounts";
  }
  if (permissions.has("contributions.view")) {
    return "/church/contributions";
  }
  if (permissions.has("users.view")) {
    return "/church/users";
  }
  if (permissions.has("reports.view")) {
    return "/church/reports";
  }

  return "/church/access";
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
      enabledFeatures: profile.enabledFeatures ?? session.user.enabledFeatures,
      permissionOverrides:
        profile.permissionOverrides ?? session.user.permissionOverrides,
      permissionDenials:
        profile.permissionDenials ?? session.user.permissionDenials,
      permissions: profile.permissions ?? session.user.permissions,
      ...(profile.churchId ? { churchId: profile.churchId } : {}),
    },
    church: profile.church || session.church,
    subscription: profile.subscription || session.subscription,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
  return nextSession;
}

export default api;
