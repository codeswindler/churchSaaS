import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  Goal,
  Landmark,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../services/api';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TREND_DAYS = 14;

function formatMoney(value: unknown) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function formatCompactMoney(value: unknown) {
  return new Intl.NumberFormat('en-KE', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString();
}

function parseDateKey(value?: string | null) {
  const [year, month, day] = `${value || ''}`.split('-').map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function toDateKey(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

function todayInNairobi() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function formatChartDate(value: string) {
  const date = parseDateKey(value);
  if (date === null) return value;
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

function niceChartMaximum(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const ceiling =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return ceiling * magnitude;
}

function useAnimatedNumber(value: unknown, duration = 900) {
  const target = Number(value || 0);
  const displayedRef = useRef(0);
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reducedMotion) {
      displayedRef.current = target;
      setDisplayed(target);
      return undefined;
    }

    const from = displayedRef.current;
    const startedAt = window.performance.now();
    let frameId = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = from + (target - from) * eased;
      displayedRef.current = next;
      setDisplayed(next);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [duration, target]);

  return displayed;
}

function AnimatedMoney({ value }: { value: unknown }) {
  const animatedValue = useAnimatedNumber(value);
  return <>{formatMoney(Math.round(animatedValue))}</>;
}

function CampaignProgress({ display }: { display: any }) {
  const todayKey = todayInNairobi();
  const todayPoint = (display.trendByDate || []).find(
    (point: any) => point.date === todayKey,
  );
  const todayAmount = Number(
    display.todayAmount ?? todayPoint?.totalAmount ?? 0,
  );
  const todayCount = Number(
    display.todayContributionCount ?? todayPoint?.count ?? 0,
  );
  const totalAmount = Number(display.totalAmount || 0);
  const contributionCount = Number(display.contributionCount || 0);
  const targetAmount =
    Number(display.targetAmount || 0) > 0
      ? Number(display.targetAmount)
      : null;
  const remainingAmount =
    targetAmount === null
      ? null
      : Math.max(
          0,
          Number(
            display.remainingAmount ?? targetAmount - totalAmount,
          ),
        );
  const exceededAmount =
    targetAmount === null ? 0 : Math.max(0, totalAmount - targetAmount);
  const progressPercentage =
    targetAmount === null
      ? null
      : Number(
          display.progressPercentage ??
            (totalAmount / targetAmount) * 100,
        );
  const animatedPercentage = useAnimatedNumber(progressPercentage || 0, 1100);
  const [animateBar, setAnimateBar] = useState(false);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setAnimateBar(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  return (
    <section className="mt-6" aria-label="Live collection progress">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-3xl border border-[#2d9a83]/20 bg-[linear-gradient(145deg,_#e8f8f1,_#f7fffb)] p-5 shadow-sm">
          <span className="absolute right-5 top-5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-45" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-600" />
          </span>
          <div className="flex items-center gap-2 text-[#1e6f67]">
            <Activity size={17} />
            <p className="text-xs font-bold uppercase tracking-[0.18em]">
              Today
            </p>
          </div>
          <p
            aria-live="polite"
            className="mt-3 text-3xl font-semibold text-[#183126]"
          >
            <AnimatedMoney value={todayAmount} />
          </p>
          <p className="mt-2 text-sm text-stone-600">
            {todayCount.toLocaleString()}{' '}
            {todayCount === 1 ? 'contribution' : 'contributions'} today
          </p>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Live · refreshes every 5 seconds
          </p>
        </div>

        <div className="rounded-3xl border border-[#1e6f87]/15 bg-[linear-gradient(145deg,_#eef8fb,_#ffffff)] p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#1e6f87]">
            <TrendingUp size={17} />
            <p className="text-xs font-bold uppercase tracking-[0.18em]">
              Total collected
            </p>
          </div>
          <p
            aria-live="polite"
            className="mt-3 text-3xl font-semibold text-[#183126]"
          >
            <AnimatedMoney value={totalAmount} />
          </p>
          <p className="mt-2 text-sm text-stone-600">
            {contributionCount.toLocaleString()}{' '}
            {contributionCount === 1 ? 'contribution' : 'contributions'} since{' '}
            {formatChartDate(display.startDate)}
          </p>
          <p className="mt-3 text-xs text-stone-500">
            Last activity {formatDate(display.lastContributionAt)}
          </p>
        </div>

        <div className="rounded-3xl border border-amber-300/45 bg-[linear-gradient(145deg,_#fff7dc,_#fffdf7)] p-5 shadow-sm">
          <div className="flex items-center gap-2 text-amber-800">
            <Goal size={17} />
            <p className="text-xs font-bold uppercase tracking-[0.18em]">
              Collection target
            </p>
          </div>
          <p className="mt-3 text-3xl font-semibold text-[#6f4714]">
            {targetAmount === null ? 'Open goal' : formatMoney(targetAmount)}
          </p>
          <p className="mt-2 text-sm text-amber-900/70">
            {targetAmount === null
              ? 'No fixed target has been set for this display.'
              : exceededAmount > 0
                ? `${formatMoney(exceededAmount)} beyond the target`
                : `${formatMoney(remainingAmount)} still to raise`}
          </p>
          <p className="mt-3 text-xs text-amber-900/55">
            {targetAmount === null
              ? 'Every contribution continues growing the fund.'
              : totalAmount >= targetAmount
                ? 'Target reached — thank you!'
                : 'Together, every contribution moves us closer.'}
          </p>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-3xl border border-[#183126]/10 bg-[#173d34] p-5 text-white shadow-lg shadow-emerald-950/10 sm:p-6">
        {targetAmount === null ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">
                Campaign momentum
              </p>
              <h3 className="mt-2 text-2xl font-semibold">
                The fund is growing live
              </h3>
              <p className="mt-2 text-sm text-emerald-50/75">
                This fund has no fixed public target. Every contribution is
                reflected here as the campaign grows.
              </p>
            </div>
            <p className="text-3xl font-semibold text-amber-200">
              <AnimatedMoney value={totalAmount} />
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">
                  Campaign progress
                </p>
                <h3 className="mt-2 text-2xl font-semibold">
                  {totalAmount >= targetAmount
                    ? 'Target achieved'
                    : `${formatMoney(remainingAmount)} to go`}
                </h3>
                <p className="mt-2 text-sm text-emerald-50/75">
                  {formatMoney(totalAmount)} raised of {formatMoney(targetAmount)}
                </p>
              </div>
              <p
                aria-live="polite"
                className="text-4xl font-semibold text-amber-200 sm:text-5xl"
              >
                {animatedPercentage.toFixed(1)}%
              </p>
            </div>
            <div
              aria-label={`${progressPercentage?.toFixed(1)} percent of target collected`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.min(100, progressPercentage || 0)}
              className="mt-5 h-5 overflow-hidden rounded-full border border-white/10 bg-black/25 p-1"
              role="progressbar"
            >
              <div
                className="relative h-full rounded-full bg-[linear-gradient(90deg,_#f3ba57,_#ffe5a2)] shadow-[0_0_22px_rgba(243,186,87,0.5)] transition-[width] duration-1000 ease-out"
                style={{
                  width: `${animateBar ? Math.min(100, progressPercentage || 0) : 0}%`,
                }}
              >
                <span className="absolute inset-y-0 right-0 w-8 animate-pulse rounded-full bg-white/40 blur-sm" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-emerald-50/65">
              <span>KES 0</span>
              <span>{formatMoney(targetAmount)}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function FundTrend({
  points,
  startDate,
  endDate,
}: {
  points: Array<{ date: string; totalAmount: number; count: number }>;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const gradientId = `fund-trend-${useId().replace(/:/g, '')}`;

  if (!points.length) {
    return (
      <div className="grid min-h-48 place-items-center rounded-3xl border border-[#183126]/10 bg-gradient-to-br from-white/70 to-[#edf7f3] px-6 text-center text-sm text-stone-500">
        Daily giving insights will appear here after the first contribution.
      </div>
    );
  }

  const sortedPoints = [...points].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const pointByDate = new Map<
    string,
    { date: string; totalAmount: number; count: number }
  >();
  sortedPoints.forEach((point) => {
    const current = pointByDate.get(point.date);
    pointByDate.set(point.date, {
      date: point.date,
      totalAmount:
        Number(current?.totalAmount || 0) + Number(point.totalAmount || 0),
      count: Number(current?.count || 0) + Number(point.count || 0),
    });
  });

  const todayKey = todayInNairobi();
  const todayValue = parseDateKey(todayKey) || Date.now();
  const firstPointValue = parseDateKey(sortedPoints[0]?.date) || todayValue;
  const lastPointValue =
    parseDateKey(sortedPoints[sortedPoints.length - 1]?.date) || todayValue;
  const requestedStart = parseDateKey(startDate) ?? firstPointValue;
  const requestedEnd =
    parseDateKey(endDate) ?? Math.max(todayValue, lastPointValue);
  const effectiveEnd = endDate
    ? Math.min(requestedEnd, todayValue)
    : requestedEnd;
  const effectiveStart = Math.min(requestedStart, effectiveEnd);
  const chartStart = Math.max(
    effectiveStart,
    effectiveEnd - (MAX_TREND_DAYS - 1) * DAY_MS,
  );
  const dailyPoints: Array<{
    date: string;
    totalAmount: number;
    count: number;
  }> = [];

  for (let dateValue = chartStart; dateValue <= effectiveEnd; dateValue += DAY_MS) {
    const date = toDateKey(dateValue);
    dailyPoints.push(
      pointByDate.get(date) || { date, totalAmount: 0, count: 0 },
    );
  }

  const chartTotal = dailyPoints.reduce(
    (sum, point) => sum + Number(point.totalAmount || 0),
    0,
  );
  const chartCount = dailyPoints.reduce(
    (sum, point) => sum + Number(point.count || 0),
    0,
  );
  const strongestPoint = dailyPoints.reduce((strongest, point) =>
    Number(point.totalAmount || 0) > Number(strongest.totalAmount || 0)
      ? point
      : strongest,
  );
  const averageAmount = chartTotal / Math.max(dailyPoints.length, 1);
  const maxAmount = Math.max(
    ...dailyPoints.map((point) => Number(point.totalAmount || 0)),
    1,
  );
  const chartMaximum = niceChartMaximum(maxAmount);
  const isTrimmed = chartStart > effectiveStart;
  const width = 840;
  const height = 318;
  const margin = { top: 48, right: 28, bottom: 70, left: 74 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const baseline = margin.top + plotHeight;
  const slotWidth = plotWidth / Math.max(dailyPoints.length, 1);
  const barWidth = Math.min(52, Math.max(18, slotWidth * 0.58));
  const averageY =
    baseline - (Math.min(averageAmount, chartMaximum) / chartMaximum) * plotHeight;
  const showEveryLabel = dailyPoints.length <= 8;

  return (
    <div className="min-w-0 rounded-3xl border border-[#183126]/10 bg-[linear-gradient(145deg,_rgba(255,255,255,0.88),_rgba(231,244,238,0.92))] p-4 shadow-inner shadow-white/70 sm:p-5">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Recent giving
          </p>
          <p className="mt-1 text-xl font-semibold text-[#183126]">
            {formatMoney(chartTotal)}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {formatChartDate(dailyPoints[0].date)} –{' '}
            {formatChartDate(dailyPoints[dailyPoints.length - 1].date)}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800/70">
            Strongest day
          </p>
          <p className="mt-1 text-xl font-semibold text-[#7a4b12]">
            {formatMoney(strongestPoint.totalAmount)}
          </p>
          <p className="mt-1 text-xs text-amber-800/70">
            {formatChartDate(strongestPoint.date)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Gifts in view
          </p>
          <p className="mt-1 text-xl font-semibold text-[#183126]">
            {chartCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Average {formatMoney(Math.round(averageAmount))} per day
          </p>
        </div>
      </div>

      <div className="mt-4 w-full min-w-0 max-w-full overflow-x-auto rounded-[1.5rem] border border-[#183126]/10 bg-white/65">
        <svg
          aria-label={`Daily giving from ${formatChartDate(dailyPoints[0].date)} to ${formatChartDate(dailyPoints[dailyPoints.length - 1].date)}. ${formatMoney(chartTotal)} from ${chartCount} contributions.`}
          className="h-auto min-w-[42rem] w-full"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#2d9a83" />
              <stop offset="100%" stopColor="#16677a" />
            </linearGradient>
            <linearGradient
              id={`${gradientId}-peak`}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#ffd77a" />
              <stop offset="100%" stopColor="#e8a83e" />
            </linearGradient>
            <filter
              height="150%"
              id={`${gradientId}-shadow`}
              width="160%"
              x="-30%"
              y="-20%"
            >
              <feDropShadow
                dx="0"
                dy="5"
                floodColor="#174f45"
                floodOpacity="0.16"
                stdDeviation="5"
              />
            </filter>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = baseline - ratio * plotHeight;
            const value = chartMaximum * ratio;
            return (
              <g key={ratio}>
                <line
                  stroke="#183126"
                  strokeDasharray={ratio === 0 ? undefined : '4 8'}
                  strokeOpacity={ratio === 0 ? 0.2 : 0.1}
                  x1={margin.left}
                  x2={width - margin.right}
                  y1={y}
                  y2={y}
                />
                <text
                  fill="#65756d"
                  fontFamily="Manrope, sans-serif"
                  fontSize="11"
                  textAnchor="end"
                  x={margin.left - 12}
                  y={y + 4}
                >
                  {ratio === 0 ? 'KES 0' : `KES ${formatCompactMoney(value)}`}
                </text>
              </g>
            );
          })}

          {averageAmount > 0 ? (
            <g>
              <line
                stroke="#b7791f"
                strokeDasharray="7 7"
                strokeOpacity="0.75"
                strokeWidth="2"
                x1={margin.left}
                x2={width - margin.right}
                y1={averageY}
                y2={averageY}
              />
              <rect
                fill="#fff7df"
                height="22"
                rx="11"
                stroke="#e8c36b"
                width="118"
                x={width - margin.right - 118}
                y={Math.max(margin.top + 2, averageY - 27)}
              />
              <text
                fill="#8a5a14"
                fontFamily="Manrope, sans-serif"
                fontSize="10"
                fontWeight="700"
                textAnchor="middle"
                x={width - margin.right - 59}
                y={Math.max(margin.top + 17, averageY - 12)}
              >
                Daily avg {formatCompactMoney(averageAmount)}
              </text>
            </g>
          ) : null}

          {dailyPoints.map((point, index) => {
            const amount = Number(point.totalAmount || 0);
            const x = margin.left + index * slotWidth + (slotWidth - barWidth) / 2;
            const calculatedHeight = (amount / chartMaximum) * plotHeight;
            const barHeight = amount > 0 ? Math.max(4, calculatedHeight) : 2;
            const y = baseline - barHeight;
            const isStrongest =
              amount > 0 &&
              point.date === strongestPoint.date &&
              amount === strongestPoint.totalAmount;
            const showDate =
              showEveryLabel ||
              index % 2 === 0 ||
              index === dailyPoints.length - 1;
            const showValue =
              amount > 0 &&
              (showEveryLabel ||
                isStrongest ||
                index === dailyPoints.length - 1);

            return (
              <g key={point.date}>
                <title>
                  {formatChartDate(point.date)}: {formatMoney(amount)} from{' '}
                  {point.count} {point.count === 1 ? 'gift' : 'gifts'}
                </title>
                <rect
                  fill={
                    amount > 0
                      ? `url(#${isStrongest ? `${gradientId}-peak` : gradientId})`
                      : '#dfe9e4'
                  }
                  filter={amount > 0 ? `url(#${gradientId}-shadow)` : undefined}
                  height={barHeight}
                  rx={Math.min(10, barWidth / 3)}
                  width={barWidth}
                  x={x}
                  y={y}
                />
                {showValue ? (
                  <text
                    fill={isStrongest ? '#9a620f' : '#185d61'}
                    fontFamily="Manrope, sans-serif"
                    fontSize="10"
                    fontWeight="800"
                    textAnchor="middle"
                    x={x + barWidth / 2}
                    y={Math.max(margin.top - 5, y - 9)}
                  >
                    {formatCompactMoney(amount)}
                  </text>
                ) : null}
                {isStrongest ? (
                  <text
                    fill="#9a620f"
                    fontFamily="Manrope, sans-serif"
                    fontSize="9"
                    fontWeight="800"
                    letterSpacing="1.2"
                    textAnchor="middle"
                    x={x + barWidth / 2}
                    y={Math.max(15, y - 24)}
                  >
                    PEAK
                  </text>
                ) : null}
                {showDate ? (
                  <>
                    <text
                      fill="#40564c"
                      fontFamily="Manrope, sans-serif"
                      fontSize="10"
                      fontWeight="700"
                      textAnchor="middle"
                      x={x + barWidth / 2}
                      y={baseline + 24}
                    >
                      {formatChartDate(point.date)}
                    </text>
                    <text
                      fill="#7a8981"
                      fontFamily="Manrope, sans-serif"
                      fontSize="9"
                      textAnchor="middle"
                      x={x + barWidth / 2}
                      y={baseline + 41}
                    >
                      {point.count > 0
                        ? `${point.count} ${point.count === 1 ? 'gift' : 'gifts'}`
                        : 'No gifts'}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          Gold marks the strongest giving day
        </span>
        <span>
          {isTrimmed
            ? `Latest ${dailyPoints.length} calendar days shown`
            : 'Every calendar day in this reporting window is shown'}
        </span>
      </div>
    </div>
  );
}

export default function PublicFunds() {
  const { slug = '', displayId } = useParams();
  const endpoint = displayId
    ? `/public/churches/${slug}/fund-displays/${displayId}`
    : `/public/churches/${slug}/fund-displays`;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-fund-displays', slug, displayId || 'all'],
    queryFn: () => api.get(endpoint).then((response) => response.data),
    enabled: Boolean(slug),
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f7f3ea] p-8 text-stone-700">
        Loading fund updates...
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f3ea] p-6 text-stone-800">
        <div className="max-w-lg text-center">
          <h1 className="text-4xl font-semibold">Fund display not available</h1>
          <p className="mt-3 text-stone-600">
            This display may have expired or is no longer public.
          </p>
        </div>
      </div>
    );
  }

  const displays = data.fundDisplays || [];
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(243,186,87,0.18),_transparent_34%),linear-gradient(180deg,_#f7f3ea,_#eef6f2)] px-4 py-8 text-[#183126] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur sm:p-8">
          <div className="flex items-center gap-4">
            {data.church?.logoUrl ? (
              <img
                alt=""
                className="h-14 w-14 rounded-2xl object-cover"
                src={data.church.logoUrl}
              />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#183126] text-white">
                <Landmark size={24} />
              </span>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#1e6f87]">
                Fund updates
              </p>
              <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">
                {data.church?.name}
              </h1>
            </div>
          </div>
          {displayId ? (
            <Link
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#1e6f87]"
              to={`/c/${slug}/funds`}
            >
              <ArrowLeft size={16} />
              All active funds
            </Link>
          ) : null}
        </header>

        <div className="mt-6 grid gap-6">
          {displays.map((display: any) => (
            <article
              className="min-w-0 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-xl shadow-emerald-950/5 sm:p-8"
              key={display.id}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1e6f87]">
                    {display.fundAccountName}
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold">
                    {display.title || display.fundAccountName}
                  </h2>
                  {display.description ? (
                    <p className="mt-3 max-w-3xl leading-7 text-stone-600">
                      {display.description}
                    </p>
                  ) : null}
                </div>
                {!displayId ? (
                  <Link
                    className="rounded-full border border-[#1e6f87]/20 px-4 py-2 text-sm font-semibold text-[#1e6f87]"
                    to={`/c/${slug}/funds/${display.id}`}
                  >
                    Open display
                  </Link>
                ) : null}
              </div>

              <CampaignProgress display={display} />

              <div className="mt-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">Daily contributions</h3>
                  <span className="text-sm text-stone-500">
                    {display.startDate} –{' '}
                    {display.endMode === 'static'
                      ? display.endDate
                      : 'to date'}
                  </span>
                </div>
                <FundTrend
                  endDate={
                    display.endMode === 'static' ? display.endDate : null
                  }
                  points={display.trendByDate || []}
                  startDate={display.startDate}
                />
              </div>
            </article>
          ))}
          {displays.length === 0 ? (
            <div className="rounded-[2rem] bg-white/80 p-8 text-center text-stone-600">
              No active public fund displays.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
