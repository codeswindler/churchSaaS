import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Inbox, Send, SlidersHorizontal, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const initialMessageForm = {
  audience: 'all_contributors',
  message: '',
  pastedContacts: '',
  addressBookIds: [] as string[],
  smsShortcode: '',
};

const initialAddressBookForm = {
  name: '',
  contactsText: '',
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
  const [activeWorkspace, setActiveWorkspace] = useState<'compose' | 'outbox'>(
    'compose',
  );
  const [form, setForm] = useState(initialMessageForm);
  const [addressBookForm, setAddressBookForm] = useState(
    initialAddressBookForm,
  );
  const [filters, setFilters] = useState(initialOutboxFilters);
  const queryString = useMemo(() => toQueryString(filters), [filters]);
  const currentPageUsage = form.message.length % 160;
  const remainingCharacters =
    currentPageUsage === 0 ? 160 : 160 - currentPageUsage;

  const { data: messagingConfig } = useQuery({
    queryKey: ['church-messaging-config'],
    queryFn: () =>
      api.get('/church/messaging/config').then((response) => response.data),
  });

  const { data: usage } = useQuery({
    queryKey: ['church-sms-usage'],
    queryFn: () =>
      api.get('/church/messaging/usage').then((response) => response.data),
  });

  const { data: addressBooks } = useQuery({
    queryKey: ['church-address-books'],
    queryFn: () =>
      api
        .get('/church/messaging/address-books')
        .then((response) => response.data),
  });

  const { data: outbox, isLoading } = useQuery({
    queryKey: ['church-sms-outbox', queryString],
    queryFn: () =>
      api
        .get(`/church/messaging/outbox${queryString ? `?${queryString}` : ''}`)
        .then((response) => response.data),
  });

  const shortcodes = messagingConfig?.smsShortcodes || [];
  const defaultShortcode =
    messagingConfig?.defaultSmsShortcode || shortcodes[0] || '';

  useEffect(() => {
    if (!form.smsShortcode && defaultShortcode) {
      setForm((current) => ({
        ...current,
        smsShortcode: defaultShortcode,
      }));
    }
  }, [defaultShortcode, form.smsShortcode]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/church/messaging/bulk', form);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(
        `Bulk SMS queued for ${Number(data.recipientCount || 0).toLocaleString()} recipients`,
      );
      setForm({
        ...initialMessageForm,
        smsShortcode: defaultShortcode,
      });
      setActiveWorkspace('outbox');
      queryClient.invalidateQueries({ queryKey: ['church-sms-outbox'] });
      queryClient.invalidateQueries({ queryKey: ['church-sms-usage'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to send bulk SMS');
    },
  });

  const createAddressBookMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/church/messaging/address-books', {
        name: addressBookForm.name,
        contactsText: addressBookForm.contactsText,
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Address book saved');
      setAddressBookForm(initialAddressBookForm);
      queryClient.invalidateQueries({ queryKey: ['church-address-books'] });
      if (data?.id) {
        setForm((current) => ({
          ...current,
          addressBookIds: Array.from(
            new Set([...current.addressBookIds, data.id]),
          ),
        }));
      }
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to save address book',
      );
    },
  });

  const outboxRows = outbox || [];
  const books = addressBooks || [];

  const toggleAddressBook = (bookId: string) => {
    setForm((current) => {
      const selected = new Set(current.addressBookIds);
      if (selected.has(bookId)) {
        selected.delete(bookId);
      } else {
        selected.add(bookId);
      }
      return { ...current, addressBookIds: Array.from(selected) };
    });
  };

  const loadAddressBookFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAddressBookForm((current) => ({
        ...current,
        contactsText: `${current.contactsText ? `${current.contactsText}\n` : ''}${reader.result || ''}`,
      }));
    };
    reader.readAsText(file);
  };

  const downloadOutbox = async () => {
    try {
      const response = await api.get(
        `/church/messaging/outbox/export${queryString ? `?${queryString}` : ''}`,
        { responseType: 'blob' },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sms-outbox.csv';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || 'Unable to download SMS outbox',
      );
    }
  };

  return (
    <div className="space-y-5">
      <section className="panel p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
              SMS units used
            </p>
            <div className="mt-1 text-xl font-semibold text-white">
              {Number(usage?.units || 0).toLocaleString()}
            </div>
          </div>

          <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-black/10 p-1">
            <button
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                activeWorkspace === 'compose'
                  ? 'bg-amber-200 text-stone-950'
                  : 'text-stone-300 hover:bg-white/5 hover:text-white'
              }`}
              type="button"
              onClick={() => setActiveWorkspace('compose')}
            >
              <Send size={16} />
              Compose
            </button>
            <button
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                activeWorkspace === 'outbox'
                  ? 'bg-amber-200 text-stone-950'
                  : 'text-stone-300 hover:bg-white/5 hover:text-white'
              }`}
              type="button"
              onClick={() => setActiveWorkspace('outbox')}
            >
              <Inbox size={16} />
              Outbox
            </button>
          </div>
        </div>
      </section>

      {activeWorkspace === 'compose' ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.8fr)]">
          <form
            className="panel p-5 sm:p-6"
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

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
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
                  <option value="address_books">Selected address books</option>
                  <option value="pasted_contacts">Pasted contacts</option>
                </select>
              </div>

              <div>
                <label className="label">Sender shortcode</label>
                <select
                  className="input"
                  value={form.smsShortcode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      smsShortcode: event.target.value,
                    }))
                  }
                >
                  {shortcodes.length === 0 ? (
                    <option value="">Default shortcode</option>
                  ) : null}
                  {shortcodes.map((shortcode: string) => (
                    <option key={shortcode} value={shortcode}>
                      {shortcode}
                      {shortcode === defaultShortcode ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="label">Pasted contacts</label>
                <textarea
                  className="input min-h-28 resize-y"
                  placeholder="Optional. One per line: First name, 07... or Jane Doe 2547..."
                  value={form.pastedContacts}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pastedContacts: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="lg:col-span-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <label className="label mb-0">Message</label>
                  <span className="text-xs text-stone-400">
                    {form.message.length} chars | {smsUnits(form.message)} unit
                    {smsUnits(form.message) === 1 ? '' : 's'} |{' '}
                    {remainingCharacters} left on current page
                  </span>
                </div>
                <textarea
                  className="input mt-2 min-h-44 resize-y"
                  placeholder="Use {firstName} or {name} to personalize each message."
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
                className="btn-primary w-full justify-center lg:col-span-2"
                disabled={sendMutation.isPending}
                type="submit"
              >
                <Send size={16} />
                {sendMutation.isPending ? 'Sending...' : 'Send bulk message'}
              </button>
            </div>
          </form>

          <section className="panel p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Upload className="mt-1 text-amber-200" size={18} />
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Address Books
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Saved contact groups
                </h3>
              </div>
            </div>

            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                createAddressBookMutation.mutate();
              }}
            >
              <div>
                <label className="label">Book name</label>
                <input
                  className="input"
                  placeholder="Women group, Youth leaders..."
                  value={addressBookForm.name}
                  onChange={(event) =>
                    setAddressBookForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="label">Contacts</label>
                <input
                  accept=".csv,.txt"
                  className="input mb-3"
                  type="file"
                  onChange={(event) => {
                    loadAddressBookFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                <textarea
                  className="input min-h-36 resize-y"
                  placeholder="One per line: Jane, 0712345678 or Peter Otieno 2547..."
                  value={addressBookForm.contactsText}
                  onChange={(event) =>
                    setAddressBookForm((current) => ({
                      ...current,
                      contactsText: event.target.value,
                    }))
                  }
                />
              </div>

              <button
                className="btn-secondary w-full justify-center"
                disabled={createAddressBookMutation.isPending}
                type="submit"
              >
                <Upload size={16} />
                {createAddressBookMutation.isPending
                  ? 'Saving...'
                  : 'Save address book'}
              </button>
            </form>

            <div className="mt-6 space-y-2">
              {books.map((book: any) => {
                const isSelected = form.addressBookIds.includes(book.id);
                return (
                  <button
                    key={book.id}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      isSelected
                        ? 'border-amber-200/50 bg-amber-200/15 text-white'
                        : 'border-white/10 bg-black/10 text-stone-300 hover:bg-white/5 hover:text-white'
                    }`}
                    type="button"
                    onClick={() => toggleAddressBook(book.id)}
                  >
                    <span>
                      <span className="block font-semibold">{book.name}</span>
                      <span className="text-xs text-stone-400">
                        {Number(book.contactCount || 0).toLocaleString()}{' '}
                        contacts
                      </span>
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                      {isSelected ? 'Selected' : 'Select'}
                    </span>
                  </button>
                );
              })}
              {books.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-4 text-sm text-stone-400">
                  Save your first contact group, then select it for a bulk send.
                </div>
              ) : null}
            </div>
          </section>
        </section>
      ) : (
        <section className="space-y-5">
          <section className="panel p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <SlidersHorizontal className="mt-1 text-amber-200" size={18} />
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Outbox Filters
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Review provider and delivery activity
                </h3>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
              <div>
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

          <section className="table-shell">
            <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  SMS Outbox
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Provider and delivery status
                </h3>
              </div>
              <button
                className="btn-secondary justify-center"
                type="button"
                onClick={downloadOutbox}
              >
                <Download size={16} />
                Download CSV
              </button>
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
                            {item.recipientName ||
                              item.contributor?.name ||
                              'Recipient'}
                          </div>
                          <div className="text-xs text-stone-400">
                            {item.isHashedRecipient
                              ? 'Hashed Safaricom recipient'
                              : item.recipientMobile}
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
        </section>
      )}
    </div>
  );
}
