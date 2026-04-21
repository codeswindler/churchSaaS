import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Filter, Search, WalletCards, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';

const initialManualForm = {
  name: '',
  phone: '',
  amount: '',
  fundAccountId: '',
  channel: 'mpesa',
  paymentReference: '',
  notes: '',
};

type ManualFormState = typeof initialManualForm;

export default function ChurchContributions() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const readFiltersFromSearch = () => ({
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
    fundAccountId: searchParams.get('fundAccountId') || '',
    channel: searchParams.get('channel') || '',
    status: searchParams.get('status') || '',
    contributor: searchParams.get('contributor') || '',
  });
  const [filters, setFilters] = useState(readFiltersFromSearch);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [manualForm, setManualForm] = useState(initialManualForm);
  const contributorNameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const nextFilters = readFiltersFromSearch();
    setFilters(nextFilters);
    if (Object.values(nextFilters).some(Boolean)) {
      setIsFiltersOpen(true);
    }
  }, [searchParams]);

  const defaultFilters = {
    from: '',
    to: '',
    fundAccountId: '',
    channel: '',
    status: '',
    contributor: '',
  };

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    return params.toString();
  }, [filters]);

  const { data: fundAccounts } = useQuery({
    queryKey: ['church-fund-accounts'],
    queryFn: () =>
      api.get('/church/fund-accounts').then((response) => response.data),
  });

  const { data: contributions, isLoading } = useQuery({
    queryKey: ['church-contributions', queryString],
    queryFn: () =>
      api
        .get(`/church/contributions${queryString ? `?${queryString}` : ''}`)
        .then((response) => response.data),
  });

  const manualMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/church/contributions/manual', {
        ...manualForm,
        amount: Number(manualForm.amount),
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Contribution recorded');
      setManualForm(initialManualForm);
      setIsManualEntryOpen(false);
      queryClient.invalidateQueries({ queryKey: ['church-contributions'] });
      queryClient.invalidateQueries({ queryKey: ['church-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['church-reports-summary'] });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to record contribution',
      );
    },
  });

  useEffect(() => {
    if (!isManualEntryOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.requestAnimationFrame(() => {
      contributorNameRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsManualEntryOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isManualEntryOpen]);

  const updateManualForm = <K extends keyof ManualFormState>(
    key: K,
    value: ManualFormState[K],
  ) => {
    setManualForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const closeManualEntryModal = () => {
    if (manualMutation.isPending) {
      return;
    }

    setIsManualEntryOpen(false);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Received Funds
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Record received contributions
            </h3>
            <p className="mt-3 max-w-3xl text-sm text-stone-300">
              Update cash and M-Pesa payments done outside the system so the
              contribution ledger, filters, and reports stay clean and easy to review.
            </p>
          </div>

          <button
            className="btn-primary justify-center lg:self-start"
            type="button"
            onClick={() => setIsManualEntryOpen(true)}
          >
            <WalletCards size={16} />
            Receive funds
          </button>
        </div>
      </section>

      <section className="table-shell">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-white">
                Cash and M-Pesa entries
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-stone-300">
                Filter by date, contributor, account, channel, or status from one
                aligned ledger workspace.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-2 text-sm text-stone-300">
              <Search size={15} />
              {(contributions || []).length} rows
            </div>
          </div>
        </div>

        <div className="border-b border-white/10 px-5 py-5 xl:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-amber-200" />
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                Filters
              </p>
              {activeFilterCount > 0 ? (
                <span className="badge border-white/10 bg-white/5 text-stone-200">
                  {activeFilterCount} active
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {activeFilterCount > 0 ? (
                <button
                  className="btn-secondary px-3 py-2"
                  type="button"
                  onClick={() => {
                    setSearchParams({});
                    setFilters(defaultFilters);
                  }}
                >
                  Clear
                </button>
              ) : null}
              <button
                aria-expanded={isFiltersOpen}
                className="btn-secondary px-3 py-2 xl:hidden"
                type="button"
                onClick={() => setIsFiltersOpen((current) => !current)}
              >
                {isFiltersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {isFiltersOpen ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div
            className={`ledger-filter-grid mt-5 ${
              isFiltersOpen ? 'grid' : 'hidden'
            }`}
          >
            {[
              ['from', 'From date', 'date'],
              ['to', 'To date', 'date'],
              ['contributor', 'Contributor', 'text'],
            ].map(([key, label, type]) => (
              <div key={key} className="min-w-0 space-y-1.5">
                <label className="label-compact">{label}</label>
                <input
                  className="input-compact"
                  type={type}
                  value={(filters as any)[key]}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}

            <div className="min-w-0 space-y-1.5">
              <label className="label-compact">Fund account</label>
              <select
                className="input-compact"
                value={filters.fundAccountId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    fundAccountId: event.target.value,
                  }))
                }
              >
                <option value="">All accounts</option>
                {(fundAccounts || []).map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0 space-y-1.5">
              <label className="label-compact">Channel</label>
              <select
                className="input-compact"
                value={filters.channel}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    channel: event.target.value,
                  }))
                }
              >
                <option value="">All channels</option>
                <option value="manual_cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
              </select>
            </div>

            <div className="min-w-0 space-y-1.5">
              <label className="label-compact">Status</label>
              <select
                className="input-compact"
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option value="">All statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-stone-300">Loading contributions...</div>
        ) : (
          <div className="table-scroll-region">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Contributor</th>
                  <th>Fund Account</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {(contributions || []).map((item: any) => (
                  <tr key={item.id}>
                    <td className="mono text-xs">
                      {new Date(item.receivedAt || item.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <div className="font-medium text-white">
                        {item.contributor?.name || 'Unknown'}
                      </div>
                      <div className="text-xs text-stone-400">
                        {item.contributor?.phone || '-'}
                      </div>
                    </td>
                    <td>{item.fundAccountId ? item.fundAccountName : 'General'}</td>
                    <td>{item.channel === 'manual_cash' ? 'Cash' : 'M-Pesa'}</td>
                    <td>{item.status}</td>
                    <td>KES {Number(item.amount || 0).toLocaleString()}</td>
                    <td>{item.receiptMessageSent ? 'Sent' : 'Pending / failed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isManualEntryOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => closeManualEntryModal()}
        >
          <div className="modal-shell">
            <section
              aria-labelledby="record-contribution-title"
              aria-modal="true"
              className="panel modal-card p-6 sm:p-7"
              role="dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Receive Funds
                  </p>
                  <h3
                    id="record-contribution-title"
                    className="mt-2 text-2xl font-semibold text-white"
                  >
                    Record received funds
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-stone-300">
                    Capture cash or M-Pesa payment details in a focused form, then
                    return to the ledger without losing context.
                  </p>
                </div>

                <button
                  aria-label="Close contribution form"
                  className="btn-secondary px-3 py-2"
                  type="button"
                  onClick={closeManualEntryModal}
                >
                  <X size={16} />
                </button>
              </div>

              <form
                className="mt-6 grid gap-4 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  manualMutation.mutate();
                }}
              >
                {[
                  ['name', 'Contributor name'],
                  ['phone', 'Phone number'],
                  ['amount', 'Amount'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <input
                      ref={key === 'name' ? contributorNameRef : undefined}
                      className="input"
                      value={manualForm[key as keyof ManualFormState]}
                      onChange={(event) =>
                        updateManualForm(
                          key as keyof ManualFormState,
                          event.target.value as never,
                        )
                      }
                    />
                  </div>
                ))}

                <div>
                  <label className="label">Payment channel</label>
                  <select
                    className="input"
                    value={manualForm.channel}
                    onChange={(event) =>
                      updateManualForm('channel', event.target.value)
                    }
                  >
                    <option value="mpesa">M-Pesa</option>
                    <option value="manual_cash">Cash</option>
                  </select>
                </div>

                <div>
                  <label className="label">
                    {manualForm.channel === 'mpesa'
                      ? 'M-Pesa receipt number'
                      : 'Payment reference'}
                  </label>
                  <input
                    className="input"
                    required={manualForm.channel === 'mpesa'}
                    value={manualForm.paymentReference}
                    onChange={(event) =>
                      updateManualForm('paymentReference', event.target.value)
                    }
                  />
                </div>

                <div>
                  <label className="label">Fund account</label>
                  <select
                    className="input"
                    value={manualForm.fundAccountId}
                    onChange={(event) =>
                      updateManualForm('fundAccountId', event.target.value)
                    }
                  >
                    <option value="">Select account</option>
                    {(fundAccounts || []).map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="label">Notes</label>
                  <textarea
                    className="input min-h-28"
                    value={manualForm.notes}
                    onChange={(event) => updateManualForm('notes', event.target.value)}
                  />
                </div>

                <div className="md:col-span-2 flex gap-3">
                  <button
                    className="btn-secondary flex-1 justify-center"
                    type="button"
                    onClick={closeManualEntryModal}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary flex-1 justify-center"
                    type="submit"
                  >
                    {manualMutation.isPending ? 'Saving...' : 'Record contribution'}
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
