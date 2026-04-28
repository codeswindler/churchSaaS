import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const initialForm = {
  name: '',
  email: '',
  username: '',
  phone: '',
  password: '',
  role: 'treasurer',
  permissionOverrides: [] as string[],
  isActive: true,
};

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
  ['users.view', 'View staff users'],
  ['users.manage', 'Manage staff users'],
] as const;

export default function ChurchUsers() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [form, setForm] = useState<any>(initialForm);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['church-users'],
    queryFn: () => api.get('/church/users').then((response) => response.data),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const response = await api.patch(`/church/users/${editingId}`, form);
        return response.data;
      }
      const response = await api.post('/church/users', form);
      return response.data;
    },
    onSuccess: () => {
      toast.success(editingId ? 'User updated' : 'User created');
      setEditingId(null);
      setIsEditorOpen(false);
      setForm(initialForm);
      queryClient.invalidateQueries({ queryKey: ['church-users'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to save user');
    },
  });

  useEffect(() => {
    if (!isEditorOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (saveMutation.isPending) {
          return;
        }

        setIsEditorOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditorOpen, saveMutation.isPending]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(initialForm);
    setIsEditorOpen(true);
  };

  const togglePermission = (permission: string) => {
    setForm((current: any) => {
      const permissions = new Set(current.permissionOverrides || []);
      if (permissions.has(permission)) {
        permissions.delete(permission);
      } else {
        permissions.add(permission);
      }
      return { ...current, permissionOverrides: Array.from(permissions) };
    });
  };

  const closeEditor = () => {
    if (saveMutation.isPending) {
      return;
    }

    setIsEditorOpen(false);
  };

  return (
    <div className="space-y-6">
      <section className="table-shell">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Church Staff
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Internal user list
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-stone-300">
                Keep the three church staff categories organized: Priest,
                Treasurer, and Secretary. Add permission overrides only where a
                user needs access beyond their role preset.
              </p>
            </div>

            <button className="btn-primary justify-center" type="button" onClick={openCreateModal}>
              + Add staff
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-stone-300">Loading staff users...</div>
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
                {(users || []).map((user: any) => (
                  <tr key={user.id}>
                    <td>
                      <div className="font-medium text-white">{user.name}</div>
                      <div className="text-xs text-stone-400">
                        {user.phone || user.username || '-'}
                      </div>
                    </td>
                    <td>{user.email}</td>
                    <td className="capitalize">
                      {`${user.role || ''}`.replace(/_/g, ' ')}
                    </td>
                    <td>{user.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <button
                        className="btn-secondary px-3 py-2"
                        type="button"
                        onClick={() => {
                          setEditingId(user.id);
                          setForm({
                            name: user.name,
                            email: user.email,
                            username: user.username || '',
                            phone: user.phone || '',
                            password: '',
                            role: user.role,
                            permissionOverrides: user.permissionOverrides || [],
                            isActive: user.isActive,
                          });
                          setIsEditorOpen(true);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeEditor}>
          <div className="modal-shell" onClick={(event) => event.stopPropagation()}>
            <section className="panel modal-card max-w-3xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Staff User Setup
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    {editingId ? 'Edit church user' : 'Create church staff user'}
                  </h3>
                </div>

                <button
                  aria-label="Close staff user form"
                  className="shell-icon-button"
                  type="button"
                  onClick={closeEditor}
                >
                  <X size={18} />
                </button>
              </div>

              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveMutation.mutate();
                }}
              >
                {[
                  ['name', 'Full name'],
                  ['email', 'Email address'],
                  ['username', 'Username'],
                  ['phone', 'Phone number'],
                  ['password', editingId ? 'New password (optional)' : 'Password'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <input
                      ref={key === 'name' ? nameInputRef : undefined}
                      className="input"
                      type={key === 'password' ? 'password' : 'text'}
                      value={form[key]}
                      onChange={(event) =>
                        setForm((current: any) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}

                <div>
                  <label className="label">Role</label>
                  <select
                    className="input"
                    value={form.role}
                    onChange={(event) =>
                      setForm((current: any) => ({
                        ...current,
                        role: event.target.value,
                      }))
                    }
                  >
                    {roleOptions.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-stone-400">
                    {roleOptions.find((role) => role.value === form.role)
                      ?.description || ''}
                  </p>
                </div>

                <section className="rounded-3xl border border-white/10 bg-black/10 p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                    Permission Overrides
                  </p>
                  <p className="mt-2 text-sm text-stone-300">
                    These add access on top of the selected role. Church modules
                    disabled by platform admin still remain hidden.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {permissionOptions.map(([value, label]) => (
                      <label
                        key={value}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-100"
                      >
                        <input
                          checked={(form.permissionOverrides || []).includes(
                            value,
                          )}
                          type="checkbox"
                          onChange={() => togglePermission(value)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </section>

                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-stone-100">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((current: any) => ({
                        ...current,
                        isActive: event.target.checked,
                      }))
                    }
                  />
                  Active login access
                </label>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button className="btn-primary flex-1 justify-center" type="submit">
                    {saveMutation.isPending
                      ? 'Saving...'
                      : editingId
                        ? 'Update user'
                        : 'Create user'}
                  </button>
                  <button className="btn-secondary justify-center" type="button" onClick={closeEditor}>
                    Cancel
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
