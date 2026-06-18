import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Edit3,
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
  visibleFrom: string;
  visibleUntil: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function toLocalDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
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
    visibleFrom: toLocalDateTime(new Date().toISOString()),
    visibleUntil: '',
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

export default function ChurchFundDisplays() {
  const queryClient = useQueryClient();
  const session = getSession();
  const isPriest =
    session?.user?.role === 'priest' ||
    session?.user?.role === 'church_admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedReviewId = searchParams.get('review');
  const openedReviewId = useRef<string | null>(null);
  const [editorItem, setEditorItem] = useState<any | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [form, setForm] = useState<FundDisplayForm>(createInitialForm());
  const [reviewItem, setReviewItem] = useState<any | null>(null);
  const [reviewForm, setReviewForm] = useState({
    visibleFrom: '',
    visibleUntil: '',
    note: '',
  });

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
    setReviewForm({ visibleFrom: '', visibleUntil: '', note: '' });
    if (requestedReviewId) {
      setSearchParams({}, { replace: true });
    }
  };

  const openReview = (item: any) => {
    setReviewItem(item);
    setReviewForm({
      visibleFrom:
        toLocalDateTime(item.visibleFrom) ||
        toLocalDateTime(new Date().toISOString()),
      visibleUntil: toLocalDateTime(item.visibleUntil),
      note: item.approvalNote || '',
    });
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
      const payload = {
        ...form,
        endDate: form.endMode === 'static' ? form.endDate : null,
        visibleFrom: isPriest ? toIsoDateTime(form.visibleFrom) : null,
        visibleUntil: isPriest ? toIsoDateTime(form.visibleUntil) : null,
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
              visibleFrom: toIsoDateTime(reviewForm.visibleFrom),
              visibleUntil: toIsoDateTime(reviewForm.visibleUntil),
              note: reviewForm.note,
            }
          : { note: reviewForm.note },
      ),
    onSuccess: (_, action) => {
      toast.success(
        action === 'approve' ? 'Fund display approved' : 'Fund display rejected',
      );
      closeReview();
      refreshDisplays();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to review display');
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
      visibleFrom: toLocalDateTime(item.visibleFrom),
      visibleUntil: toLocalDateTime(item.visibleUntil),
    });
    setIsEditorOpen(true);
  };

  return (
    <div className="fund-displays-page space-y-5">
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
              Control which net collection totals appear publicly and exactly
              when visitors can see them.
            </p>
          </div>
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
      </section>

      <section className="fund-display-list grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {isLoading ? (
          <div className="panel p-6 text-stone-300">Loading fund displays...</div>
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
                    Net total
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
                    {item.startDate} - {item.endMode === 'static' ? item.endDate : 'to date'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Public from</dt>
                  <dd className="text-right text-white">
                    {formatDateTime(item.visibleFrom)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Public until</dt>
                  <dd className="text-right text-white">
                    {formatDateTime(item.visibleUntil)}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
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
          <div className="modal-shell" onClick={(event) => event.stopPropagation()}>
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
                {isPriest ? (
                  <>
                    <div>
                      <label className="label">Public from</label>
                      <input
                        className="input"
                        required
                        type="datetime-local"
                        value={form.visibleFrom}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            visibleFrom: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Public until</label>
                      <input
                        className="input"
                        required
                        type="datetime-local"
                        value={form.visibleUntil}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            visibleUntil: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-amber-200/20 bg-amber-200/10 p-4 text-sm text-amber-50 md:col-span-2">
                    A priest will choose the public visibility window during
                    approval.
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
                Active when approved and inside the visibility window
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
                  disabled={saveMutation.isPending}
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
          <div className="modal-shell" onClick={(event) => event.stopPropagation()}>
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

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Public from</label>
                  <div className="relative">
                    <CalendarClock
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
                      size={17}
                    />
                    <input
                      className="input pl-11"
                      required
                      type="datetime-local"
                      value={reviewForm.visibleFrom}
                      onChange={(event) =>
                        setReviewForm((current) => ({
                          ...current,
                          visibleFrom: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Public until</label>
                  <div className="relative">
                    <Clock3
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
                      size={17}
                    />
                    <input
                      className="input pl-11"
                      required
                      type="datetime-local"
                      value={reviewForm.visibleUntil}
                      onChange={(event) =>
                        setReviewForm((current) => ({
                          ...current,
                          visibleUntil: event.target.value,
                        }))
                      }
                    />
                  </div>
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
                    !reviewForm.visibleFrom ||
                    !reviewForm.visibleUntil
                  }
                  type="button"
                  onClick={() => reviewMutation.mutate('approve')}
                >
                  <CheckCircle2 size={17} />
                  Approve window
                </button>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
