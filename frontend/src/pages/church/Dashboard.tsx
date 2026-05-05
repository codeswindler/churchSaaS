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

const trendColor = '#34d399';
const fundSplitPalette = [
  '#34d399',
  '#60a5fa',
  '#f59e0b',
  '#f472b6',
  '#a78bfa',
  '#22d3ee',
  '#fb7185',
  '#84cc16',
  '#f97316',
  '#c084fc',
];

type DashboardFilters = typeof initialDashboardFilters;
type TrendGranularity = 'daily' | 'monthly' | 'yearly';

const trendGranularityOptions: Array<{
  value: TrendGranularity;
  label: string;
}> = [
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

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

function formatLongDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-KE', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMonthLabel(value: string) {
  return new Date(`${value.slice(0, 7)}-01T00:00:00`).toLocaleDateString(
    'en-KE',
    {
      month: 'short',
      year: 'numeric',
    },
  );
}

function formatMoney(value: number) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function formatCompactMoney(value: number) {
  if (value >= 1000000) {
    return `KES ${(value / 1000000).toFixed(1)}M`;
  }

  if (value >= 1000) {
    return `KES ${Math.round(value / 1000)}K`;
  }

  return formatMoney(value);
}

function getMonthEnd(value: string) {
  const [year, month] = value.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(
    2,
    '0',
  )}`;
}

function getPeriodForDate(value: string, granularity: TrendGranularity) {
  if (granularity === 'yearly') {
    const year = value.slice(0, 4);
    return {
      key: year,
      date: `${year}-01-01`,
      ledgerFrom: `${year}-01-01`,
      ledgerTo: `${year}-12-31`,
      shortLabel: year,
      selectedLabel: year,
    };
  }

  if (granularity === 'monthly') {
    const month = value.slice(0, 7);
    const date = `${month}-01`;
    const label = formatMonthLabel(date);
    return {
      key: month,
      date,
      ledgerFrom: date,
      ledgerTo: getMonthEnd(date),
      shortLabel: label,
      selectedLabel: label,
    };
  }

  return {
    key: value,
    date: value,
    ledgerFrom: value,
    ledgerTo: value,
    shortLabel: formatShortDate(value),
    selectedLabel: formatLongDate(value),
  };
}

function aggregateTrendData(data: any[], granularity: TrendGranularity) {
  const buckets = new Map<string, any>();

  data.forEach((item) => {
    if (!item?.date) return;
    const period = getPeriodForDate(item.date, granularity);
    const current = buckets.get(period.key) || {
      ...period,
      totalAmount: 0,
      count: 0,
    };

    current.totalAmount += Number(item.totalAmount || 0);
    current.count += Number(item.count || 0);
    buckets.set(period.key, current);
  });

  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function TrendChart({
  data,
  buildLedgerPath,
  granularity,
}: {
  data: any[];
  buildLedgerPath: (overrides?: Partial<DashboardFilters>) => string;
  granularity: TrendGranularity;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);

  if (!data.length) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-white/10 bg-black/10 p-6 text-center text-sm text-stone-300">
        No contribution trend yet for the selected filters.
      </div>
    );
  }

  const height = 320;
  const paddingLeft = 104;
  const paddingRight = 48;
  const paddingTop = 34;
  const paddingBottom = 34;
  const pointGap =
    granularity === 'daily' ? 44 : granularity === 'monthly' ? 96 : 96;
  const minPlotWidth = 760;
  const naturalPlotWidth = Math.max(1, Math.max(data.length - 1, 1) * pointGap);
  const plotWidth = Math.max(minPlotWidth, naturalPlotWidth);
  const width = paddingLeft + paddingRight + plotWidth;
  const baselineY = height - paddingBottom;
  const plotOffsetX =
    data.length > 1 ? Math.max(0, (plotWidth - naturalPlotWidth) / 2) : 0;
  const maxAmount = Math.max(
    1,
    ...data.map((item) => Number(item.totalAmount || 0)),
  );
  const xFor = (index: number) =>
    data.length === 1
      ? paddingLeft + plotWidth / 2
      : paddingLeft + plotOffsetX + index * pointGap;
  const yFor = (amount: number) =>
    height -
    paddingBottom -
    (amount / maxAmount) * (height - paddingTop - paddingBottom);
  const points = data.map((item, index) => ({
    ...item,
    x: xFor(index),
    y: yFor(Number(item.totalAmount || 0)),
    amount: Number(item.totalAmount || 0),
    count: Number(item.count || 0),
  }));
  const pointString = points.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPoints =
    points.length === 1
      ? `${Math.max(paddingLeft, points[0].x - pointGap / 2)},${baselineY} ${Math.max(
          paddingLeft,
          points[0].x - pointGap / 2,
        )},${points[0].y} ${Math.min(
          width - paddingRight,
          points[0].x + pointGap / 2,
        )},${points[0].y} ${Math.min(
          width - paddingRight,
          points[0].x + pointGap / 2,
        )},${baselineY}`
      : `${points[0].x},${baselineY} ${pointString} ${
          points[points.length - 1].x
        },${baselineY}`;
  const safePinnedIndex =
    pinnedIndex === null
      ? points.length - 1
      : Math.min(pinnedIndex, points.length - 1);
  const safeHoveredIndex =
    hoveredIndex === null ? null : Math.min(hoveredIndex, points.length - 1);
  const activeIndex = safeHoveredIndex ?? safePinnedIndex;
  const activePoint = points[activeIndex];
  const hitWidth = Math.max(24, pointGap);
  const tooltipWidth = 154;
  const tooltipX = Math.min(
    Math.max(activePoint.x - tooltipWidth / 2, paddingLeft),
    width - paddingRight - tooltipWidth,
  );
  const tooltipY = Math.max(activePoint.y - 58, paddingTop + 2);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = maxAmount * ratio;
    return {
      label: formatCompactMoney(value),
      y: yFor(value),
    };
  });
  const selectedKind =
    granularity === 'daily'
      ? 'day'
      : granularity === 'monthly'
        ? 'month'
        : 'year';

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/10 p-4"
      onMouseLeave={() => setHoveredIndex(null)}
    >
      <Link
        className="absolute right-5 top-5 z-10 rounded-full border border-amber-200/25 bg-stone-950/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200 shadow-lg shadow-black/20 backdrop-blur hover:border-amber-100/40 hover:text-amber-100"
        to={buildLedgerPath({
          from: activePoint.ledgerFrom,
          to: activePoint.ledgerTo,
        })}
      >
        Open {selectedKind} ledger
      </Link>

      <div className="-mx-1 overflow-x-auto pb-1">
        <svg
          aria-label="Contribution trend chart"
          className="h-[340px] max-w-none"
          preserveAspectRatio="none"
          style={{ width: `${width}px` }}
          viewBox={`0 0 ${width} ${height}`}
        >
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={trendColor} stopOpacity="0.36" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0.03" />
          </linearGradient>
          <filter id="trendGlow" height="180%" width="180%" x="-40%" y="-40%">
            <feGaussianBlur result="blur" stdDeviation="4" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {yTicks.map((tick) => (
          <g key={tick.label}>
            <line
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="5 8"
              x1={paddingLeft}
              x2={width - paddingRight}
              y1={tick.y}
              y2={tick.y}
            />
            <text
              fill="rgba(231,229,228,0.48)"
              fontSize="10"
              textAnchor="end"
              x={paddingLeft - 12}
              y={tick.y + 4}
            >
              {tick.label}
            </text>
          </g>
        ))}
        <polygon fill="url(#trendFill)" points={areaPoints} />
        <polyline
          fill="none"
          filter="url(#trendGlow)"
          points={pointString}
          stroke={trendColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {activePoint ? (
          <line
            stroke="rgba(52,211,153,0.32)"
            strokeDasharray="4 5"
            strokeWidth="1.5"
            x1={activePoint.x}
            x2={activePoint.x}
            y1={paddingTop}
            y2={baselineY}
          />
        ) : null}
        <g>
          <rect
            fill="rgba(19,31,27,0.94)"
            height="48"
            rx="10"
            stroke="rgba(52,211,153,0.36)"
            width={tooltipWidth}
            x={tooltipX}
            y={tooltipY}
          />
          <text
            fill="rgba(231,229,228,0.66)"
            fontSize="10"
            textAnchor="middle"
            x={tooltipX + tooltipWidth / 2}
            y={tooltipY + 17}
          >
            {activePoint.shortLabel}
          </text>
          <text
            fill={trendColor}
            fontSize="13"
            fontWeight="700"
            textAnchor="middle"
            x={tooltipX + tooltipWidth / 2}
            y={tooltipY + 35}
          >
            {formatMoney(activePoint.amount)}
          </text>
        </g>
        {points.map((item, index) => (
          <circle
            key={item.key}
            cx={item.x}
            cy={item.y}
            fill={activeIndex === index ? trendColor : '#0f172a'}
            r={activeIndex === index ? '7' : '5'}
            stroke={trendColor}
            strokeWidth="3"
          />
        ))}
        {points.map((item, index) => (
          <rect
            key={`hit-${item.key}`}
            aria-label={`${item.selectedLabel} ${formatMoney(item.amount)}`}
            fill="transparent"
            height={height - paddingTop - paddingBottom}
            role="button"
            tabIndex={0}
            width={hitWidth}
            x={item.x - hitWidth / 2}
            y={paddingTop}
            onClick={() => setPinnedIndex(index)}
            onFocus={() => setHoveredIndex(index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setPinnedIndex(index);
              }
            }}
            onMouseEnter={() => setHoveredIndex(index)}
          />
        ))}
        <text
          fill="rgba(231,229,228,0.56)"
          fontSize="11"
          textAnchor="start"
          x={points[0].x}
          y={height - 7}
        >
          {data[0].shortLabel}
        </text>
        {points.length > 1 ? (
          <text
            fill="rgba(231,229,228,0.56)"
            fontSize="11"
            textAnchor="end"
            x={points[points.length - 1].x}
            y={height - 7}
          >
            {data[data.length - 1].shortLabel}
          </text>
        ) : null}
        </svg>
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

  const actualPercentages = activeItems.map(
    (item) => (Number(item.totalAmount || 0) / total) * 100,
  );
  const minVisibleSlice =
    activeItems.length > 1
      ? Math.max(1.5, Math.min(7, 92 / activeItems.length))
      : 100;
  const tinyIndexes = actualPercentages
    .map((percentage, index) =>
      percentage > 0 && percentage < minVisibleSlice ? index : -1,
    )
    .filter((index) => index >= 0);
  const reservedForTinySlices = tinyIndexes.length * minVisibleSlice;
  const largeTotal = actualPercentages.reduce(
    (sum, percentage, index) =>
      tinyIndexes.includes(index) ? sum : sum + percentage,
    0,
  );
  const visualPercentages =
    reservedForTinySlices < 100 && largeTotal > 0
      ? actualPercentages.map((percentage, index) =>
          tinyIndexes.includes(index)
            ? minVisibleSlice
            : (percentage / largeTotal) * (100 - reservedForTinySlices),
        )
      : actualPercentages;

  let cursor = 0;
  const segments = activeItems
    .map((item, index) => {
      const start = cursor;
      const size = visualPercentages[index] || 0;
      cursor += size;
      return `${fundSplitPalette[index % fundSplitPalette.length]} ${start}% ${cursor}%`;
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
          const percentage = actualPercentages[index] || 0;
          const formattedPercentage =
            percentage > 0 && percentage < 0.1 ? '<0.1' : percentage.toFixed(1);
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
                    background:
                      fundSplitPalette[index % fundSplitPalette.length],
                  }}
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">
                    {item.fundAccountName}
                  </p>
                  <p className="text-xs text-stone-400">
                    {formattedPercentage}% of filtered funds
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
  const [trendGranularity, setTrendGranularity] =
    useState<TrendGranularity>('monthly');
  const queryString = useMemo(() => toQueryString(filters), [filters]);

  const { data, isLoading } = useQuery({
    queryKey: ['church-dashboard', queryString],
    queryFn: () =>
      api
        .get(`/church/dashboard${queryString ? `?${queryString}` : ''}`)
        .then((response) => response.data),
    refetchInterval: 15_000,
  });
  const trendByDate = data?.reportSummary?.trendByDate || [];
  const trendData = useMemo(
    () => aggregateTrendData(trendByDate, trendGranularity),
    [trendByDate, trendGranularity],
  );

  if (isLoading) {
    return <div className="panel p-6 text-stone-300">Loading dashboard...</div>;
  }

  const totals = data?.reportSummary?.totals || {};
  const accountKpis = data?.reportSummary?.accountKpis || [];
  const financeEnabled = data?.financeEnabled !== false;
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

  if (!financeEnabled) {
    return (
      <div className="space-y-6">
        <CountdownBadge
          status={data.subscription.status}
          expiresAt={data.subscription.expiresAt}
          graceEndsAt={data.subscription.graceEndsAt}
          label={data.subscription.countdown?.label}
          variant="card"
        />

        <section className="panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            Module Access
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Finance module is not enabled
          </h3>
          <p className="mt-2 max-w-3xl text-sm text-stone-300">
            Transaction KPIs, contribution trends, fund splits, and ledger
            summaries are hidden for this workspace because financial access has
            not been assigned by the platform admin.
          </p>
        </section>
      </div>
    );
  }

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
            <div className="mt-5 text-3xl font-semibold text-white">
              {value}
            </div>
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
                Collections over time
              </h3>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <div className="inline-flex rounded-2xl border border-white/10 bg-black/10 p-1">
                {trendGranularityOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                      trendGranularity === option.value
                        ? 'bg-emerald-400 text-stone-950'
                        : 'text-stone-300 hover:bg-white/5 hover:text-white'
                    }`}
                    type="button"
                    onClick={() => setTrendGranularity(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="max-w-xl text-sm text-stone-300 lg:text-right">
                Confirmed contribution totals grouped by the selected period,
                date range, and account filters.
              </p>
            </div>
          </div>
          <div className="mt-5">
            <TrendChart
              buildLedgerPath={buildLedgerPath}
              data={trendData}
              granularity={trendGranularity}
            />
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
                {(data.reportSummary?.recentContributions || []).map(
                  (item: any) => (
                    <tr key={item.id}>
                      <td>
                        <div className="font-medium text-white">
                          {item.contributor?.name || 'Unknown'}
                        </div>
                        <div className="text-xs text-stone-400">
                          {item.contributor?.phone || '-'}
                        </div>
                      </td>
                      <td>
                        {item.fundAccountId ? item.fundAccountName : 'General'}
                      </td>
                      <td>{item.channel}</td>
                      <td>KES {Number(item.amount || 0).toLocaleString()}</td>
                      <td>{item.status}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
