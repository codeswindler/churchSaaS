import { useQuery } from '@tanstack/react-query';
import { CountdownBadge } from '../../components/CountdownBadge';
import api from '../../services/api';

export default function ChurchDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['church-dashboard'],
    queryFn: () => api.get('/church/dashboard').then((response) => response.data),
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return <div className="panel p-6 text-stone-300">Loading dashboard...</div>;
  }

  const totals = data?.reportSummary?.totals || {};

  return (
    <div className="space-y-6">
      <div className="overview-stat-grid">
        {[
          ['Confirmed Contributions', totals.contributionCount || 0],
          [
            'Total Collections',
            `KES ${Number(totals.totalAmount || 0).toLocaleString()}`,
          ],
          ['M-Pesa Collections', `KES ${Number(totals.mpesaAmount || 0).toLocaleString()}`],
          ['Cash Collections', `KES ${Number(totals.cashAmount || 0).toLocaleString()}`],
        ].map(([label, value]) => (
          <div key={label} className="stat-card">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              {label}
            </p>
            <div className="mt-5 text-3xl font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="overview-shell-grid">
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
            <div className="mt-5 space-y-3">
              {(data.reportSummary?.byFundAccount || []).map((item: any) => (
                <div
                  key={item.fundAccountName}
                  className="rounded-3xl border border-white/10 bg-black/10 p-4"
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
                </div>
              ))}
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
                    <td>{item.fundAccountName}</td>
                    <td>{item.channel}</td>
                    <td>KES {Number(item.amount || 0).toLocaleString()}</td>
                    <td>{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel overview-panel-tall p-6 xl:col-span-12">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Church Overview
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Funding health at a glance
              </h3>
            </div>
            <p className="max-w-2xl text-sm text-stone-300">
              Desktop view now gives more room to compare collection channels,
              subscription position, and account performance from one screen.
            </p>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            <div className="rounded-[28px] border border-white/10 bg-black/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                Subscription state
              </p>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="badge border-white/10 bg-white/5 text-stone-100">
                  {data.subscription.status}
                </span>
                <span className="mono text-sm text-amber-100">
                  {data.subscription.countdown?.days || 0}d{' '}
                  {data.subscription.countdown?.hours || 0}h
                </span>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                Active accounts
              </p>
              <p className="mt-4 text-3xl font-semibold text-white">
                {data.activeFundAccounts || 0}
              </p>
              <p className="mt-2 text-sm text-stone-300">
                Contribution accounts currently open to receive funds.
              </p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                Channel mix
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-stone-400">M-Pesa</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    KES {Number(totals.mpesaAmount || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-stone-400">Cash</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    KES {Number(totals.cashAmount || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
