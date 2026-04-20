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

  return (
    <div className="space-y-6">
      <section className="table-shell">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Platform Team
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Internal users
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-stone-300">
                Keep the internal platform team in view and open account setup only
                when you need to add a new user.
              </p>
            </div>

            <button className="btn-primary justify-center" type="button" onClick={openCreator}>
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
                  <th>Role</th>
                  <th>Status</th>
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
                    <td>{user.role}</td>
                    <td>{user.isActive ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
