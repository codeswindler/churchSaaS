import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronRight,
  Landmark,
  MessageSquareText,
  Percent,
  Wallet,
  X,
} from 'lucide-react';
import { useState } from 'react';
import api from '../../services/api';

function formatKes(value: unknown) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

export default function PlatformDashboard() {
  const [showRevenueBreakdown, setShowRevenueBreakdown] = useState(false);
  const [showSmsRevenueBreakdown, setShowSmsRevenueBreakdown] = useState(false);
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
  const revenueBreakdown = data?.revenueBreakdown || [];
  const smsPurchaseBreakdown = data?.smsPurchaseBreakdown || [];
  const statCards = [
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
      label: 'Commission Churches',
      value: totals.commissionChurches || 0,
      icon: Wallet,
    },
    {
      label: 'In Grace Period',
      value: totals.graceChurches || 0,
      icon: AlertTriangle,
    },
    {
      label: 'Total Revenue',
      value: formatKes(totals.totalRevenue ?? totals.totalCollections),
      icon: Wallet,
      hint: 'View church breakdown',
      onClick: () => setShowRevenueBreakdown(true),
    },
    {
      label: 'Platform Commission',
      value: formatKes(totals.commissionRevenue),
      icon: Percent,
      hint: 'Admin revenue only',
    },
    {
      label: 'SMS Revenue',
      value: formatKes(totals.smsRevenue),
      icon: MessageSquareText,
      hint: `${Number(totals.smsUnitsSold || 0).toLocaleString()} units sold`,
      onClick: () => setShowSmsRevenueBreakdown(true),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="overview-stat-grid">
        {statCards.map((item) =>
          item.onClick ? (
            <button
              key={item.label}
              className="stat-card text-left transition hover:border-amber-200/40 hover:bg-amber-200/10"
              type="button"
              onClick={item.onClick}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  {item.label}
                </p>
                <item.icon size={18} className="text-amber-200" />
              </div>
              <div className="mt-5 text-3xl font-semibold text-white">
                {item.value}
              </div>
              <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-100">
                {item.hint}
                <ChevronRight size={14} />
              </p>
            </button>
          ) : (
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
              {item.hint ? (
                <p className="mt-3 text-xs font-semibold text-stone-400">
                  {item.hint}
                </p>
              ) : null}
            </div>
          ),
        )}
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
                        {church.billingModel === 'commission'
                          ? `${Number(church.commissionRatePct || 0)}% commission`
                          : church.subscription?.status || 'unknown'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-amber-100">
                        {church.billingModel === 'commission'
                          ? 'No timer'
                          : `${church.subscription?.countdown?.days || 0}d`}
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
                      {church.billingModel === 'commission'
                        ? 'Commission'
                        : church.subscription?.status || 'unknown'}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                        {church.billingModel === 'commission'
                          ? 'Billing rate'
                          : 'Countdown'}
                      </p>
                      <p className="mt-2 mono text-sm text-amber-100">
                        {church.billingModel === 'commission'
                          ? `${Number(church.commissionRatePct || 0)}%`
                          : `${church.subscription?.countdown?.days || 0}d ${
                              church.subscription?.countdown?.hours || 0
                            }h ${
                              church.subscription?.countdown?.minutes || 0
                            }m`}
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
                        Revenue
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {formatKes(church.contributionTotals?.total)}
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        Commission {formatKes(church.contributionTotals?.revenue)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {showRevenueBreakdown ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setShowRevenueBreakdown(false)}
        >
          <section
            aria-labelledby="platform-revenue-breakdown-title"
            aria-modal="true"
            className="panel modal-card max-w-5xl p-5 sm:p-6"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Revenue Breakdown
                </p>
                <h3
                  className="mt-2 text-2xl font-semibold text-white"
                  id="platform-revenue-breakdown-title"
                >
                  Church earnings and admin commission
                </h3>
                <p className="mt-2 max-w-2xl text-sm text-stone-300">
                  Total revenue is the gross direct M-Pesa amount collected by
                  churches. Platform commission is the admin revenue.
                </p>
              </div>
              <button
                aria-label="Close revenue breakdown"
                className="btn-secondary px-3 py-2"
                type="button"
                onClick={() => setShowRevenueBreakdown(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                  Total Revenue
                </p>
                <strong className="mt-2 block text-2xl text-white">
                  {formatKes(totals.totalRevenue ?? totals.totalCollections)}
                </strong>
              </div>
              <div className="rounded-3xl border border-amber-200/20 bg-amber-200/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-amber-100">
                  Platform Commission
                </p>
                <strong className="mt-2 block text-2xl text-white">
                  {formatKes(totals.commissionRevenue)}
                </strong>
              </div>
            </div>

            <div className="table-scroll-region mt-5 rounded-3xl border border-white/10">
              <table>
                <thead>
                  <tr>
                    <th>Church</th>
                    <th>Billing</th>
                    <th>Transactions</th>
                    <th>Total Revenue</th>
                    <th>Admin Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueBreakdown.map((church: any) => (
                    <tr key={church.id}>
                      <td>
                        <div className="font-semibold text-white">
                          {church.name}
                        </div>
                        <div className="text-xs text-stone-400">
                          {church.slug}
                        </div>
                      </td>
                      <td>
                        {church.billingModel === 'commission'
                          ? `${Number(church.commissionRatePct || 0)}% commission`
                          : 'Subscription'}
                      </td>
                      <td>{Number(church.contributionCount || 0)}</td>
                      <td>{formatKes(church.totalRevenue)}</td>
                      <td className="font-semibold text-amber-100">
                        {formatKes(church.commissionRevenue)}
                      </td>
                    </tr>
                  ))}
                  {revenueBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No revenue records found yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {showSmsRevenueBreakdown ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setShowSmsRevenueBreakdown(false)}
        >
          <section
            aria-labelledby="platform-sms-revenue-breakdown-title"
            aria-modal="true"
            className="panel modal-card max-w-6xl p-5 sm:p-6"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  SMS Revenue
                </p>
                <h3
                  className="mt-2 text-2xl font-semibold text-white"
                  id="platform-sms-revenue-breakdown-title"
                >
                  SMS unit purchases by church
                </h3>
                <p className="mt-2 max-w-2xl text-sm text-stone-300">
                  Paid SMS unit purchases count as platform SMS revenue. Pending
                  and failed attempts remain listed for follow-up visibility.
                </p>
              </div>
              <button
                aria-label="Close SMS revenue breakdown"
                className="btn-secondary px-3 py-2"
                type="button"
                onClick={() => setShowSmsRevenueBreakdown(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                  SMS Revenue
                </p>
                <strong className="mt-2 block text-2xl text-white">
                  {formatKes(totals.smsRevenue)}
                </strong>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                  Units Sold
                </p>
                <strong className="mt-2 block text-2xl text-white">
                  {Number(totals.smsUnitsSold || 0).toLocaleString()}
                </strong>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                  Paid Purchases
                </p>
                <strong className="mt-2 block text-2xl text-white">
                  {Number(totals.smsPurchaseCount || 0).toLocaleString()}
                </strong>
              </div>
            </div>

            <div className="table-scroll-region mt-5 rounded-3xl border border-white/10">
              <table>
                <thead>
                  <tr>
                    <th>Church</th>
                    <th>Buyer</th>
                    <th>Recipients</th>
                    <th>Units</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {smsPurchaseBreakdown.map((purchase: any) => (
                    <tr key={purchase.id}>
                      <td>
                        <div className="font-semibold text-white">
                          {purchase.churchName}
                        </div>
                        <div className="text-xs text-stone-400">
                          {purchase.churchSlug}
                        </div>
                      </td>
                      <td>
                        <div>{purchase.createdByUserName || 'Church user'}</div>
                        <div className="text-xs text-stone-400">
                          {purchase.payerPhone || 'No phone'}
                        </div>
                      </td>
                      <td>{Number(purchase.recipientCount || 0)}</td>
                      <td className="font-semibold text-white">
                        {Number(purchase.totalUnits || 0).toLocaleString()}
                      </td>
                      <td>{formatKes(purchase.amountKes)}</td>
                      <td>{`${purchase.status || ''}`.replace(/_/g, ' ')}</td>
                      <td>
                        {new Date(
                          purchase.paidAt ||
                            purchase.sentAt ||
                            purchase.createdAt,
                        ).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {smsPurchaseBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={7}>No SMS unit purchases found yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
