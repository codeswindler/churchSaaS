import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Landmark } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import api from '../../services/api';

function formatMoney(value: unknown) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString();
}

function FundTrend({
  points,
}: {
  points: Array<{ date: string; totalAmount: number; count: number }>;
}) {
  if (!points.length) {
    return (
      <div className="grid min-h-48 place-items-center rounded-3xl bg-black/10 text-sm text-stone-500">
        Contribution activity will appear here.
      </div>
    );
  }
  const width = 720;
  const height = 260;
  const padding = 28;
  const max = Math.max(...points.map((point) => Number(point.totalAmount || 0)), 1);
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const path = points
    .map((point, index) => {
      const x =
        padding +
        (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
      const y =
        padding +
        plotHeight -
        (Number(point.totalAmount || 0) / max) * plotHeight;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <div className="overflow-hidden rounded-3xl bg-black/10 p-3">
      <svg
        aria-label="Daily contribution trend"
        className="h-auto w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <path
          d={path}
          fill="none"
          stroke="#1e6f87"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="5"
        />
        {points.map((point, index) => {
          const x =
            padding +
            (points.length === 1
              ? plotWidth / 2
              : (index / (points.length - 1)) * plotWidth);
          const y =
            padding +
            plotHeight -
            (Number(point.totalAmount || 0) / max) * plotHeight;
          return <circle cx={x} cy={y} fill="#f3ba57" key={point.date} r="6" />;
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-stone-500">
        <span>{points[0]?.date}</span>
        <span>{points[points.length - 1]?.date}</span>
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
              className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-xl shadow-emerald-950/5 sm:p-8"
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

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl bg-[#edf7f3] p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                    Current total
                  </p>
                  <p className="mt-2 text-3xl font-semibold">
                    {formatMoney(display.totalAmount)}
                  </p>
                </div>
                <div className="rounded-3xl bg-[#edf7f3] p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                    Contributions
                  </p>
                  <p className="mt-2 text-3xl font-semibold">
                    {Number(display.contributionCount || 0).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-3xl bg-[#edf7f3] p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                    Last activity
                  </p>
                  <p className="mt-2 text-base font-semibold">
                    {formatDate(display.lastContributionAt)}
                  </p>
                </div>
              </div>

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
                <FundTrend points={display.trendByDate || []} />
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
