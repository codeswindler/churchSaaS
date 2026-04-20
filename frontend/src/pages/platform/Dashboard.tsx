import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft, Landmark, Wallet } from 'lucide-react';
import api from '../../services/api';

export default function PlatformDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-dashboard'],
    queryFn: () =>
      api.get('/platform/dashboard/summary').then((response) => response.data),
  });

  if (isLoading) {
    return <div className="panel p-6 text-stone-300">Loading dashboard...</div>;
  }

  const totals = data?.totals || {};
  const churches = data?.churches || [];

  return (
    <div className="space-y-6">
      <div className="overview-stat-grid">
        {[
          {
            label: 'Customer Churches',
            value: totals.churches || 0,
            icon: Landmark,
          },
          {
            label: 'Active Subscriptions',
            value: totals.activeChurches || 0,
            icon: ArrowRightLeft,
          },
          {
            label: 'In Grace Period',
            value: totals.graceChurches || 0,
            icon: AlertTriangle,
          },
          {
            label: 'Total Collections',
            value: `KES ${Number(totals.totalCollections || 0).toLocaleString()}`,
            icon: Wallet,
          },
        ].map((item) => (
          <div key={item.label} className="stat-card">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                {item.label}
              </p>
              <item.icon size={18} className="text-amber-200" />
            </div>
            <div className="mt-5 text-3xl font-semibold text-white">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="overview-shell-grid">
        <section className="panel overview-panel-tall p-6 xl:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Attention Window
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Expiring Soon
              </h3>
            </div>
          </div>

          <div className="space-y-3">
            {(data?.expiringSoon || []).length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-black/10 p-5 text-stone-300">
                No churches are close to expiry.
              </div>
            ) : (
              data.expiringSoon.map((church: any) => (
                <div
                  key={church.id}
                  className="rounded-3xl border border-white/10 bg-black/10 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-semibold text-white">
                        {church.name}
                      </h4>
                      <p className="text-sm text-stone-400">
                        {church.subscription?.status?.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="mono text-sm text-amber-100">
                      {church.subscription?.countdown?.days}d{' '}
                      {church.subscription?.countdown?.hours}h{' '}
                      {church.subscription?.countdown?.minutes}m
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel overview-panel-tall p-6 xl:col-span-4">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            Recent Onboarding
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Latest Churches
          </h3>

          <div className="mt-5 space-y-3">
            {(data?.recentChurches || []).map((church: any) => (
              <div
                key={church.id}
                className="rounded-3xl border border-white/10 bg-black/10 p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-lg font-semibold text-white">
                      {church.name}
                    </h4>
                    <p className="text-sm text-stone-400">
                      {church.contactEmail || church.contactPhone || 'No contact'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">
                      {church.userCount} staff users
                    </p>
                    <p className="text-xs text-stone-400">
                      KES{' '}
                      {Number(
                        church.contributionTotals?.total || 0,
                      ).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel overview-panel-tall p-6 xl:col-span-3">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            Portfolio Snapshot
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Church statuses
          </h3>

          <div className="mt-5 space-y-3">
            {churches.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-black/10 p-5 text-stone-300">
                No churches onboarded yet.
              </div>
            ) : (
              churches.slice(0, 8).map((church: any) => (
                <div
                  key={church.id}
                  className="rounded-3xl border border-white/10 bg-black/10 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h4 className="truncate text-base font-semibold text-white">
                        {church.name}
                      </h4>
                      <p className="truncate text-xs text-stone-400">
                        {church.subscription?.status || 'unknown'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-amber-100">
                        {church.subscription?.countdown?.days || 0}d
                      </p>
                      <p className="text-xs text-stone-400">
                        {church.userCount || 0} users
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel overview-panel-xl p-6 xl:col-span-12">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Customer Ledger
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Church performance overview
              </h3>
            </div>
            <p className="max-w-2xl text-sm text-stone-300">
              A wider desktop view of customer subscription health, staffing, and
              collections across the churches already onboarded.
            </p>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {churches.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-black/10 p-5 text-stone-300 xl:col-span-2 2xl:col-span-3">
                No customer churches available yet.
              </div>
            ) : (
              churches.map((church: any) => (
                <div
                  key={church.id}
                  className="rounded-[28px] border border-white/10 bg-black/10 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h4 className="truncate text-xl font-semibold text-white">
                        {church.name}
                      </h4>
                      <p className="mt-1 truncate text-sm text-stone-400">
                        {church.contactEmail || church.contactPhone || church.slug}
                      </p>
                    </div>
                    <span className="badge border-white/10 bg-white/5 text-stone-100">
                      {church.subscription?.status || 'unknown'}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                        Countdown
                      </p>
                      <p className="mt-2 mono text-sm text-amber-100">
                        {church.subscription?.countdown?.days || 0}d{' '}
                        {church.subscription?.countdown?.hours || 0}h{' '}
                        {church.subscription?.countdown?.minutes || 0}m
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                        Team
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {church.userCount || 0} users
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                        Collections
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        KES{' '}
                        {Number(
                          church.contributionTotals?.total || 0,
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
