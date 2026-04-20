import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ShieldCheck, Smartphone, UserCheck2, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const initialForm = {
  name: '',
  email: '',
  username: '',
  phone: '',
  password: '',
};

export default function PlatformUsers() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => api.get('/platform/users').then((response) => response.data),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/platform/users', form);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Platform user created');
      setForm(initialForm);
      setIsCreatorOpen(false);
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to create user');
    },
  });

  useEffect(() => {
    if (!isCreatorOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (createMutation.isPending) {
          return;
        }

        setIsCreatorOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCreatorOpen, createMutation.isPending]);

  const closeCreator = () => {
    if (createMutation.isPending) {
      return;
    }

    setIsCreatorOpen(false);
  };

  const openCreator = () => {
    setForm(initialForm);
    setIsCreatorOpen(true);
  };

  const platformUsers = users || [];
  const totalUsers = platformUsers.length;
  const activeUsers = platformUsers.filter((user: any) => user.isActive).length;
  const usersWithPhone = platformUsers.filter((user: any) => !!user.phone).length;
  const usersWithUsername = platformUsers.filter((user: any) => !!user.username).length;

  const statCards = [
    {
      label: 'Platform Users',
      value: totalUsers,
      hint: 'Internal accounts with access to customer operations.',
      icon: Users,
    },
    {
      label: 'Active Access',
      value: activeUsers,
      hint: 'Users currently able to sign in and manage the workspace.',
      icon: UserCheck2,
    },
    {
      label: 'Phone Coverage',
      value: `${usersWithPhone}/${totalUsers || 0}`,
      hint: 'Phone numbers ready for OTP and mobile-first recovery flows.',
      icon: Smartphone,
    },
    {
      label: 'Username Ready',
      value: `${usersWithUsername}/${totalUsers || 0}`,
      hint: 'Accounts with direct username access for faster admin sign-in.',
      icon: KeyRound,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="overview-stat-grid">
        {statCards.map(({ label, value, hint, icon: Icon }) => (
          <article key={label} className="stat-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  {label}
                </p>
                <div className="mt-4 text-4xl font-semibold text-white">
                  {value}
                </div>
              </div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-amber-200">
                <Icon size={18} />
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-6 text-stone-300">
              {hint}
            </p>
          </article>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.72fr)]">
        <section className="table-shell">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Platform Team
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Internal users
                </h3>
                <p className="mt-2 max-w-3xl text-sm text-stone-300">
                  Keep the internal platform team in view, review access coverage at a glance,
                  and open account setup only when you need to add a new user.
                </p>
              </div>

              <button
                className="btn-primary justify-center xl:self-start"
                type="button"
                onClick={openCreator}
              >
                + Add user
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-6 text-stone-300">Loading users...</div>
          ) : (
            <div className="table-scroll-region">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Username</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {platformUsers.map((user: any) => (
                    <tr key={user.id}>
                      <td>
                        <div className="font-medium text-white">{user.name}</div>
                        <div className="text-xs text-stone-400">
                          {user.id}
                        </div>
                      </td>
                      <td>{user.email}</td>
                      <td>
                        {user.username ? (
                          <span className="font-medium text-white">{user.username}</span>
                        ) : (
                          <span className="text-stone-400">Not assigned</span>
                        )}
                      </td>
                      <td>
                        {user.phone ? (
                          <span className="font-medium text-white">{user.phone}</span>
                        ) : (
                          <span className="text-amber-200/85">Add mobile for OTP</span>
                        )}
                      </td>
                      <td className="capitalize">
                        {`${user.role || ''}`.replace(/_/g, ' ')}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            user.isActive
                              ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
                              : 'border-rose-300/20 bg-rose-400/10 text-rose-100'
                          }`}
                        >
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel flex flex-col gap-5 p-6 xl:sticky xl:top-4 xl:self-start">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Access Health
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Desktop-ready oversight
            </h3>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              Use the wider workspace to keep platform access coverage, sign-in readiness,
              and mobile OTP preparation visible without leaving the users page.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/10 text-amber-200">
                  <Smartphone size={18} />
                </span>
                <div>
                  <h4 className="text-base font-semibold text-white">
                    Mobile identity coverage
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-stone-300">
                    {usersWithPhone} of {totalUsers} platform users currently have a phone
                    number stored. That is the key field you will want filled for OTP-based
                    sign-in or recovery.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/10 text-amber-200">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <h4 className="text-base font-semibold text-white">
                    Access discipline
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-stone-300">
                    Keep platform accounts limited to internal operations only, and make sure
                    every account has a unique username, email, and mobile number for clean
                    control and traceability.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {isCreatorOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeCreator}>
          <div className="modal-shell" onClick={(event) => event.stopPropagation()}>
            <section className="panel modal-card max-w-3xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Create Platform User
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    Add internal staff
                  </h3>
                </div>

                <button
                  aria-label="Close platform user form"
                  className="shell-icon-button"
                  type="button"
                  onClick={closeCreator}
                >
                  <X size={18} />
                </button>
              </div>

              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  createMutation.mutate();
                }}
              >
                {[
                  ['name', 'Full name'],
                  ['email', 'Email address'],
                  ['username', 'Username'],
                  ['phone', 'Phone'],
                  ['password', 'Password'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <input
                      ref={key === 'name' ? nameInputRef : undefined}
                      className="input"
                      type={key === 'password' ? 'password' : 'text'}
                      value={(form as any)[key]}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button className="btn-secondary flex-1 justify-center" type="button" onClick={closeCreator}>
                    Cancel
                  </button>
                  <button className="btn-primary flex-1 justify-center" type="submit">
                    {createMutation.isPending ? 'Creating...' : 'Create platform user'}
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
