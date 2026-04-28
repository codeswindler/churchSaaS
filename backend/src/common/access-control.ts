export enum ChurchFeature {
  FINANCE = 'finance',
  FUND_ACCOUNTS = 'fund_accounts',
  MESSAGING = 'messaging',
  STAFF_MANAGEMENT = 'staff_management',
}

export enum ChurchPermission {
  DASHBOARD_VIEW = 'dashboard.view',
  CONTRIBUTIONS_VIEW = 'contributions.view',
  CONTRIBUTIONS_RECORD = 'contributions.record',
  REPORTS_VIEW = 'reports.view',
  REPORTS_EXPORT = 'reports.export',
  FUND_ACCOUNTS_VIEW = 'fundAccounts.view',
  FUND_ACCOUNTS_MANAGE = 'fundAccounts.manage',
  CONTRIBUTORS_VIEW = 'contributors.view',
  CONTRIBUTORS_TAG = 'contributors.tag',
  MESSAGING_VIEW = 'messaging.view',
  MESSAGING_SEND = 'messaging.send',
  OUTBOX_VIEW = 'outbox.view',
  USERS_VIEW = 'users.view',
  USERS_MANAGE = 'users.manage',
}

export const DEFAULT_CHURCH_FEATURES = [
  ChurchFeature.FINANCE,
  ChurchFeature.FUND_ACCOUNTS,
  ChurchFeature.MESSAGING,
  ChurchFeature.STAFF_MANAGEMENT,
];

export const ROLE_PERMISSION_PRESETS: Record<string, ChurchPermission[]> = {
  priest: Object.values(ChurchPermission),
  treasurer: [
    ChurchPermission.DASHBOARD_VIEW,
    ChurchPermission.CONTRIBUTIONS_VIEW,
    ChurchPermission.CONTRIBUTIONS_RECORD,
    ChurchPermission.REPORTS_VIEW,
    ChurchPermission.REPORTS_EXPORT,
    ChurchPermission.CONTRIBUTORS_VIEW,
    ChurchPermission.CONTRIBUTORS_TAG,
    ChurchPermission.OUTBOX_VIEW,
  ],
  secretary: [
    ChurchPermission.DASHBOARD_VIEW,
    ChurchPermission.FUND_ACCOUNTS_VIEW,
    ChurchPermission.FUND_ACCOUNTS_MANAGE,
    ChurchPermission.CONTRIBUTORS_VIEW,
    ChurchPermission.CONTRIBUTORS_TAG,
    ChurchPermission.MESSAGING_VIEW,
    ChurchPermission.MESSAGING_SEND,
    ChurchPermission.OUTBOX_VIEW,
  ],
};

export const PERMISSION_FEATURE_MAP: Record<ChurchPermission, ChurchFeature> = {
  [ChurchPermission.DASHBOARD_VIEW]: ChurchFeature.FINANCE,
  [ChurchPermission.CONTRIBUTIONS_VIEW]: ChurchFeature.FINANCE,
  [ChurchPermission.CONTRIBUTIONS_RECORD]: ChurchFeature.FINANCE,
  [ChurchPermission.REPORTS_VIEW]: ChurchFeature.FINANCE,
  [ChurchPermission.REPORTS_EXPORT]: ChurchFeature.FINANCE,
  [ChurchPermission.FUND_ACCOUNTS_VIEW]: ChurchFeature.FUND_ACCOUNTS,
  [ChurchPermission.FUND_ACCOUNTS_MANAGE]: ChurchFeature.FUND_ACCOUNTS,
  [ChurchPermission.CONTRIBUTORS_VIEW]: ChurchFeature.MESSAGING,
  [ChurchPermission.CONTRIBUTORS_TAG]: ChurchFeature.MESSAGING,
  [ChurchPermission.MESSAGING_VIEW]: ChurchFeature.MESSAGING,
  [ChurchPermission.MESSAGING_SEND]: ChurchFeature.MESSAGING,
  [ChurchPermission.OUTBOX_VIEW]: ChurchFeature.MESSAGING,
  [ChurchPermission.USERS_VIEW]: ChurchFeature.STAFF_MANAGEMENT,
  [ChurchPermission.USERS_MANAGE]: ChurchFeature.STAFF_MANAGEMENT,
};

export function normalizeChurchRole(role?: string | null) {
  if (role === 'church_admin') return 'priest';
  if (role === 'cashier') return 'treasurer';
  if (role === 'priest' || role === 'treasurer' || role === 'secretary') {
    return role;
  }
  return 'treasurer';
}

export function normalizeFeatureList(features?: string[] | null) {
  const valid = new Set(Object.values(ChurchFeature));
  const normalized = (features || []).filter((feature) =>
    valid.has(feature as ChurchFeature),
  ) as ChurchFeature[];

  return normalized.length > 0 ? normalized : DEFAULT_CHURCH_FEATURES;
}

export function resolveChurchPermissions(
  role?: string | null,
  overrides?: string[] | null,
) {
  const preset = ROLE_PERMISSION_PRESETS[normalizeChurchRole(role)] || [];
  const valid = new Set(Object.values(ChurchPermission));
  const resolved = new Set<ChurchPermission>(preset);

  (overrides || []).forEach((permission) => {
    if (valid.has(permission as ChurchPermission)) {
      resolved.add(permission as ChurchPermission);
    }
  });

  return [...resolved];
}

export function hasEffectiveChurchPermission(
  permission: ChurchPermission,
  role?: string | null,
  permissionOverrides?: string[] | null,
  enabledFeatures?: string[] | null,
) {
  const permissions = resolveChurchPermissions(role, permissionOverrides);
  const features = normalizeFeatureList(enabledFeatures);
  const requiredFeature = PERMISSION_FEATURE_MAP[permission];
  if (permission === ChurchPermission.DASHBOARD_VIEW) {
    return permissions.includes(permission) && features.length > 0;
  }

  return permissions.includes(permission) && features.includes(requiredFeature);
}
