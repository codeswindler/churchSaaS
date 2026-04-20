import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CalendarClock,
  CircleMinus,
  CirclePlus,
  CreditCard,
  MessageSquareText,
  PencilLine,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

function getDefaultMpesaCallbackUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  return `${window.location.origin}/api/payments/mpesa/webhook`;
}

function createInitialForm() {
  return {
    name: '',
    slug: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    notes: '',
    adminName: '',
    adminEmail: '',
    adminPhone: '',
    adminUsername: '',
    adminPassword: '',
    initialSubscriptionDays: 30,
    planName: 'Standard Plan',
    smsPartnerId: '',
    smsApiKey: '',
    smsShortcode: '',
    smsBaseUrl: 'https://quicksms.advantasms.com',
    mpesaEnvironment: 'sandbox',
    mpesaConsumerKey: '',
    mpesaConsumerSecret: '',
    mpesaPasskey: '',
    mpesaShortcode: '',
    mpesaCallbackUrl: getDefaultMpesaCallbackUrl(),
  };
}

type ChurchFormState = ReturnType<typeof createInitialForm>;

export default function PlatformChurches() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ChurchFormState>(() => createInitialForm());
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [isChurchModalOpen, setIsChurchModalOpen] = useState(false);
  const [isLoadingChurchDetails, setIsLoadingChurchDetails] = useState(false);
  const [editingChurchId, setEditingChurchId] = useState<string | null>(null);
  const [selectedChurchId, setSelectedChurchId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const { data: churches, isLoading } = useQuery({
    queryKey: ['platform-churches'],
    queryFn: () => api.get('/platform/churches').then((response) => response.data),
  });

  const { data: history } = useQuery({
    queryKey: ['platform-church-history', selectedChurchId],
    queryFn: () =>
      api
        .get(`/platform/churches/${selectedChurchId}/subscription/history`)
        .then((response) => response.data),
    enabled: Boolean(selectedChurchId),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (formMode === 'edit' && editingChurchId) {
        const response = await api.patch(
          `/platform/churches/${editingChurchId}`,
          buildUpdatePayload(form),
        );
        return response.data;
      }

      const response = await api.post('/platform/churches', form);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(
        formMode === 'edit' ? 'Church settings updated' : 'Church customer created',
      );
      setForm(createInitialForm());
      setFormMode('create');
      setIsChurchModalOpen(false);
      const nextSelectedChurchId =
        formMode === 'edit' ? editingChurchId : data?.church?.id || null;
      setEditingChurchId(null);
      setSelectedChurchId(nextSelectedChurchId);
      queryClient.invalidateQueries({ queryKey: ['platform-churches'] });
      queryClient.invalidateQueries({ queryKey: ['platform-dashboard'] });
      if (nextSelectedChurchId) {
        queryClient.invalidateQueries({
          queryKey: ['platform-church-history', nextSelectedChurchId],
        });
      }
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          (formMode === 'edit'
            ? 'Unable to update church'
            : 'Unable to create church'),
      );
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      churchId,
      endpoint,
      payload,
    }: {
      churchId: string;
      endpoint: string;
      payload?: any;
    }) => {
      const response = await api.post(
        `/platform/churches/${churchId}/subscription/${endpoint}`,
        payload || {},
      );
      return response.data;
    },
    onSuccess: () => {
      toast.success('Subscription updated');
      queryClient.invalidateQueries({ queryKey: ['platform-churches'] });
      queryClient.invalidateQueries({ queryKey: ['platform-dashboard'] });
      if (selectedChurchId) {
        queryClient.invalidateQueries({
          queryKey: ['platform-church-history', selectedChurchId],
        });
      }
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to update subscription',
      );
    },
  });

  const churchesList = useMemo(() => churches || [], [churches]);
  const isModalBusy = saveMutation.isPending || isLoadingChurchDetails;

  useEffect(() => {
    if (!isChurchModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.requestAnimationFrame(() => {
      if (!isLoadingChurchDetails) {
        nameInputRef.current?.focus();
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isModalBusy) {
        setIsChurchModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isChurchModalOpen, isLoadingChurchDetails, isModalBusy]);

  const updateForm = <K extends keyof ChurchFormState>(
    key: K,
    value: ChurchFormState[K],
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const openCreateModal = () => {
    setForm(createInitialForm());
    setFormMode('create');
    setEditingChurchId(null);
    setIsLoadingChurchDetails(false);
    setIsChurchModalOpen(true);
  };

  const openEditModal = async (churchId: string) => {
    setFormMode('edit');
    setEditingChurchId(churchId);
    setIsChurchModalOpen(true);
    setIsLoadingChurchDetails(true);

    try {
      const response = await api.get(`/platform/churches/${churchId}`);
      const defaultCallbackUrl = getDefaultMpesaCallbackUrl();
      setForm((current) => ({
        ...current,
        ...createInitialForm(),
        name: response.data.name || '',
        slug: response.data.slug || '',
        contactEmail: response.data.contactEmail || '',
        contactPhone: response.data.contactPhone || '',
        address: response.data.address || '',
        notes: response.data.notes || '',
        planName: current.planName,
        initialSubscriptionDays: current.initialSubscriptionDays,
        smsPartnerId: response.data.smsPartnerId || '',
        smsApiKey: response.data.smsApiKey || '',
        smsShortcode: response.data.smsShortcode || '',
        smsBaseUrl:
          response.data.smsBaseUrl || 'https://quicksms.advantasms.com',
        mpesaEnvironment: response.data.mpesaEnvironment || 'sandbox',
        mpesaConsumerKey: response.data.mpesaConsumerKey || '',
        mpesaConsumerSecret: response.data.mpesaConsumerSecret || '',
        mpesaPasskey: response.data.mpesaPasskey || '',
        mpesaShortcode: response.data.mpesaShortcode || '',
        mpesaCallbackUrl: response.data.mpesaCallbackUrl || defaultCallbackUrl,
      }));
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || 'Unable to load church settings',
      );
      setIsChurchModalOpen(false);
      setEditingChurchId(null);
      setFormMode('create');
    } finally {
      setIsLoadingChurchDetails(false);
    }
  };

  const closeChurchModal = () => {
    if (isModalBusy) {
      return;
    }

    setIsChurchModalOpen(false);
    setFormMode('create');
    setEditingChurchId(null);
    setForm(createInitialForm());
  };

  const runDaysAction = (
    churchId: string,
    endpoint: string,
    fallbackDays: number,
  ) => {
    const value = window.prompt('How many days?', `${fallbackDays}`);
    if (!value) {
      return;
    }
    const reason = window.prompt('Reason for this change?', 'Subscription update');
    actionMutation.mutate({
      churchId,
      endpoint,
      payload: { days: Number(value), reason: reason || undefined },
    });
  };

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
          Subscription History
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-white">
          Selected church adjustments
        </h3>

        {!selectedChurchId ? (
          <p className="mt-5 text-stone-300">
            Choose a church from the registry below to inspect its subscription audit
            trail.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {(history || []).map((item: any) => (
              <div
                key={item.id}
                className="rounded-3xl border border-white/10 bg-black/10 p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100">
                      {item.actionType.replace(/_/g, ' ')}
                    </h4>
                    <p className="mt-2 text-sm text-stone-300">
                      {item.reason || 'No reason provided'}
                    </p>
                  </div>
                  <div className="mono text-sm text-stone-200">
                    {item.daysDelta > 0 ? '+' : ''}
                    {item.daysDelta}d
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="table-shell">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Customer Registry
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Churches and subscriptions
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-stone-300">
                Keep the customer list in view and open onboarding only when you need
                to add or update a church tenant.
              </p>
            </div>

            <button
              className="btn-primary justify-center lg:self-start"
              type="button"
              onClick={openCreateModal}
            >
              <Building2 size={16} />
              Create church
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-stone-300">Loading churches...</div>
        ) : (
          <div className="table-scroll-region">
            <table>
              <thead>
                <tr>
                  <th>Church</th>
                  <th>Subscription</th>
                  <th>Countdown</th>
                  <th>Collections</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {churchesList.map((church: any) => (
                  <tr
                    key={church.id}
                    className={selectedChurchId === church.id ? 'bg-amber-200/5' : ''}
                  >
                    <td>
                      <div className="font-medium text-white">{church.name}</div>
                      <div className="text-xs text-stone-400">
                        {church.contactEmail || church.contactPhone || church.slug}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="badge border-white/10 bg-white/5 text-stone-100">
                          <MessageSquareText size={12} />
                          SMS {church.integrations?.smsConfigured ? 'ready' : 'missing'}
                        </span>
                        <span className="badge border-white/10 bg-white/5 text-stone-100">
                          <CreditCard size={12} />
                          M-Pesa{' '}
                          {church.integrations?.mpesaConfigured ? 'ready' : 'missing'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="badge border-white/10 bg-white/5 text-stone-100">
                        {church.subscription?.status || 'unknown'}
                      </div>
                    </td>
                    <td className="mono text-sm">
                      {church.subscription?.countdown?.days || 0}d{' '}
                      {church.subscription?.countdown?.hours || 0}h{' '}
                      {church.subscription?.countdown?.minutes || 0}m
                    </td>
                    <td>
                      KES{' '}
                      {Number(church.contributionTotals?.total || 0).toLocaleString()}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="btn-secondary px-3 py-2"
                          type="button"
                          onClick={() => setSelectedChurchId(church.id)}
                        >
                          <CalendarClock size={14} />
                          History
                        </button>
                        <button
                          className="btn-secondary px-3 py-2"
                          type="button"
                          onClick={() => openEditModal(church.id)}
                        >
                          <PencilLine size={14} />
                          Edit
                        </button>
                        <button
                          className="btn-secondary px-3 py-2"
                          type="button"
                          onClick={() => runDaysAction(church.id, 'add-days', 30)}
                        >
                          <CirclePlus size={14} />
                          Add days
                        </button>
                        <button
                          className="btn-secondary px-3 py-2"
                          type="button"
                          onClick={() =>
                            runDaysAction(church.id, 'subtract-days', 7)
                          }
                        >
                          <CircleMinus size={14} />
                          Subtract days
                        </button>
                        <button
                          className="btn-danger px-3 py-2"
                          type="button"
                          onClick={() =>
                            actionMutation.mutate({
                              churchId: church.id,
                              endpoint: 'suspend',
                              payload: { reason: 'Suspended by admin' },
                            })
                          }
                        >
                          Suspend
                        </button>
                        <button
                          className="btn-secondary px-3 py-2"
                          type="button"
                          onClick={() => runDaysAction(church.id, 'reactivate', 30)}
                        >
                          <RotateCcw size={14} />
                          Reactivate
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

      {isChurchModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeChurchModal}
        >
          <div className="modal-shell">
            <section
              aria-labelledby="church-form-title"
              aria-modal="true"
              className="panel modal-card p-6 sm:p-7"
              role="dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    {formMode === 'edit'
                      ? 'Update Church Customer'
                      : 'Onboard Church Customer'}
                  </p>
                  <h3
                    id="church-form-title"
                    className="mt-2 text-2xl font-semibold text-white"
                  >
                    {formMode === 'edit'
                      ? 'Edit church integrations and profile'
                      : 'Create a new church tenant'}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-stone-300">
                    {formMode === 'edit'
                      ? 'Adjust the church profile, SMS credentials, and M-Pesa credentials without leaving the registry.'
                      : 'Add the church, its first admin, and its integration credentials without taking attention away from the live customer registry.'}
                  </p>
                </div>

                <button
                  aria-label="Close church form"
                  className="btn-secondary px-3 py-2"
                  type="button"
                  onClick={closeChurchModal}
                >
                  <X size={16} />
                </button>
              </div>

              {isLoadingChurchDetails ? (
                <div className="mt-6 rounded-3xl border border-white/10 bg-black/10 p-5 text-stone-300">
                  Loading church details...
                </div>
              ) : (
                <form
                  className="mt-6 space-y-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveMutation.mutate();
                  }}
                >
                  <section className="rounded-3xl border border-white/10 bg-black/10 p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                      Church Profile
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {[
                        ['name', 'Church name'],
                        ['slug', 'Slug'],
                        ['contactEmail', 'Contact email'],
                        ['contactPhone', 'Contact phone'],
                      ].map(([key, label]) => (
                        <div key={key}>
                          <label className="label">{label}</label>
                          <input
                            ref={key === 'name' ? nameInputRef : undefined}
                            className="input"
                            type="text"
                            value={form[key as keyof ChurchFormState]}
                            onChange={(event) =>
                              updateForm(
                                key as keyof ChurchFormState,
                                event.target.value as never,
                              )
                            }
                          />
                        </div>
                      ))}

                      <div className="md:col-span-2">
                        <label className="label">Address</label>
                        <input
                          className="input"
                          type="text"
                          value={form.address}
                          onChange={(event) => updateForm('address', event.target.value)}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="label">Notes</label>
                        <textarea
                          className="input min-h-28 resize-y"
                          value={form.notes}
                          onChange={(event) => updateForm('notes', event.target.value)}
                        />
                      </div>
                    </div>
                  </section>

                  {formMode === 'create' ? (
                    <section className="rounded-3xl border border-white/10 bg-black/10 p-5">
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                        First Church Admin
                      </p>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {[
                          ['adminName', 'First admin name'],
                          ['adminEmail', 'First admin email'],
                          ['adminPhone', 'First admin phone'],
                          ['adminUsername', 'First admin username'],
                          ['adminPassword', 'First admin password'],
                          ['planName', 'Plan name'],
                        ].map(([key, label]) => (
                          <div key={key}>
                            <label className="label">{label}</label>
                            <input
                              className="input"
                              type={key === 'adminPassword' ? 'password' : 'text'}
                              value={form[key as keyof ChurchFormState]}
                              onChange={(event) =>
                                updateForm(
                                  key as keyof ChurchFormState,
                                  event.target.value as never,
                                )
                              }
                            />
                          </div>
                        ))}

                        <div>
                          <label className="label">Initial subscription days</label>
                          <input
                            className="input"
                            min={1}
                            type="number"
                            value={form.initialSubscriptionDays}
                            onChange={(event) =>
                              updateForm(
                                'initialSubscriptionDays',
                                Number(event.target.value || 0),
                              )
                            }
                          />
                        </div>
                      </div>
                    </section>
                  ) : null}

                  <section className="rounded-3xl border border-white/10 bg-black/10 p-5">
                    <div className="flex items-center gap-3">
                      <MessageSquareText size={16} className="text-amber-200" />
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                        Advanta SMS Credentials
                      </p>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {[
                        ['smsPartnerId', 'Partner ID', 'text'],
                        ['smsApiKey', 'API key', 'password'],
                        ['smsShortcode', 'Shortcode', 'text'],
                        ['smsBaseUrl', 'Base URL', 'text'],
                      ].map(([key, label, type]) => (
                        <div key={key}>
                          <label className="label">{label}</label>
                          <input
                            className="input"
                            type={type}
                            value={form[key as keyof ChurchFormState]}
                            onChange={(event) =>
                              updateForm(
                                key as keyof ChurchFormState,
                                event.target.value as never,
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-white/10 bg-black/10 p-5">
                    <div className="flex items-center gap-3">
                      <CreditCard size={16} className="text-amber-200" />
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                        M-Pesa Daraja Credentials
                      </p>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="label">Environment</label>
                        <select
                          className="input"
                          value={form.mpesaEnvironment}
                          onChange={(event) =>
                            updateForm('mpesaEnvironment', event.target.value)
                          }
                        >
                          <option value="sandbox">Sandbox</option>
                          <option value="production">Production</option>
                        </select>
                      </div>

                      {[
                        ['mpesaShortcode', 'Shortcode', 'text'],
                        ['mpesaConsumerKey', 'Consumer key', 'text'],
                        ['mpesaConsumerSecret', 'Consumer secret', 'password'],
                        ['mpesaPasskey', 'Passkey', 'password'],
                        ['mpesaCallbackUrl', 'Callback URL', 'text'],
                      ].map(([key, label, type]) => (
                        <div key={key}>
                          <label className="label">{label}</label>
                          <input
                            className="input"
                            type={type}
                            value={form[key as keyof ChurchFormState]}
                            onChange={(event) =>
                              updateForm(
                                key as keyof ChurchFormState,
                                event.target.value as never,
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-sm text-stone-300">
                      The Daraja STK push flow needs the passkey so the request
                      password can be generated from shortcode + passkey + timestamp.
                      The callback URL is prefilled with the shared platform webhook.
                    </p>
                  </section>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      className="btn-secondary flex-1 justify-center"
                      type="button"
                      onClick={closeChurchModal}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-primary flex-1 justify-center"
                      type="submit"
                    >
                      {saveMutation.isPending
                        ? formMode === 'edit'
                          ? 'Saving changes...'
                          : 'Creating church...'
                        : formMode === 'edit'
                          ? 'Save church settings'
                          : 'Create church'}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildUpdatePayload(form: ChurchFormState) {
  return {
    name: form.name,
    slug: form.slug,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    address: form.address,
    notes: form.notes,
    smsPartnerId: form.smsPartnerId,
    smsApiKey: form.smsApiKey,
    smsShortcode: form.smsShortcode,
    smsBaseUrl: form.smsBaseUrl,
    mpesaEnvironment: form.mpesaEnvironment,
    mpesaConsumerKey: form.mpesaConsumerKey,
    mpesaConsumerSecret: form.mpesaConsumerSecret,
    mpesaPasskey: form.mpesaPasskey,
    mpesaShortcode: form.mpesaShortcode,
    mpesaCallbackUrl: form.mpesaCallbackUrl,
  };
}
