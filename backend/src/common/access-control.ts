export enum ChurchFeature {
  FINANCE = 'finance',
  FUND_ACCOUNTS = 'fund_accounts',
  MESSAGING = 'messaging',
  STAFF_MANAGEMENT = 'staff_management',
  DISCIPLESHIP = 'discipleship',
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
  CONGREGATION_PAGE_MANAGE = 'congregation.manage',
  PRESENTATION_MANAGE = 'presentation.manage',
  USERS_VIEW = 'users.view',
  USERS_MANAGE = 'users.manage',
  DISCIPLESHIP_VIEW = 'discipleship.view',
  DISCIPLESHIP_MANAGE = 'discipleship.manage',
  DISCIPLESHIP_ATTENDANCE_RECORD = 'discipleship.attendanceRecord',
}

export const DEFAULT_CHURCH_FEATURES = [
  ChurchFeature.FINANCE,
  ChurchFeature.FUND_ACCOUNTS,
  ChurchFeature.MESSAGING,
  ChurchFeature.STAFF_MANAGEMENT,
  ChurchFeature.DISCIPLESHIP,
];

export const FINANCIAL_CHURCH_PERMISSIONS = new Set<ChurchPermission>([
  ChurchPermission.DASHBOARD_VIEW,
  ChurchPermission.CONTRIBUTIONS_VIEW,
  ChurchPermission.CONTRIBUTIONS_RECORD,
  ChurchPermission.REPORTS_VIEW,
  ChurchPermission.REPORTS_EXPORT,
]);

export const PRIEST_ONLY_CHURCH_PERMISSIONS = new Set<ChurchPermission>([
  ...FINANCIAL_CHURCH_PERMISSIONS,
  ChurchPermission.USERS_MANAGE,
]);

const userPermissions = Object.values(ChurchPermission).filter(
  (permission) => !PRIEST_ONLY_CHURCH_PERMISSIONS.has(permission),
);

export const ROLE_PERMISSION_PRESETS: Record<string, ChurchPermission[]> = {
  priest: Object.values(ChurchPermission),
  user: userPermissions,
  admin: userPermissions,
};

export const PERMISSION_FEATURE_MAP: Record<
  ChurchPermission,
  ChurchFeature | null
> = {
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
  [ChurchPermission.CONGREGATION_PAGE_MANAGE]: ChurchFeature.MESSAGING,
  [ChurchPermission.PRESENTATION_MANAGE]: null,
  [ChurchPermission.USERS_VIEW]: ChurchFeature.STAFF_MANAGEMENT,
  [ChurchPermission.USERS_MANAGE]: ChurchFeature.STAFF_MANAGEMENT,
  [ChurchPermission.DISCIPLESHIP_VIEW]: ChurchFeature.DISCIPLESHIP,
  [ChurchPermission.DISCIPLESHIP_MANAGE]: ChurchFeature.DISCIPLESHIP,
  [ChurchPermission.DISCIPLESHIP_ATTENDANCE_RECORD]: ChurchFeature.DISCIPLESHIP,
};

export function normalizeChurchRole(role?: string | null) {
  if (role === 'church_admin') return 'priest';
  if (role === 'priest') return 'priest';
  if (
    role === 'user' ||
    role === 'admin' ||
    role === 'treasurer' ||
    role === 'secretary' ||
    role === 'media' ||
    role === 'cashier'
  ) {
    return 'user';
  }
  return 'user';
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
  denials?: string[] | null,
) {
  const normalizedRole = normalizeChurchRole(role);
  const preset = ROLE_PERMISSION_PRESETS[normalizedRole] || [];
  const valid = new Set(Object.values(ChurchPermission));
  const resolved = new Set<ChurchPermission>(preset);

  if (normalizedRole === 'priest') {
    return [...resolved];
  }

  (overrides || []).forEach((permission) => {
    if (
      valid.has(permission as ChurchPermission) &&
      !PRIEST_ONLY_CHURCH_PERMISSIONS.has(permission as ChurchPermission)
    ) {
      resolved.add(permission as ChurchPermission);
    }
  });

  (denials || []).forEach((permission) => {
    if (valid.has(permission as ChurchPermission)) {
      resolved.delete(permission as ChurchPermission);
    }
  });
  PRIEST_ONLY_CHURCH_PERMISSIONS.forEach((permission) =>
    resolved.delete(permission),
  );

  return [...resolved];
}

export function hasEffectiveChurchPermission(
  permission: ChurchPermission,
  role?: string | null,
  permissionOverrides?: string[] | null,
  permissionDenials?: string[] | null,
  enabledFeatures?: string[] | null,
) {
  const permissions = resolveChurchPermissions(
    role,
    permissionOverrides,
    permissionDenials,
  );
  const features = normalizeFeatureList(enabledFeatures);
  const requiredFeature = PERMISSION_FEATURE_MAP[permission];
  if (permission === ChurchPermission.DASHBOARD_VIEW) {
    return permissions.includes(permission) && features.length > 0;
  }
  if (!requiredFeature) {
    return permissions.includes(permission);
  }

  return permissions.includes(permission) && features.includes(requiredFeature);
}
