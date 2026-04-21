import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CountdownBadge } from '../../components/CountdownBadge';
import api from '../../services/api';

const initialDashboardFilters = {
  from: '',
  to: '',
  fundAccountId: '',
};

const chartPalette = [
  '#34d399',
  '#22c55e',
  '#86efac',
  '#14b8a6',
  '#a3e635',
  '#4ade80',
  '#10b981',
];

type DashboardFilters = typeof initialDashboardFilters;

function toQueryString(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  return params.toString();
}

function formatShortDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-KE', {
    month: 'short',
    day: 'numeric',
  });
}

function TrendChart({ data }: { data: any[] }) {
  if (!data.length) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-white/10 bg-black/10 p-6 text-center text-sm text-stone-300">
        No contribution trend yet for the selected filters.
      </div>
    );
  }

  const width = 760;
  const height = 280;
  const padding = 34;
  const maxAmount = Math.max(
    1,
    ...data.map((item) => Number(item.totalAmount || 0)),
  );
  const xFor = (index: number) =>
    data.length === 1
      ? width / 2
      : padding + (index / (data.length - 1)) * (width - padding * 2);
  const yFor = (amount: number) =>
    height - padding - (amount / maxAmount) * (height - padding * 2);
  const points = data
    .map((item, index) => `${xFor(index)},${yFor(Number(item.totalAmount || 0))}`)
    .join(' ');
  const areaPoints = `${padding},${height - padding} ${points} ${
    width - padding
  },${height - padding}`;

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/10 p-4">
      <svg
        aria-label="Contribution trend chart"
        className="h-[280px] w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.36" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => {
          const y = padding + (line / 3) * (height - padding * 2);
          return (
            <line
              key={line}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="5 8"
              x1={padding}
              x2={width - padding}
              y1={y}
              y2={y}
            />
          );
        })}
        <polygon fill="url(#trendFill)" points={areaPoints} />
        <polyline
          fill="none"
          points={points}
          stroke="#34d399"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {data.map((item, index) => (
          <circle
            key={item.date}
            cx={xFor(index)}
            cy={yFor(Number(item.totalAmount || 0))}
            fill="#0f172a"
            r="6"
            stroke="#34d399"
            strokeWidth="3"
          />
        ))}
      </svg>
      <div className="mt-4 flex items-center justify-between gap-4 text-xs text-stone-400">
        <span>{formatShortDate(data[0].date)}</span>
        <span className="text-stone-300">
          Peak KES {Number(maxAmount || 0).toLocaleString()}
        </span>
        <span>{formatShortDate(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}

function FundSplitChart({
  items,
  buildLedgerPath,
}: {
  items: any[];
  buildLedgerPath: (overrides?: Partial<DashboardFilters>) => string;
}) {
  const activeItems = items.filter((item) => Number(item.totalAmount || 0) > 0);
  const total = activeItems.reduce(
    (sum, item) => sum + Number(item.totalAmount || 0),
    0,
  );

  if (!activeItems.length || total <= 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-white/10 bg-black/10 p-6 text-center text-sm text-stone-300">
        No account split yet for the selected dates.
      </div>
    );
  }

  let cursor = 0;
  const segments = activeItems
    .map((item, index) => {
      const start = cursor;
      const size = (Number(item.totalAmount || 0) / total) * 100;
      cursor += size;
      return `${chartPalette[index % chartPalette.length]} ${start}% ${cursor}%`;
    })
    .join(', ');

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr] xl:grid-cols-1 2xl:grid-cols-[220px_1fr]">
      <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-full border border-white/10 bg-black/20 p-4">
        <div
          className="h-full w-full rounded-full"
          style={{ background: `conic-gradient(${segments})` }}
        />
      </div>
      <div className="space-y-3">
        {activeItems.map((item, index) => {
          const percentage = (Number(item.totalAmount || 0) / total) * 100;
          return (
            <Link
              key={item.fundAccountId}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 transition hover:bg-white/5"
              to={buildLedgerPath({ fundAccountId: item.fundAccountId })}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{
                    background: chartPalette[index % chartPalette.length],
                  }}
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">
                    {item.fundAccountName}
                  </p>
                  <p className="text-xs text-stone-400">
                    {percentage.toFixed(1)}% of filtered funds
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold text-amber-100">
                KES {Number(item.totalAmount || 0).toLocaleString()}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function ChurchDashboard() {
  const [filters, setFilters] = useState<DashboardFilters>(
    initialDashboardFilters,
  );
  const queryString = useMemo(() => toQueryString(filters), [filters]);

  const { data, isLoading } = useQuery({
    queryKey: ['church-dashboard', queryString],
    queryFn: () =>
      api
        .get(`/church/dashboard${queryString ? `?${queryString}` : ''}`)
        .then((response) => response.data),
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return <div className="panel p-6 text-stone-300">Loading dashboard...</div>;
  }

  const totals = data?.reportSummary?.totals || {};
  const accountKpis = data?.reportSummary?.accountKpis || [];
  const trendByDate = data?.reportSummary?.trendByDate || [];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const buildLedgerPath = (overrides: Partial<DashboardFilters> = {}) => {
    const params = new URLSearchParams({
      ...filters,
      ...overrides,
      status: 'confirmed',
    });

    [...params.entries()].forEach(([key, value]) => {
      if (!value) {
        params.delete(key);
      }
    });

    return `/church/contributions?${params.toString()}`;
  };
  const overviewKpis = [
    {
      label: 'Confirmed Contributions',
      value: totals.contributionCount || 0,
      to: buildLedgerPath(),
    },
    {
      label: 'Total Collections',
      value: `KES ${Number(totals.totalAmount || 0).toLocaleString()}`,
      to: buildLedgerPath(),
    },
    {
      label: 'M-Pesa Collections',
      value: `KES ${Number(totals.mpesaAmount || 0).toLocaleString()}`,
      to: `/church/contributions?${toQueryString({
        ...filters,
        channel: 'mpesa',
        status: 'confirmed',
      })}`,
    },
    {
      label: 'Cash Collections',
      value: `KES ${Number(totals.cashAmount || 0).toLocaleString()}`,
      to: `/church/contributions?${toQueryString({
        ...filters,
        channel: 'manual_cash',
        status: 'confirmed',
      })}`,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Dashboard Analytics
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Contribution trends and fund split
            </h3>
            <p className="mt-2 text-sm text-stone-300">
              Filter the dashboard by date range or fund account to compare
              performance without leaving the overview.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4 2xl:min-w-[780px]">
            <div>
              <label className="label-compact">From</label>
              <input
                className="input-compact mt-1.5"
                type="date"
                value={filters.from}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="label-compact">To</label>
              <input
                className="input-compact mt-1.5"
                type="date"
                value={filters.to}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="label-compact">Fund Account</label>
              <select
                className="input-compact mt-1.5"
                value={filters.fundAccountId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    fundAccountId: event.target.value,
                  }))
                }
              >
                <option value="">All accounts</option>
                {accountKpis.map((item: any) => (
                  <option key={item.fundAccountId} value={item.fundAccountId}>
                    {item.fundAccountName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                className="btn-secondary w-full justify-center"
                disabled={activeFilterCount === 0}
                type="button"
                onClick={() => setFilters(initialDashboardFilters)}
              >
                Clear filters
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="overview-stat-grid">
        {overviewKpis.map(({ label, value, to }) => (
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
              Open ledger
            </p>
          </Link>
        ))}
      </div>

      <div className="overview-shell-grid">
        <section className="panel p-6 xl:col-span-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Contribution Trend
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Daily collections over time
              </h3>
            </div>
            <p className="max-w-xl text-sm text-stone-300">
              Tracks confirmed contribution totals using the selected date and
              account filters.
            </p>
          </div>
          <div className="mt-5">
            <TrendChart data={trendByDate} />
          </div>
        </section>

        <section className="panel p-6 xl:col-span-4">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            Fund Split
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Account share
          </h3>
          <p className="mt-2 text-sm text-stone-300">
            See how filtered funds are distributed across contribution accounts.
          </p>
          <div className="mt-5">
            <FundSplitChart
              buildLedgerPath={buildLedgerPath}
              items={accountKpis}
            />
          </div>
        </section>

        <section className="space-y-5 xl:col-span-5">
          <CountdownBadge
            status={data.subscription.status}
            expiresAt={data.subscription.expiresAt}
            graceEndsAt={data.subscription.graceEndsAt}
            label={data.subscription.countdown?.label}
            variant="card"
          />

          <div className="panel overview-panel-tall p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Fund Performance
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Contributions by account
            </h3>
            <p className="mt-2 text-sm text-stone-300">
              Every active fund account appears here. Open any card to inspect
              its ledger entries.
            </p>
            <div className="mt-5 grid gap-3 2xl:grid-cols-2">
              {accountKpis.map((item: any) => (
                <Link
                  key={item.fundAccountId}
                  className="rounded-3xl border border-white/10 bg-black/10 p-4 transition hover:-translate-y-0.5 hover:bg-white/5"
                  to={buildLedgerPath({ fundAccountId: item.fundAccountId })}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-semibold text-white">
                        {item.fundAccountName}
                      </h4>
                      <p className="text-sm text-stone-400">
                        {item.count} confirmed contributions
                      </p>
                    </div>
                    <div className="text-lg font-semibold text-amber-100">
                      KES {Number(item.totalAmount || 0).toLocaleString()}
                    </div>
                  </div>
                </Link>
              ))}
              {accountKpis.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-black/10 p-4 text-sm text-stone-300">
                  No active fund accounts yet.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="table-shell overview-panel-xl xl:col-span-7">
          <div className="border-b border-white/10 px-6 py-5">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Recent Ledger
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Latest contributions
            </h3>
          </div>
          <div className="table-scroll-region">
            <table>
              <thead>
                <tr>
                  <th>Contributor</th>
                  <th>Fund Account</th>
                  <th>Channel</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data.reportSummary?.recentContributions || []).map((item: any) => (
                  <tr key={item.id}>
                    <td>
                      <div className="font-medium text-white">
                        {item.contributor?.name || 'Unknown'}
                      </div>
                      <div className="text-xs text-stone-400">
                        {item.contributor?.phone || '-'}
                      </div>
                    </td>
                    <td>{item.fundAccountId ? item.fundAccountName : 'General'}</td>
                    <td>{item.channel}</td>
                    <td>KES {Number(item.amount || 0).toLocaleString()}</td>
                    <td>{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
