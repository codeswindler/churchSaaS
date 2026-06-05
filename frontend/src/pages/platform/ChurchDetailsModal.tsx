import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Mail,
  MessageSquareText,
  PencilLine,
  Phone,
  Send,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

export type PlatformChurchDetailsTab = 'overview' | 'users';

interface PlatformChurchDetailsModalProps {
  churchId: string | null;
  church?: any;
  initialTab: PlatformChurchDetailsTab;
  onClose: () => void;
  onEdit: (churchId: string) => void;
}

const roleOptions = [
  {
    value: 'priest',
    label: 'Priest',
    description: 'Full administrative access across enabled church modules.',
  },
  {
    value: 'treasurer',
    label: 'Treasurer',
    description: 'Receiving and managing contributions, reports, and ledger.',
  },
  {
    value: 'secretary',
    label: 'Secretary',
    description: 'Bulk messaging, contributors, and fund account setup.',
  },
  {
    value: 'media',
    label: 'Media',
    description: 'Presentation control for screens and worship slides.',
  },
];

const permissionOptions = [
  ['dashboard.view', 'Dashboard'],
  ['contributions.view', 'View contributions'],
  ['contributions.record', 'Record contributions'],
  ['reports.view', 'View reports'],
  ['reports.export', 'Export reports'],
  ['fundAccounts.view', 'View fund accounts'],
  ['fundAccounts.manage', 'Manage fund accounts'],
  ['contributors.view', 'View contributors'],
  ['contributors.tag', 'Tag contributor gender'],
  ['messaging.view', 'View messaging'],
  ['messaging.send', 'Send bulk messages'],
  ['outbox.view', 'View outbox'],
  ['congregation.manage', 'Manage sermons & announcements'],
  ['presentation.manage', 'Manage presentation'],
  ['users.view', 'View staff users'],
  ['users.manage', 'Manage staff users'],
] as const;

const rolePermissionPresets: Record<string, string[]> = {
  priest: permissionOptions.map(([value]) => value),
  treasurer: [
    'dashboard.view',
    'contributions.view',
    'contributions.record',
    'reports.view',
    'reports.export',
    'contributors.view',
    'contributors.tag',
    'outbox.view',
  ],
  secretary: [
    'dashboard.view',
    'fundAccounts.view',
    'fundAccounts.manage',
    'contributors.view',
    'contributors.tag',
    'messaging.view',
    'messaging.send',
    'outbox.view',
    'congregation.manage',
  ],
  media: ['presentation.manage'],
};

function createInitialStaffForm() {
  return {
    name: '',
    email: '',
    username: '',
    phone: '',
    password: '',
    role: 'treasurer',
    permissionOverrides: [] as string[],
    isActive: true,
  };
}

type StaffFormState = ReturnType<typeof createInitialStaffForm>;

export default function ChurchDetailsModal({
  churchId,
  church: churchSnapshot,
  initialTab,
  onClose,
  onEdit,
}: PlatformChurchDetailsModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] =
    useState<PlatformChurchDetailsTab>(initialTab);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isUserEditorOpen, setIsUserEditorOpen] = useState(false);
  const [staffForm, setStaffForm] = useState<StaffFormState>(() =>
    createInitialStaffForm(),
  );
  const staffNameInputRef = useRef<HTMLInputElement | null>(null);

  const resetStaffEditor = () => {
    setEditingUserId(null);
    setStaffForm(createInitialStaffForm());
    setIsUserEditorOpen(false);
  };

  const { data: churchDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['platform-church-details', churchId],
    queryFn: () =>
      api
        .get(`/platform/churches/${churchId}`)
        .then((response) => response.data),
    enabled: Boolean(churchId),
  });

  const { data: staffUsers, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['platform-church-users', churchId],
    queryFn: () =>
      api
        .get(`/platform/churches/${churchId}/users`)
        .then((response) => response.data),
    enabled: Boolean(churchId),
  });

  const saveUserMutation = useMutation({
    mutationFn: async () => {
      if (!churchId) {
        throw new Error('Church is required');
      }

      if (editingUserId) {
        const response = await api.patch(
          `/platform/churches/${churchId}/users/${editingUserId}`,
          staffForm,
        );
        return response.data;
      }

      const response = await api.post(
        `/platform/churches/${churchId}/users`,
        staffForm,
      );
      return response.data;
    },
    onSuccess: () => {
      toast.success(editingUserId ? 'Church user updated' : 'Church user created');
      resetStaffEditor();
      queryClient.invalidateQueries({
        queryKey: ['platform-church-users', churchId],
      });
      queryClient.invalidateQueries({
        queryKey: ['platform-church-details', churchId],
      });
      queryClient.invalidateQueries({ queryKey: ['platform-churches'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to save user');
    },
  });

  const resendCredentialsMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!churchId) {
        throw new Error('Church is required');
      }
      const response = await api.post(
        `/platform/churches/${churchId}/users/${userId}/resend-credentials`,
      );
      return response.data;
    },
    onSuccess: () => {
      toast.success('Login credentials sent by SMS');
      queryClient.invalidateQueries({
        queryKey: ['platform-church-users', churchId],
      });
      queryClient.invalidateQueries({
        queryKey: ['platform-messaging-outbox'],
      });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to send credentials SMS',
      );
    },
  });

  const church = useMemo(
    () => ({
      ...(churchSnapshot || {}),
      ...(churchDetails || {}),
    }),
    [churchDetails, churchSnapshot],
  );

  const users = Array.isArray(staffUsers) ? staffUsers : [];
  const userCount = Array.isArray(staffUsers)
    ? staffUsers.length
    : church?.userCount || 0;
  const publicPath = church?.slug ? `/c/${church.slug}` : '';
  const publicUrl =
    typeof window !== 'undefined' && publicPath
      ? `${window.location.origin}${publicPath}`
      : publicPath;
  const givingPath = church?.slug ? `/c/${church.slug}/give` : '';

  useEffect(() => {
    if (!churchId) {
      return;
    }

    setActiveTab(initialTab);
    resetStaffEditor();
  }, [churchId, initialTab]);

  useEffect(() => {
    if (!churchId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saveUserMutation.isPending) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [churchId, onClose, saveUserMutation.isPending]);

  useEffect(() => {
    if (!isUserEditorOpen) {
      return;
    }

    const focusTimer = window.requestAnimationFrame(() => {
      staffNameInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(focusTimer);
  }, [isUserEditorOpen]);

  if (!churchId) {
    return null;
  }

  const closeModal = () => {
    if (saveUserMutation.isPending) {
      return;
    }

    onClose();
  };

  const openCreateUser = () => {
    setEditingUserId(null);
    setStaffForm(createInitialStaffForm());
    setIsUserEditorOpen(true);
    setActiveTab('users');
  };

  const openEditUser = (user: any) => {
    setEditingUserId(user.id);
    setStaffForm({
      name: user.name || '',
      email: user.email || '',
      username: user.username || '',
      phone: user.phone || '',
      password: '',
      role: user.role || 'treasurer',
      permissionOverrides: user.permissionOverrides || [],
      isActive: user.isActive ?? true,
    });
    setIsUserEditorOpen(true);
    setActiveTab('users');
  };

  const changeRole = (role: string) => {
    const roleDefaults = rolePermissionPresets[role] || [];
    setStaffForm((current) => ({
      ...current,
      role,
      permissionOverrides: current.permissionOverrides.filter(
        (permission) => !roleDefaults.includes(permission),
      ),
    }));
  };

  const togglePermission = (permission: string) => {
    setStaffForm((current) => {
      if (rolePermissionPresets[current.role]?.includes(permission)) {
        return current;
      }

      const permissions = new Set(current.permissionOverrides || []);
      if (permissions.has(permission)) {
        permissions.delete(permission);
      } else {
        permissions.add(permission);
      }
      return {
        ...current,
        permissionOverrides: Array.from(permissions),
      };
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={closeModal}>
      <div className="modal-shell">
        <section
          aria-labelledby="church-details-title"
          aria-modal="true"
          className="panel modal-card church-details-modal-card p-4 sm:p-5"
          role="dialog"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Church Customer
              </p>
              <h3
                id="church-details-title"
                className="mt-2 text-2xl font-semibold text-white"
              >
                {church?.name || 'Church details'}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <span className="badge border-white/10 bg-white/5 text-stone-100">
                  {church?.status || 'unknown'}
                </span>
                {church?.slug ? (
                  <span className="badge border-white/10 bg-white/5 text-stone-100">
                    /c/{church.slug}
                  </span>
                ) : null}
                <span className="badge border-white/10 bg-white/5 text-stone-100">
                  {userCount} users
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary px-3 py-2"
                type="button"
                onClick={() => onEdit(churchId)}
              >
                <PencilLine size={14} />
                Edit settings
              </button>
              <button
                className="btn-primary px-3 py-2"
                type="button"
                onClick={openCreateUser}
              >
                <UserPlus size={14} />
                Add user
              </button>
              <button
                aria-label="Close church details"
                className="btn-secondary px-3 py-2"
                type="button"
                onClick={closeModal}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/10 p-1">
            <button
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'overview'
                  ? 'bg-amber-200 text-stone-950'
                  : 'text-stone-300 hover:bg-white/10 hover:text-white'
              }`}
              type="button"
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'users'
                  ? 'bg-amber-200 text-stone-950'
                  : 'text-stone-300 hover:bg-white/10 hover:text-white'
              }`}
              type="button"
              onClick={() => setActiveTab('users')}
            >
              Users
            </button>
          </div>

          {activeTab === 'overview' ? (
            <div className="mt-6 space-y-5">
              {isLoadingDetails && !churchDetails ? (
                <div className="rounded-3xl border border-white/10 bg-black/10 p-5 text-stone-300">
                  Loading church details...
                </div>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetricTile
                      label="Billing"
                      value={
                        church?.billingModel === 'commission'
                          ? 'Commission'
                          : church?.subscription?.status || 'subscription'
                      }
                      detail={
                        church?.billingModel === 'commission'
                          ? 'No subscription timer'
                          : formatCountdown(church?.subscription)
                      }
                    />
                    <MetricTile
                      label="Direct M-Pesa"
                      value={formatCurrency(
                        church?.contributionTotals?.total || 0,
                      )}
                      detail={`${Number(
                        church?.contributionTotals?.count || 0,
                      ).toLocaleString()} confirmed payments`}
                    />
                    <MetricTile
                      label="Platform Revenue"
                      value={formatCurrency(
                        church?.contributionTotals?.revenue || 0,
                      )}
                      detail={
                        church?.billingModel === 'commission'
                          ? `${Number(church?.commissionRatePct || 0)}% commission`
                          : 'Subscription billing'
                      }
                    />
                    <MetricTile
                      label="SMS Units"
                      value={Number(
                        church?.smsUnitsConsumed || 0,
                      ).toLocaleString()}
                      detail="Accepted outbound units"
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                    <section className="rounded-3xl border border-white/10 bg-black/10 p-5">
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                        Profile and access
                      </p>
                      <dl className="mt-4 grid gap-4 md:grid-cols-2">
                        <DetailItem
                          label="Contact email"
                          value={church?.contactEmail || '-'}
                          icon={<Mail size={15} />}
                        />
                        <DetailItem
                          label="Contact phone"
                          value={church?.contactPhone || '-'}
                          icon={<Phone size={15} />}
                        />
                        <DetailItem
                          label="Address"
                          value={church?.address || '-'}
                        />
                        <DetailItem
                          label="Created"
                          value={formatDate(church?.createdAt)}
                        />
                      </dl>

                      <div className="mt-5 grid gap-3 md:grid-cols-2">
                        <IntegrationStatus
                          label="SMS autoresponses"
                          ready={Boolean(church?.integrations?.smsConfigured)}
                          detail={
                            church?.integrations?.smsConfigured
                              ? 'Advanta credentials are configured'
                              : 'SMS credentials are missing'
                          }
                          icon={<MessageSquareText size={16} />}
                        />
                        <IntegrationStatus
                          label="Direct M-Pesa"
                          ready={Boolean(
                            church?.integrations?.mpesaConfigured,
                          )}
                          detail={
                            church?.integrations?.mpesaConfigured
                              ? 'C2B callback credentials are configured'
                              : 'C2B credentials are missing'
                          }
                          icon={<CreditCard size={16} />}
                        />
                      </div>
                    </section>

                    <section className="rounded-3xl border border-white/10 bg-black/10 p-5">
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                        Public church pages
                      </p>
                      <div className="mt-4 space-y-3">
                        {publicPath ? (
                          <>
                            <a
                              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-100 transition hover:border-amber-200/40 hover:text-white"
                              href={publicPath}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <span className="min-w-0">
                                <span className="block font-semibold">
                                  Sermons & Announcements
                                </span>
                                <span className="mt-1 block break-all text-xs text-stone-400">
                                  {publicUrl}
                                </span>
                              </span>
                              <ArrowUpRight size={16} />
                            </a>
                            <a
                              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-100 transition hover:border-amber-200/40 hover:text-white"
                              href={givingPath}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <span className="min-w-0">
                                <span className="block font-semibold">
                                  Giving page
                                </span>
                                <span className="mt-1 block break-all text-xs text-stone-400">
                                  {givingPath}
                                </span>
                              </span>
                              <ArrowUpRight size={16} />
                            </a>
                          </>
                        ) : (
                          <p className="text-sm text-stone-300">
                            Add a church slug before publishing public pages.
                          </p>
                        )}
                      </div>

                      <div className="mt-5">
                        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                          Enabled modules
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(church?.enabledFeatures || []).map(
                            (feature: string) => (
                              <span
                                key={feature}
                                className="badge border-white/10 bg-white/5 text-stone-100"
                              >
                                {feature.replace(/_/g, ' ')}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    </section>
                  </div>

                  {church?.notes ? (
                    <section className="rounded-3xl border border-white/10 bg-black/10 p-5">
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                        Internal notes
                      </p>
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-stone-300">
                        {church.notes}
                      </p>
                    </section>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div className="mt-6 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_400px]">
              <section className="table-shell">
                <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                      Church staff
                    </p>
                    <h4 className="mt-2 text-lg font-semibold text-white">
                      Users for {church?.name || 'this church'}
                    </h4>
                  </div>
                  <button
                    className="btn-primary justify-center px-3 py-2"
                    type="button"
                    onClick={openCreateUser}
                  >
                    <UserPlus size={14} />
                    Add staff
                  </button>
                </div>

                {isLoadingUsers ? (
                  <div className="p-5 text-stone-300">
                    Loading church users...
                  </div>
                ) : users.length === 0 ? (
                  <div className="p-5 text-stone-300">
                    No staff users have been added yet.
                  </div>
                ) : (
                  <div className="table-scroll-region">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user: any) => (
                          <tr key={user.id}>
                            <td>
                              <div className="font-medium text-white">
                                {user.name}
                              </div>
                              <div className="text-xs text-stone-400">
                                {user.phone || user.username || '-'}
                              </div>
                            </td>
                            <td>{user.email}</td>
                            <td className="capitalize">
                              {`${user.role || ''}`.replace(/_/g, ' ')}
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  user.isActive
                                    ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
                                    : 'border-white/10 bg-white/5 text-stone-300'
                                }`}
                              >
                                {user.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  className="btn-secondary px-3 py-2"
                                  type="button"
                                  onClick={() => openEditUser(user)}
                                >
                                  <PencilLine size={14} />
                                  Edit
                                </button>
                                <button
                                  className="btn-secondary px-3 py-2"
                                  type="button"
                                  disabled={
                                    !user.phone ||
                                    resendCredentialsMutation.isPending
                                  }
                                  onClick={() =>
                                    resendCredentialsMutation.mutate(user.id)
                                  }
                                >
                                  <Send size={14} />
                                  Send login SMS
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-white/10 bg-black/10 p-4 sm:p-5">
                {isUserEditorOpen ? (
                  <>
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                      Staff user setup
                    </p>
                    <h4 className="mt-2 text-lg font-semibold text-white">
                      {editingUserId ? 'Edit church user' : 'Create church user'}
                    </h4>
                    <form
                      className="mt-5 space-y-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveUserMutation.mutate();
                      }}
                    >
                      {[
                        ['name', 'Full name'],
                        ['email', 'Email address'],
                        ['username', 'Username'],
                        ['phone', 'Phone number'],
                        [
                          'password',
                          editingUserId ? 'New password' : 'Password',
                        ],
                      ].map(([key, label]) => (
                        <div key={key}>
                          <label className="label">{label}</label>
                          <input
                            ref={key === 'name' ? staffNameInputRef : undefined}
                            className="input"
                            type={key === 'password' ? 'password' : 'text'}
                            value={staffForm[key as keyof StaffFormState] as any}
                            onChange={(event) =>
                              setStaffForm((current) => ({
                                ...current,
                                [key]: event.target.value,
                              }))
                            }
                          />
                          {key === 'password' && editingUserId ? (
                            <p className="mt-2 text-xs text-stone-400">
                              Leave blank to keep the current password.
                            </p>
                          ) : null}
                        </div>
                      ))}

                      <div>
                        <label className="label">Role</label>
                        <select
                          className="input"
                          value={staffForm.role}
                          onChange={(event) => changeRole(event.target.value)}
                        >
                          {roleOptions.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-xs text-stone-400">
                          {roleOptions.find(
                            (role) => role.value === staffForm.role,
                          )?.description || ''}
                        </p>
                      </div>

                      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-100">
                        <input
                          checked={staffForm.isActive}
                          type="checkbox"
                          onChange={(event) =>
                            setStaffForm((current) => ({
                              ...current,
                              isActive: event.target.checked,
                            }))
                          }
                        />
                        Active login access
                      </label>

                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                          Permission overrides
                        </p>
                        <div className="mt-3 grid gap-2">
                          {permissionOptions.map(([value, label]) => {
                            const isRolePermission =
                              rolePermissionPresets[staffForm.role]?.includes(
                                value,
                              );
                            const isOverride =
                              staffForm.permissionOverrides.includes(value);

                            return (
                              <label
                                key={value}
                                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                                  isRolePermission
                                    ? 'border-emerald-300/30 bg-emerald-300/10 text-stone-100'
                                    : 'border-white/10 bg-white/5 text-stone-100'
                                }`}
                              >
                                <input
                                  checked={isRolePermission || isOverride}
                                  disabled={isRolePermission}
                                  type="checkbox"
                                  onChange={() => togglePermission(value)}
                                />
                                <span className="flex-1">{label}</span>
                                {isRolePermission ? (
                                  <span className="rounded-full border border-emerald-300/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                                    Role
                                  </span>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          className="btn-primary flex-1 justify-center"
                          type="submit"
                        >
                          {saveUserMutation.isPending
                            ? 'Saving...'
                            : editingUserId
                              ? 'Update user'
                              : 'Create user'}
                        </button>
                        <button
                          className="btn-secondary justify-center"
                          type="button"
                          onClick={resetStaffEditor}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="flex min-h-80 flex-col items-start justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-stone-300">
                    <Users className="text-amber-100" size={28} />
                    <h4 className="mt-4 text-lg font-semibold text-white">
                      Select a user or add staff
                    </h4>
                    <p className="mt-2 text-sm leading-6">
                      Staff accounts stay tied to this church tenant, including
                      role presets and any extra permission overrides.
                    </p>
                    <button
                      className="btn-primary mt-5 justify-center"
                      type="button"
                      onClick={openCreateUser}
                    >
                      <UserPlus size={14} />
                      Add staff
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/10 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
        {label}
      </p>
      <div className="mt-3 text-xl font-semibold text-white">{value}</div>
      <p className="mt-2 text-xs text-stone-400">{detail}</p>
    </section>
  );
}

function DetailItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <dt className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-stone-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm text-stone-100">{value}</dd>
    </div>
  );
}

function IntegrationStatus({
  label,
  ready,
  detail,
  icon,
}: {
  label: string;
  ready: boolean;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-3 text-sm font-semibold text-white">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${
            ready
              ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
              : 'border-amber-200/30 bg-amber-200/10 text-amber-100'
          }`}
        >
          {ready ? <CheckCircle2 size={16} /> : icon}
        </span>
        {label}
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-400">{detail}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function formatCountdown(subscription: any) {
  const countdown = subscription?.countdown;
  if (!countdown) {
    return 'No countdown available';
  }

  return `${countdown.days || 0}d ${countdown.hours || 0}h ${
    countdown.minutes || 0
  }m remaining`;
}

function formatDate(value: unknown) {
  if (!value) {
    return '-';
  }

  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
