import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const initialMessageForm = {
  audience: 'all_contributors',
  message: '',
  pastedContacts: '',
};

const initialOutboxFilters = {
  from: '',
  to: '',
  type: '',
  sendStatus: '',
  deliveryStatus: '',
};

function toQueryString(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function smsUnits(value: string) {
  return Math.max(1, Math.ceil(value.length / 160));
}

export default function ChurchMessaging() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialMessageForm);
  const [filters, setFilters] = useState(initialOutboxFilters);
  const queryString = useMemo(() => toQueryString(filters), [filters]);
  const currentPageUsage = form.message.length % 160;
  const remainingCharacters = currentPageUsage === 0 ? 160 : 160 - currentPageUsage;

  const { data: usage } = useQuery({
    queryKey: ['church-sms-usage'],
    queryFn: () =>
      api.get('/church/messaging/usage').then((response) => response.data),
  });

  const { data: outbox, isLoading } = useQuery({
    queryKey: ['church-sms-outbox', queryString],
    queryFn: () =>
      api
        .get(`/church/messaging/outbox${queryString ? `?${queryString}` : ''}`)
        .then((response) => response.data),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/church/messaging/bulk', form);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(
        `Bulk SMS queued for ${Number(data.recipientCount || 0).toLocaleString()} recipients`,
      );
      setForm(initialMessageForm);
      queryClient.invalidateQueries({ queryKey: ['church-sms-outbox'] });
      queryClient.invalidateQueries({ queryKey: ['church-sms-usage'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to send bulk SMS');
    },
  });

  const outboxRows = outbox || [];

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Bulk Communication
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Send contributor messages
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-stone-300">
              Send communication to all contributors, gender-tagged groups, or
              pasted contacts. Outbox status shows provider acceptance and DLR
              delivery feedback when Advanta posts it back.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[420px]">
            <div className="stat-card p-5">
              <MessageSquareText className="text-sky-300" size={20} />
              <p className="mt-4 text-xs uppercase tracking-[0.22em] text-stone-400">
                Accepted messages
              </p>
              <div className="mt-3 text-2xl font-semibold text-white">
                {Number(usage?.messageCount || 0).toLocaleString()}
              </div>
            </div>
            <div className="stat-card p-5">
              <Send className="text-emerald-300" size={20} />
              <p className="mt-4 text-xs uppercase tracking-[0.22em] text-stone-400">
                SMS units used
              </p>
              <div className="mt-3 text-2xl font-semibold text-white">
                {Number(usage?.units || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="page-grid">
        <form
          className="panel p-6"
          onSubmit={(event) => {
            event.preventDefault();
            sendMutation.mutate();
          }}
        >
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            Message Composer
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Create bulk SMS
          </h3>

          <div className="mt-6 space-y-4">
            <div>
              <label className="label">Audience</label>
              <select
                className="input"
                value={form.audience}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    audience: event.target.value,
                  }))
                }
              >
                <option value="all_contributors">All contributors</option>
                <option value="male_contributors">Male contributors</option>
                <option value="female_contributors">Female contributors</option>
                <option value="pasted_contacts">Pasted contacts</option>
              </select>
            </div>

            {form.audience === 'pasted_contacts' ? (
              <div>
                <label className="label">Pasted contacts</label>
                <textarea
                  className="input min-h-36"
                  placeholder="One per line. Use 2547..., 07..., or Name, 07..."
                  value={form.pastedContacts}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pastedContacts: event.target.value,
                    }))
                  }
                />
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between gap-3">
                <label className="label">Message</label>
                <span className="text-xs text-stone-400">
                  {form.message.length} chars | {smsUnits(form.message)} unit
                  {smsUnits(form.message) === 1 ? '' : 's'} |{' '}
                  {remainingCharacters} left on current page
                </span>
              </div>
              <textarea
                className="input min-h-44"
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    message: event.target.value,
                  }))
                }
              />
            </div>

            <button
              className="btn-primary w-full justify-center"
              disabled={sendMutation.isPending}
              type="submit"
            >
              <Send size={16} />
              {sendMutation.isPending ? 'Sending...' : 'Send bulk message'}
            </button>
          </div>
        </form>

        <section className="panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            Outbox Filters
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Review delivery activity
          </h3>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">From</label>
              <input
                className="input"
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
              <label className="label">To</label>
              <input
                className="input"
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
              <label className="label">Type</label>
              <select
                className="input"
                value={filters.type}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
              >
                <option value="">All</option>
                <option value="receipt">Receipts</option>
                <option value="bulk">Bulk</option>
              </select>
            </div>
            <div>
              <label className="label">Provider status</label>
              <select
                className="input"
                value={filters.sendStatus}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    sendStatus: event.target.value,
                  }))
                }
              >
                <option value="">All</option>
                <option value="accepted">Accepted</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Delivery status</label>
              <select
                className="input"
                value={filters.deliveryStatus}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    deliveryStatus: event.target.value,
                  }))
                }
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>
        </section>
      </section>

      <section className="table-shell">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            SMS Outbox
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Provider and delivery status
          </h3>
        </div>

        {isLoading ? (
          <div className="p-6 text-stone-300">Loading outbox...</div>
        ) : (
          <div className="table-scroll-region">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Recipient</th>
                  <th>Type</th>
                  <th>Units</th>
                  <th>Provider</th>
                  <th>Delivery</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {outboxRows.map((item: any) => (
                  <tr key={item.id}>
                    <td className="mono text-xs">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <div className="font-medium text-white">
                        {item.recipientName || item.contributor?.name || 'Recipient'}
                      </div>
                      <div className="text-xs text-stone-400">
                        {item.recipientMobile}
                      </div>
                    </td>
                    <td>{item.messageType}</td>
                    <td>{item.estimatedUnits}</td>
                    <td>{item.providerDescription || item.sendStatus}</td>
                    <td>{item.deliveryDescription || item.deliveryStatus}</td>
                    <td className="max-w-md truncate">{item.messageBody}</td>
                  </tr>
                ))}
                {outboxRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No SMS outbox records found.</td>
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
