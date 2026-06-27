import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  Plus,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import api, { getSession } from '../../services/api';

type FundDisplayForm = {
  title: string;
  description: string;
  fundAccountId: string;
  startDate: string;
  endMode: 'to_date' | 'static';
  endDate: string;
  isActive: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

type DurationUnit = 'minutes' | 'hours' | 'days';
type DurationSelection = {
  value: string;
  unit: DurationUnit;
};

const DEFAULT_DURATION: DurationSelection = { value: '1', unit: 'hours' };
const durationPresets = [
  { label: '30 min', value: '30', unit: 'minutes' as const },
  { label: '1 hour', value: '1', unit: 'hours' as const },
  { label: '24 hours', value: '24', unit: 'hours' as const },
  { label: '1 week', value: '7', unit: 'days' as const },
];

function toDurationMinutes(selection: DurationSelection) {
  const value = Number(selection.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  const multiplier =
    selection.unit === 'days' ? 1440 : selection.unit === 'hours' ? 60 : 1;
  return Math.round(value * multiplier);
}

function formatDuration(minutes?: number | null) {
  if (!minutes) return 'Not set';
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function formatRemaining(value: string | null | undefined, now: number) {
  if (!value) return 'Timer not set';
  const remainingSeconds = Math.max(
    0,
    Math.floor((new Date(value).getTime() - now) / 1000),
  );
  if (remainingSeconds <= 0) return 'Removing now';
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function createInitialForm(fundAccountId = ''): FundDisplayForm {
  return {
    title: '',
    description: '',
    fundAccountId,
    startDate: today(),
    endMode: 'to_date',
    endDate: '',
    isActive: true,
  };
}

function formatKes(value: unknown) {
  return `KES ${Number(value || 0).toLocaleString('en-KE', {
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not set'
    : date.toLocaleString('en-KE', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

function statusClasses(status: string) {
  if (status === 'active') return 'border-emerald-200/35 text-emerald-100';
  if (status === 'pending' || status === 'scheduled') {
    return 'border-amber-200/40 text-amber-100';
  }
  if (status === 'rejected') return 'border-rose-200/40 text-rose-100';
  return 'border-white/15 text-stone-300';
}

function DurationPicker({
  value,
  onChange,
}: {
  value: DurationSelection;
  onChange: (value: DurationSelection) => void;
}) {
  const selectedMinutes = toDurationMinutes(value);

  return (
    <div className="duration-picker">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {durationPresets.map((preset) => {
          const presetMinutes = toDurationMinutes(preset);
          return (
            <button
              key={preset.label}
              className={`duration-preset ${
                selectedMinutes === presetMinutes ? 'is-active' : ''
              }`}
              type="button"
              onClick={() =>
                onChange({ value: preset.value, unit: preset.unit })
              }
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
        <input
          aria-label="Custom duration"
          className="input"
          min="1"
          required
          step="1"
          type="number"
          value={value.value}
          onChange={(event) =>
            onChange({ ...value, value: event.target.value })
          }
        />
        <select
          aria-label="Duration unit"
          className="input"
          value={value.unit}
          onChange={(event) =>
            onChange({
              ...value,
              unit: event.target.value as DurationUnit,
            })
          }
        >
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </select>
      </div>
    </div>
  );
}

export default function ChurchFundDisplays() {
  const queryClient = useQueryClient();
  const session = getSession();
  const isPriest =
    session?.user?.role === 'priest' || session?.user?.role === 'church_admin';
  const publicFundsPath = session?.church?.slug
    ? `/c/${session.church.slug}/funds`
    : '';
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedReviewId = searchParams.get('review');
  const openedReviewId = useRef<string | null>(null);
  const [editorItem, setEditorItem] = useState<any | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [form, setForm] = useState<FundDisplayForm>(createInitialForm());
  const [formDuration, setFormDuration] =
    useState<DurationSelection>(DEFAULT_DURATION);
  const [reviewItem, setReviewItem] = useState<any | null>(null);
  const [reviewForm, setReviewForm] = useState({ note: '' });
  const [reviewDuration, setReviewDuration] =
    useState<DurationSelection>(DEFAULT_DURATION);
  const [timerItem, setTimerItem] = useState<any | null>(null);
  const [timerMode, setTimerMode] = useState<'replace' | 'extend'>('extend');
  const [timerDuration, setTimerDuration] =
    useState<DurationSelection>(DEFAULT_DURATION);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: fundAccounts = [] } = useQuery<any[]>({
    queryKey: ['church-fund-accounts'],
    queryFn: () =>
      api.get('/church/fund-accounts').then((response) => response.data),
  });
  const activeFundAccounts = useMemo(
    () => fundAccounts.filter((item) => item.isActive !== false),
    [fundAccounts],
  );

  const { data: displays = [], isLoading } = useQuery<any[]>({
    queryKey: ['church-fund-displays'],
    queryFn: () =>
      api
        .get('/church/congregation-page/fund-displays')
        .then((response) => response.data),
    refetchInterval: 15_000,
  });

  const closeReview = () => {
    setReviewItem(null);
    setReviewForm({ note: '' });
    setReviewDuration(DEFAULT_DURATION);
    if (requestedReviewId) {
      setSearchParams({}, { replace: true });
    }
  };

  const openReview = (item: any) => {
    setReviewItem(item);
    setReviewForm({ note: item.approvalNote || '' });
    setReviewDuration(DEFAULT_DURATION);
  };

  useEffect(() => {
    if (
      !isPriest ||
      !requestedReviewId ||
      openedReviewId.current === requestedReviewId ||
      displays.length === 0
    ) {
      return;
    }
    const item = displays.find((display) => display.id === requestedReviewId);
    if (item?.approvalStatus === 'pending') {
      openedReviewId.current = requestedReviewId;
      openReview(item);
    }
  }, [displays, isPriest, requestedReviewId]);

  const refreshDisplays = () => {
    queryClient.invalidateQueries({ queryKey: ['church-fund-displays'] });
    queryClient.invalidateQueries({ queryKey: ['church-congregation-page'] });
    queryClient.invalidateQueries({ queryKey: ['church-notifications'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const needsApprovalDuration =
        isPriest && (!editorItem || editorItem.approvalStatus !== 'approved');
      const durationMinutes = toDurationMinutes(formDuration);
      const payload = {
        ...form,
        endDate: form.endMode === 'static' ? form.endDate : null,
        ...(needsApprovalDuration ? { durationMinutes } : {}),
      };
      return editorItem
        ? api.patch(
            `/church/congregation-page/fund-displays/${editorItem.id}`,
            payload,
          )
        : api.post('/church/congregation-page/fund-displays', payload);
    },
    onSuccess: () => {
      toast.success(
        isPriest
          ? 'Fund display saved'
          : 'Fund display submitted for priest approval',
      );
      setIsEditorOpen(false);
      setEditorItem(null);
      refreshDisplays();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to save display');
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      api.post(
        `/church/congregation-page/fund-displays/${reviewItem.id}/${action}`,
        action === 'approve'
          ? {
              durationMinutes: toDurationMinutes(reviewDuration),
              note: reviewForm.note,
            }
          : { note: reviewForm.note },
      ),
    onSuccess: (_, action) => {
      toast.success(
        action === 'approve'
          ? 'Fund display approved'
          : 'Fund display rejected',
      );
      closeReview();
      refreshDisplays();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to review display');
    },
  });

  const timerMutation = useMutation({
    mutationFn: () =>
      api.post(
        `/church/congregation-page/fund-displays/${timerItem.id}/duration`,
        {
          mode: timerMode,
          durationMinutes: toDurationMinutes(timerDuration),
        },
      ),
    onSuccess: () => {
      toast.success(
        timerMode === 'extend'
          ? 'Fund display timer extended'
          : 'Fund display timer replaced',
      );
      setTimerItem(null);
      refreshDisplays();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to update timer');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (displayId: string) =>
      api.delete(`/church/congregation-page/fund-displays/${displayId}`),
    onSuccess: () => {
      toast.success('Fund display removed');
      refreshDisplays();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to remove display');
    },
  });

  const openCreate = () => {
    setEditorItem(null);
    setForm(createInitialForm(activeFundAccounts[0]?.id || ''));
    setFormDuration(DEFAULT_DURATION);
    setIsEditorOpen(true);
  };

  const openEdit = (item: any) => {
    setEditorItem(item);
    setForm({
      title: item.title || '',
      description: item.description || '',
      fundAccountId: item.fundAccountId || '',
      startDate: item.startDate || today(),
      endMode: item.endMode === 'static' ? 'static' : 'to_date',
      endDate: item.endDate || '',
      isActive: item.isActive !== false,
    });
    setFormDuration(DEFAULT_DURATION);
    setIsEditorOpen(true);
  };

  const openTimer = (item: any) => {
    setTimerItem(item);
    setTimerMode(item.visibleUntil ? 'extend' : 'replace');
    setTimerDuration(DEFAULT_DURATION);
  };

  const editorNeedsDuration =
    isPriest && (!editorItem || editorItem.approvalStatus !== 'approved');
  const selectedEditorFundAccount = activeFundAccounts.find(
    (account) => account.id === form.fundAccountId,
  );
  const copyPublicLink = async (path: string) => {
    if (!path) return;
    const url =
      typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
    await navigator.clipboard?.writeText(url);
    toast.success('Public fund link copied');
  };

  return (
    <div className="church-console-page fund-displays-page space-y-5">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Public collections
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Approved fund displays
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-stone-300">
              Control which collection totals appear publicly. Approval
              starts a countdown, and the display is removed automatically when
              time runs out.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {publicFundsPath ? (
              <>
                <a
                  className="btn-secondary justify-center"
                  href={publicFundsPath}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink size={16} />
                  Preview
                </a>
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={() => copyPublicLink(publicFundsPath)}
                >
                  <Copy size={16} />
                  Copy link
                </button>
              </>
            ) : null}
            <button
              className="btn-primary justify-center"
              disabled={activeFundAccounts.length === 0}
              type="button"
              onClick={openCreate}
            >
              <Plus size={17} />
              Add fund display
            </button>
          </div>
        </div>
      </section>

      <section className="fund-display-list grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {isLoading ? (
          <div className="panel p-6 text-stone-300">
            Loading fund displays...
          </div>
        ) : displays.length === 0 ? (
          <div className="panel p-6 text-stone-300 md:col-span-2">
            No public fund displays have been configured.
          </div>
        ) : (
          displays.map((item) => (
            <article key={item.id} className="panel fund-display-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
                    {item.fundAccountName}
                  </p>
                  <h3 className="mt-2 truncate text-xl font-semibold text-white">
                    {item.title || item.fundAccountName}
                  </h3>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusClasses(item.displayStatus)}`}
                >
                  {item.displayStatus}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                    Total
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {formatKes(item.totalAmount)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                    Contributions
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {Number(item.contributionCount || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-2 text-sm text-stone-300">
                <div className="flex justify-between gap-3">
                  <dt>Reporting period</dt>
                  <dd className="text-right text-white">
                    {item.startDate} -{' '}
                    {item.endMode === 'static' ? item.endDate : 'to date'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Account target</dt>
                  <dd className="text-right text-white">
                    {Number(item.targetAmount || 0) > 0
                      ? formatKes(item.targetAmount)
                      : 'Open goal'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Approval duration</dt>
                  <dd className="text-right text-white">
                    {formatDuration(item.approvalDurationMinutes)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>
                    {item.approvalStatus === 'approved'
                      ? 'Time remaining'
                      : 'Visibility timer'}
                  </dt>
                  <dd
                    className={`text-right font-semibold ${
                      item.approvalStatus === 'approved'
                        ? 'text-amber-100'
                        : 'text-white'
                    }`}
                  >
                    {item.approvalStatus === 'approved'
                      ? formatRemaining(item.visibleUntil, now)
                      : 'Starts on approval'}
                  </dd>
                </div>
                {item.visibleUntil ? (
                  <div className="flex justify-between gap-3">
                    <dt>Automatic removal</dt>
                    <dd className="text-right text-white">
                      {formatDateTime(item.visibleUntil)}
                    </dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                {publicFundsPath &&
                item.approvalStatus === 'approved' &&
                item.displayStatus === 'active' ? (
                  <>
                    <a
                      className="btn-secondary px-3 py-2"
                      href={`${publicFundsPath}/${item.id}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink size={16} />
                      Preview
                    </a>
                    <button
                      aria-label={`Copy public link for ${item.title || item.fundAccountName}`}
                      className="btn-secondary px-3 py-2"
                      type="button"
                      onClick={() =>
                        copyPublicLink(`${publicFundsPath}/${item.id}`)
                      }
                    >
                      <Copy size={16} />
                    </button>
                  </>
                ) : null}
                {isPriest && item.approvalStatus === 'pending' ? (
                  <button
                    className="btn-primary px-3 py-2"
                    type="button"
                    onClick={() => openReview(item)}
                  >
                    <Eye size={16} />
                    Review
                  </button>
                ) : null}
                <button
                  className="btn-secondary px-3 py-2"
                  type="button"
                  onClick={() => openEdit(item)}
                >
                  <Edit3 size={16} />
                  Edit
                </button>
                {isPriest && item.approvalStatus === 'approved' ? (
                  <button
                    className="btn-secondary px-3 py-2"
                    type="button"
                    onClick={() => openTimer(item)}
                  >
                    <Clock3 size={16} />
                    Timer
                  </button>
                ) : null}
                <button
                  aria-label={`Delete ${item.title || item.fundAccountName}`}
                  className="btn-secondary ml-auto px-3 py-2"
                  disabled={deleteMutation.isPending}
                  type="button"
                  onClick={() => {
                    if (window.confirm('Remove this public fund display?')) {
                      deleteMutation.mutate(item.id);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      {isEditorOpen ? (
        <div className="modal-backdrop" onClick={() => setIsEditorOpen(false)}>
          <div
            className="modal-shell"
            onClick={(event) => event.stopPropagation()}
          >
            <form
              className="panel modal-card max-w-3xl p-5 sm:p-6"
              onSubmit={(event) => {
                event.preventDefault();
                saveMutation.mutate();
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                    Public fund display
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    {editorItem ? 'Edit display' : 'Create display'}
                  </h3>
                </div>
                <button
                  aria-label="Close fund display editor"
                  className="shell-icon-button"
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Fund account</label>
                  <select
                    className="input"
                    required
                    value={form.fundAccountId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        fundAccountId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select account</option>
                    {activeFundAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-stone-400">
                    Target:{' '}
                    <span className="font-semibold text-stone-100">
                      {Number(selectedEditorFundAccount?.targetAmount || 0) > 0
                        ? formatKes(selectedEditorFundAccount?.targetAmount)
                        : 'Open goal'}
                    </span>
                    . Change it from{' '}
                    <a className="text-emerald-300 underline" href="/church/fund-accounts">
                      Fund Accounts
                    </a>
                    .
                  </p>
                </div>
                <div>
                  <label className="label">Display title</label>
                  <input
                    className="input"
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Building fund"
                  />
                </div>
                <div>
                  <label className="label">Totals start date</label>
                  <input
                    className="input"
                    required
                    type="date"
                    value={form.startDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        startDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="label">Totals end</label>
                  <select
                    className="input"
                    value={form.endMode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endMode: event.target.value as 'to_date' | 'static',
                      }))
                    }
                  >
                    <option value="to_date">Keep updating to date</option>
                    <option value="static">Stop on a date</option>
                  </select>
                </div>
                {form.endMode === 'static' ? (
                  <div>
                    <label className="label">Totals end date</label>
                    <input
                      className="input"
                      required
                      type="date"
                      value={form.endDate}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          endDate: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
                {editorNeedsDuration ? (
                  <div className="rounded-2xl border border-amber-200/20 bg-amber-200/10 p-4 md:col-span-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-50">
                      <CalendarClock size={17} />
                      Public approval duration
                    </div>
                    <p className="mt-2 text-sm text-amber-50/80">
                      The countdown begins immediately when this display is
                      saved or approved.
                    </p>
                    <div className="mt-4">
                      <DurationPicker
                        value={formDuration}
                        onChange={setFormDuration}
                      />
                    </div>
                  </div>
                ) : isPriest ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-stone-200 md:col-span-2">
                    Saving content changes keeps the current countdown. Use the
                    Timer action on the display card to replace or extend it.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-200/20 bg-amber-200/10 p-4 text-sm text-amber-50 md:col-span-2">
                    A priest will choose the public visibility duration during
                    approval. The countdown starts at the moment of approval.
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="label">Public note</label>
                  <textarea
                    className="input min-h-28"
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <label className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-stone-100">
                <input
                  checked={form.isActive}
                  type="checkbox"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                />
                Active when approved and while its countdown is running
              </label>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary justify-center"
                  disabled={
                    saveMutation.isPending ||
                    (editorNeedsDuration && !toDurationMinutes(formDuration))
                  }
                  type="submit"
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save display'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {reviewItem ? (
        <div className="modal-backdrop" onClick={closeReview}>
          <div
            className="modal-shell"
            onClick={(event) => event.stopPropagation()}
          >
            <section className="panel modal-card max-w-2xl p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                    Priest approval
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    {reviewItem.title || reviewItem.fundAccountName}
                  </h3>
                  <p className="mt-2 text-sm text-stone-300">
                    {formatKes(reviewItem.totalAmount)} net across{' '}
                    {reviewItem.contributionCount} confirmed contributions.
                  </p>
                </div>
                <button
                  aria-label="Close approval"
                  className="shell-icon-button"
                  type="button"
                  onClick={closeReview}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                <div>
                  <label className="label">Public approval duration</label>
                  <DurationPicker
                    value={reviewDuration}
                    onChange={setReviewDuration}
                  />
                  <p className="mt-2 text-xs text-stone-400">
                    Approval starts this timer immediately. The public display
                    is removed automatically when it reaches zero.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Approval note</label>
                  <textarea
                    className="input min-h-24"
                    value={reviewForm.note}
                    onChange={(event) =>
                      setReviewForm((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                    placeholder="Optional internal note"
                  />
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  className="btn-secondary justify-center"
                  disabled={reviewMutation.isPending}
                  type="button"
                  onClick={() => reviewMutation.mutate('reject')}
                >
                  <XCircle size={17} />
                  Reject
                </button>
                <button
                  className="btn-primary justify-center"
                  disabled={
                    reviewMutation.isPending ||
                    !toDurationMinutes(reviewDuration)
                  }
                  type="button"
                  onClick={() => reviewMutation.mutate('approve')}
                >
                  <CheckCircle2 size={17} />
                  Approve and start timer
                </button>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {timerItem ? (
        <div className="modal-backdrop" onClick={() => setTimerItem(null)}>
          <div
            className="modal-shell"
            onClick={(event) => event.stopPropagation()}
          >
            <section className="panel modal-card max-w-2xl p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                    Approval timer
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    {timerItem.title || timerItem.fundAccountName}
                  </h3>
                  <p className="mt-2 text-sm text-stone-300">
                    Current remaining time:{' '}
                    <span className="font-semibold text-amber-100">
                      {formatRemaining(timerItem.visibleUntil, now)}
                    </span>
                  </p>
                </div>
                <button
                  aria-label="Close timer"
                  className="shell-icon-button"
                  type="button"
                  onClick={() => setTimerItem(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className={`duration-mode ${
                      timerMode === 'extend' ? 'is-active' : ''
                    }`}
                    type="button"
                    onClick={() => setTimerMode('extend')}
                  >
                    <Clock3 size={18} />
                    <span>
                      <strong>Extend timer</strong>
                      <small>Add the duration to the current expiry.</small>
                    </span>
                  </button>
                  <button
                    className={`duration-mode ${
                      timerMode === 'replace' ? 'is-active' : ''
                    }`}
                    type="button"
                    onClick={() => setTimerMode('replace')}
                  >
                    <CalendarClock size={18} />
                    <span>
                      <strong>Replace timer</strong>
                      <small>Start a fresh duration from now.</small>
                    </span>
                  </button>
                </div>
                <DurationPicker
                  value={timerDuration}
                  onChange={setTimerDuration}
                />
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={() => setTimerItem(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary justify-center"
                  disabled={
                    timerMutation.isPending || !toDurationMinutes(timerDuration)
                  }
                  type="button"
                  onClick={() => timerMutation.mutate()}
                >
                  {timerMutation.isPending
                    ? 'Updating...'
                    : timerMode === 'extend'
                      ? 'Extend timer'
                      : 'Replace timer'}
                </button>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
