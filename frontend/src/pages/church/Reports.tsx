import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  Filter,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import api from '../../services/api';

export default function ChurchReports() {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    fundAccountId: '',
    channel: '',
    status: '',
  });

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

  const { data, isLoading } = useQuery({
    queryKey: ['church-reports-summary', queryString],
    queryFn: () =>
      api
        .get(`/church/reports/summary${queryString ? `?${queryString}` : ''}`)
        .then((response) => response.data),
  });

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const generalFundAccountId =
    (fundAccounts || []).find((item: any) => item.code === 'general')?.id || '';
  const buildLedgerPath = (overrides: Partial<typeof filters> = {}) => {
    const params = new URLSearchParams();
    const status = overrides.status ?? filters.status;
    const nextFilters = {
      ...filters,
      ...overrides,
      status: status || 'confirmed',
    };

    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    return `/church/contributions?${params.toString()}`;
  };

  const downloadReport = async (format: 'csv' | 'pdf') => {
    try {
      const response = await api.get(
        `/church/reports/export?${queryString ? `${queryString}&` : ''}format=${format}`,
        { responseType: 'blob' },
      );

      const blob = new Blob([response.data], {
        type: response.headers['content-type'],
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        format === 'csv' ? 'church-report.csv' : 'church-report.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${format.toUpperCase()} report`);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to export report');
    }
  };

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Report Filters
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Date, account, and channel analysis
            </h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn-secondary" onClick={() => downloadReport('csv')}>
              <FileSpreadsheet size={16} />
              Export CSV
            </button>
            <button className="btn-primary" onClick={() => downloadReport('pdf')}>
              <Download size={16} />
              Export PDF
            </button>
          </div>
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
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

          <div
            className={`report-filter-grid mt-5 ${
              isFiltersOpen ? 'grid' : 'hidden'
            }`}
          >
            {[
              ['from', 'From', 'date'],
              ['to', 'To', 'date'],
            ].map(([key, label, type]) => (
              <div key={key} className="min-w-0 space-y-2">
                <label className="label">{label}</label>
                <input
                  className="input"
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

            <div className="min-w-0 space-y-2">
              <label className="label">Fund account</label>
              <select
                className="input"
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

            <div className="min-w-0 space-y-2">
              <label className="label">Channel</label>
              <select
                className="input"
                value={filters.channel}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    channel: event.target.value,
                  }))
                }
              >
                <option value="">All channels</option>
                <option value="manual_cash">Manual cash</option>
                <option value="mpesa">M-Pesa</option>
              </select>
            </div>

            <div className="min-w-0 space-y-2">
              <label className="label">Status</label>
              <select
                className="input"
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
      </section>

      {isLoading ? (
        <div className="panel p-6 text-stone-300">Loading report data...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Contribution Count',
                value: data?.totals?.contributionCount || 0,
                to: buildLedgerPath(),
              },
              {
                label: 'Total Amount',
                value: `KES ${Number(data?.totals?.totalAmount || 0).toLocaleString()}`,
                to: buildLedgerPath(),
              },
              {
                label: 'M-Pesa Amount',
                value: `KES ${Number(data?.totals?.mpesaAmount || 0).toLocaleString()}`,
                to: buildLedgerPath({ channel: 'mpesa' }),
              },
              {
                label: 'Cash Amount',
                value: `KES ${Number(data?.totals?.cashAmount || 0).toLocaleString()}`,
                to: buildLedgerPath({ channel: 'manual_cash' }),
              },
            ].map(({ label, value, to }) => (
              <Link
                key={label}
                className="stat-card block transition hover:-translate-y-0.5 hover:bg-white/5"
                to={to}
              >
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  {label}
                </p>
                <div className="mt-5 text-3xl font-semibold text-white">{value}</div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
                  View transactions
                </p>
              </Link>
            ))}
          </div>

          <section className="panel p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Performance by Fund Account
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Ranked contribution accounts
            </h3>

            <div className="mt-5 space-y-3">
              {(data?.byFundAccount || []).map((item: any) => (
                <Link
                  key={item.fundAccountName}
                  className="block rounded-3xl border border-white/10 bg-black/10 p-4 transition hover:-translate-y-0.5 hover:bg-white/5"
                  to={buildLedgerPath(
                    item.fundAccountId || item.code === 'general'
                      ? {
                          fundAccountId:
                            item.fundAccountId || generalFundAccountId,
                        }
                      : {},
                  )}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-semibold text-white">
                        {item.fundAccountName}
                      </h4>
                      <p className="text-sm text-stone-400">{item.count} contributions</p>
                    </div>
                    <div className="text-lg font-semibold text-amber-100">
                      KES {Number(item.totalAmount || 0).toLocaleString()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
