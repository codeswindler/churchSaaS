import { useQuery } from '@tanstack/react-query';
import { MessageSquareText, Percent, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';

const initialFilters = {
  churchId: '',
  from: '',
  to: '',
};

function toQueryString(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

export default function PlatformCollections() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    ...initialFilters,
    churchId: searchParams.get('churchId') || '',
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
  }));
  const queryString = useMemo(() => toQueryString(filters), [filters]);

  const { data: churches } = useQuery({
    queryKey: ['platform-churches'],
    queryFn: () =>
      api.get('/platform/churches').then((response) => response.data),
  });

  const { data: collections, isLoading: isLoadingCollections } = useQuery({
    queryKey: ['platform-collections', queryString],
    queryFn: () =>
      api
        .get(`/platform/collections${queryString ? `?${queryString}` : ''}`)
        .then((response) => response.data),
  });

  const { data: smsUsage, isLoading: isLoadingSms } = useQuery({
    queryKey: ['platform-sms-usage', queryString],
    queryFn: () =>
      api
        .get(`/platform/sms-usage${queryString ? `?${queryString}` : ''}`)
        .then((response) => response.data),
  });

  const collectionRows = collections?.contributions || [];
  const smsRows = smsUsage?.messages || [];

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Platform Revenue
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Direct M-Pesa collections and SMS usage
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-stone-300">
              Admin revenue is calculated only from direct M-Pesa callbacks.
              Manual church records stay visible to the church, but do not count
              toward platform commission.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4 2xl:min-w-[820px]">
            <div>
              <label className="label-compact">Church</label>
              <select
                className="input-compact mt-1.5"
                value={filters.churchId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    churchId: event.target.value,
                  }))
                }
              >
                <option value="">All churches</option>
                {(churches || []).map((church: any) => (
                  <option key={church.id} value={church.id}>
                    {church.name}
                  </option>
                ))}
              </select>
            </div>
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
            <div className="flex items-end">
              <button
                className="btn-secondary w-full justify-center"
                type="button"
                onClick={() => setFilters(initialFilters)}
              >
                Clear filters
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="stat-card">
          <WalletCards className="text-emerald-300" size={20} />
          <p className="mt-4 text-xs uppercase tracking-[0.24em] text-stone-400">
            Direct M-Pesa
          </p>
          <div className="mt-4 text-3xl font-semibold text-white">
            KES {Number(collections?.totals?.totalAmount || 0).toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <Percent className="text-amber-200" size={20} />
          <p className="mt-4 text-xs uppercase tracking-[0.24em] text-stone-400">
            Commission Revenue
          </p>
          <div className="mt-4 text-3xl font-semibold text-white">
            KES {Number(collections?.totals?.revenueAmount || 0).toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <MessageSquareText className="text-sky-300" size={20} />
          <p className="mt-4 text-xs uppercase tracking-[0.24em] text-stone-400">
            SMS Units
          </p>
          <div className="mt-4 text-3xl font-semibold text-white">
            {Number(smsUsage?.totals?.units || 0).toLocaleString()}
          </div>
        </div>
      </div>

      <section className="table-shell">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            Direct M-Pesa Ledger
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Commissionable transactions
          </h3>
        </div>
        {isLoadingCollections ? (
          <div className="p-6 text-stone-300">Loading collections...</div>
        ) : (
          <div className="table-scroll-region">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Church</th>
                  <th>Fund</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Rate</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {collectionRows.map((item: any) => (
                  <tr key={item.id}>
                    <td className="mono text-xs">
                      {new Date(item.receivedAt || item.createdAt).toLocaleString()}
                    </td>
                    <td>{item.church?.name || item.churchId}</td>
                    <td>{item.fundAccountName}</td>
                    <td className="mono text-xs">{item.paymentReference}</td>
                    <td>KES {Number(item.amount || 0).toLocaleString()}</td>
                    <td>{Number(item.commissionRatePctApplied || 0)}%</td>
                    <td>
                      KES {Number(item.commissionAmount || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {collectionRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No direct M-Pesa collections found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="table-shell">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            SMS Consumption
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Accepted outbound messages
          </h3>
        </div>
        {isLoadingSms ? (
          <div className="p-6 text-stone-300">Loading SMS usage...</div>
        ) : (
          <div className="table-scroll-region">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Church</th>
                  <th>Type</th>
                  <th>Recipient</th>
                  <th>Units</th>
                  <th>Provider</th>
                  <th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {smsRows.map((item: any) => (
                  <tr key={item.id}>
                    <td className="mono text-xs">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td>{item.church?.name || item.churchId}</td>
                    <td>{item.messageType}</td>
                    <td>{item.recipientName || item.recipientMobile}</td>
                    <td>{item.estimatedUnits}</td>
                    <td>{item.providerDescription || item.sendStatus}</td>
                    <td>{item.deliveryDescription || item.deliveryStatus}</td>
                  </tr>
                ))}
                {smsRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No accepted SMS records found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
