import {
  ChurchPermission,
  normalizeChurchRole,
  resolveChurchPermissions,
} from './access-control';

describe('church access control', () => {
  it.each(['user', 'admin', 'treasurer', 'secretary', 'media', 'cashier'])(
    'normalizes %s to the canonical user role',
    (role) => {
      expect(normalizeChurchRole(role)).toBe('user');
    },
  );

  it('keeps church_admin compatible as Priest', () => {
    expect(normalizeChurchRole('church_admin')).toBe('priest');
  });

  it('allows User defaults to be removed and restored', () => {
    const denied = resolveChurchPermissions(
      'user',
      [],
      [ChurchPermission.MESSAGING_SEND],
    );
    const restored = resolveChurchPermissions('user', [], []);

    expect(denied).not.toContain(ChurchPermission.MESSAGING_SEND);
    expect(restored).toContain(ChurchPermission.MESSAGING_SEND);
  });

  it('never grants Priest-only permissions to User through overrides', () => {
    const permissions = resolveChurchPermissions(
      'user',
      [
        ChurchPermission.DASHBOARD_VIEW,
        ChurchPermission.CONTRIBUTIONS_VIEW,
        ChurchPermission.USERS_MANAGE,
      ],
      [],
    );

    expect(permissions).not.toContain(ChurchPermission.DASHBOARD_VIEW);
    expect(permissions).not.toContain(ChurchPermission.CONTRIBUTIONS_VIEW);
    expect(permissions).not.toContain(ChurchPermission.USERS_MANAGE);
    expect(permissions).toContain(ChurchPermission.USERS_VIEW);
  });

  it('keeps Priest permissions fixed despite denials', () => {
    const permissions = resolveChurchPermissions(
      'priest',
      [],
      [ChurchPermission.REPORTS_VIEW, ChurchPermission.USERS_MANAGE],
    );

    expect(permissions).toContain(ChurchPermission.REPORTS_VIEW);
    expect(permissions).toContain(ChurchPermission.USERS_MANAGE);
  });
});
