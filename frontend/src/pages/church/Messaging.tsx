import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileSpreadsheet,
  Inbox,
  Send,
  SlidersHorizontal,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
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

const initialGroupForm = {
  name: '',
};

const initialContactForm = {
  name: '',
  phone: '',
};

const initialUploadForm = {
  addressBookId: '',
  contactsText: '',
};

const initialOutboxFilters = {
  from: '',
  to: '',
  type: '',
  sendStatus: '',
  deliveryStatus: '',
};

type Workspace = 'compose' | 'addressBooks' | 'upload' | 'outbox';

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

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function ChurchMessaging() {
  const queryClient = useQueryClient();
  const [activeWorkspace, setActiveWorkspace] =
    useState<Workspace>('compose');
  const [form, setForm] = useState(initialMessageForm);
  const [groupForm, setGroupForm] = useState(initialGroupForm);
  const [contactForm, setContactForm] = useState(initialContactForm);
  const [uploadForm, setUploadForm] = useState(initialUploadForm);
  const [selectedAddressBookId, setSelectedAddressBookId] = useState('');
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

  const { data: addressBookContacts, isLoading: contactsLoading } = useQuery({
    queryKey: ['church-address-book-contacts', selectedAddressBookId],
    enabled: Boolean(selectedAddressBookId),
    queryFn: () =>
      api
        .get(
          `/church/messaging/address-books/${selectedAddressBookId}/contacts`,
        )
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
  const outboxRows = outbox || [];
  const books = addressBooks || [];
  const selectedBook =
    books.find((book: any) => book.id === selectedAddressBookId) || books[0];
  const contacts = addressBookContacts || [];

  useEffect(() => {
    if (!form.smsShortcode && defaultShortcode) {
      setForm((current) => ({
        ...current,
        smsShortcode: defaultShortcode,
      }));
    }
  }, [defaultShortcode, form.smsShortcode]);

  useEffect(() => {
    if (!selectedAddressBookId && books.length > 0) {
      setSelectedAddressBookId(books[0].id);
    }
  }, [books, selectedAddressBookId]);

  useEffect(() => {
    if (!uploadForm.addressBookId && selectedBook?.id) {
      setUploadForm((current) => ({
        ...current,
        addressBookId: selectedBook.id,
      }));
    }
  }, [selectedBook?.id, uploadForm.addressBookId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (
        form.audience === 'address_books' &&
        form.addressBookIds.length === 0
      ) {
        throw new Error('Select at least one address book group');
      }
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
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          'Unable to send bulk SMS',
      );
    },
  });

  const createAddressBookMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/church/messaging/address-books', {
        name: groupForm.name,
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Contact group created');
      setGroupForm(initialGroupForm);
      if (data?.id) {
        setSelectedAddressBookId(data.id);
        setUploadForm((current) => ({ ...current, addressBookId: data.id }));
      }
      queryClient.invalidateQueries({ queryKey: ['church-address-books'] });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to create contact group',
      );
    },
  });

  const addContactMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAddressBookId) {
        throw new Error('Create or select a contact group first');
      }
      const response = await api.post(
        `/church/messaging/address-books/${selectedAddressBookId}/contacts`,
        contactForm,
      );
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(data?.created ? 'Contact added' : 'Contact updated');
      setContactForm(initialContactForm);
      queryClient.invalidateQueries({ queryKey: ['church-address-books'] });
      queryClient.invalidateQueries({
        queryKey: ['church-address-book-contacts', selectedAddressBookId],
      });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          'Unable to save contact',
      );
    },
  });

  const importContactsMutation = useMutation({
    mutationFn: async () => {
      if (!uploadForm.addressBookId) {
        throw new Error('Select a contact group for this upload');
      }
      if (!uploadForm.contactsText.trim()) {
        throw new Error('Upload or paste contacts before importing');
      }
      const response = await api.post(
        `/church/messaging/address-books/${uploadForm.addressBookId}/contacts/import`,
        { contactsText: uploadForm.contactsText },
      );
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(
        `Imported ${Number(data.imported || 0).toLocaleString()} contact(s), updated ${Number(data.updated || 0).toLocaleString()}`,
      );
      setUploadForm((current) => ({ ...current, contactsText: '' }));
      queryClient.invalidateQueries({ queryKey: ['church-address-books'] });
      queryClient.invalidateQueries({
        queryKey: ['church-address-book-contacts', uploadForm.addressBookId],
      });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          'Unable to import contacts',
      );
    },
  });

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

  const loadUploadFile = (file?: File) => {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      toast.error('Please upload the CSV template file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadForm((current) => ({
        ...current,
        contactsText: String(reader.result || ''),
      }));
    };
    reader.readAsText(file);
  };

  const downloadAddressBookTemplate = () => {
    downloadTextFile(
      'address-book-template.csv',
      'firstName,lastName,phone\nJane,Otieno,0712345678\nPeter,Mwangi,254712345678\n',
    );
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

  const renderWorkspaceTab = (
    id: Workspace,
    label: string,
    Icon: typeof Send,
  ) => (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
        activeWorkspace === id
          ? 'bg-amber-200 text-stone-950'
          : 'text-stone-300 hover:bg-white/5 hover:text-white'
      }`}
      type="button"
      onClick={() => setActiveWorkspace(id)}
    >
      <Icon size={16} />
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <section className="panel p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
              SMS units used
            </p>
            <div className="mt-1 text-xl font-semibold text-white">
              {Number(usage?.units || 0).toLocaleString()}
            </div>
          </div>

          <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-black/10 p-1 sm:grid-cols-4">
            {renderWorkspaceTab('compose', 'Compose', Send)}
            {renderWorkspaceTab('addressBooks', 'Address Books', Users)}
            {renderWorkspaceTab('upload', 'Upload', Upload)}
            {renderWorkspaceTab('outbox', 'Outbox', Inbox)}
          </div>
        </div>
      </section>

      {activeWorkspace === 'compose' ? (
        <section className="panel p-5 sm:p-6">
          <form
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
                <label className="label">Address book groups</label>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {books.map((book: any) => {
                    const isSelected = form.addressBookIds.includes(book.id);
                    return (
                      <button
                        key={book.id}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          isSelected
                            ? 'border-amber-200/50 bg-amber-200/15 text-white'
                            : 'border-white/10 bg-black/10 text-stone-300 hover:bg-white/5 hover:text-white'
                        }`}
                        type="button"
                        onClick={() => toggleAddressBook(book.id)}
                      >
                        <span className="block font-semibold">{book.name}</span>
                        <span className="text-xs text-stone-400">
                          {Number(book.contactCount || 0).toLocaleString()}{' '}
                          contacts
                        </span>
                      </button>
                    );
                  })}
                  {books.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-stone-400">
                      Create a contact group from the Address Books tab.
                    </div>
                  ) : null}
                </div>
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
        </section>
      ) : null}

      {activeWorkspace === 'addressBooks' ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.3fr)]">
          <section className="panel p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Users className="mt-1 text-amber-200" size={18} />
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Contact Groups
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Create and select a group
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
                <label className="label">Group name</label>
                <input
                  className="input"
                  placeholder="Women group, Youth leaders..."
                  value={groupForm.name}
                  onChange={(event) =>
                    setGroupForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>

              <button
                className="btn-secondary w-full justify-center"
                disabled={createAddressBookMutation.isPending}
                type="submit"
              >
                <Users size={16} />
                {createAddressBookMutation.isPending
                  ? 'Creating...'
                  : 'Create group'}
              </button>
            </form>

            <div className="mt-6 space-y-2">
              {books.map((book: any) => {
                const isOpen = selectedAddressBookId === book.id;
                return (
                  <button
                    key={book.id}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      isOpen
                        ? 'border-amber-200/50 bg-amber-200/15 text-white'
                        : 'border-white/10 bg-black/10 text-stone-300 hover:bg-white/5 hover:text-white'
                    }`}
                    type="button"
                    onClick={() => {
                      setSelectedAddressBookId(book.id);
                      setUploadForm((current) => ({
                        ...current,
                        addressBookId: book.id,
                      }));
                    }}
                  >
                    <span>
                      <span className="block font-semibold">{book.name}</span>
                      <span className="text-xs text-stone-400">
                        {Number(book.contactCount || 0).toLocaleString()}{' '}
                        contacts
                      </span>
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                      {isOpen ? 'Open' : 'View'}
                    </span>
                  </button>
                );
              })}
              {books.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-4 text-sm text-stone-400">
                  No contact groups yet.
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Group Contacts
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {selectedBook?.name || 'Select a group'}
                </h3>
              </div>
              {selectedBook ? (
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={() => {
                    setUploadForm((current) => ({
                      ...current,
                      addressBookId: selectedBook.id,
                    }));
                    setActiveWorkspace('upload');
                  }}
                >
                  <Upload size={16} />
                  Upload contacts
                </button>
              ) : null}
            </div>

            <form
              className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.8fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                addContactMutation.mutate();
              }}
            >
              <div>
                <label className="label">Contact name</label>
                <input
                  className="input"
                  placeholder="Jane Otieno"
                  value={contactForm.name}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="label">Phone number</label>
                <input
                  className="input"
                  placeholder="0712345678"
                  value={contactForm.phone}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex items-end">
                <button
                  className="btn-primary w-full justify-center lg:w-auto"
                  disabled={addContactMutation.isPending || !selectedBook}
                  type="submit"
                >
                  <UserPlus size={16} />
                  {addContactMutation.isPending ? 'Saving...' : 'Add contact'}
                </button>
              </div>
            </form>

            <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
              {contactsLoading ? (
                <div className="p-5 text-stone-300">Loading contacts...</div>
              ) : contacts.length > 0 ? (
                <div className="table-scroll-region">
                  <table className="w-full min-w-[640px] divide-y divide-white/10 text-sm">
                    <thead className="bg-black/20 text-left text-xs uppercase tracking-[0.22em] text-stone-400">
                      <tr>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3">Source</th>
                        <th className="px-4 py-3">Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((contact: any) => (
                        <tr
                          className="border-t border-white/5"
                          key={contact.id}
                        >
                          <td className="px-4 py-3 font-medium text-white">
                            {contact.displayName || contact.firstName || '-'}
                          </td>
                          <td className="px-4 py-3">{contact.normalizedPhone}</td>
                          <td className="px-4 py-3">
                            {contact.sourceLabel || 'manual'}
                          </td>
                          <td className="px-4 py-3 text-xs text-stone-400">
                            {new Date(contact.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-5 text-sm text-stone-400">
                  No contacts in this group yet.
                </div>
              )}
            </div>
          </section>
        </section>
      ) : null}

      {activeWorkspace === 'upload' ? (
        <section className="panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-1 text-amber-200" size={18} />
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Contact Upload
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Import contacts into a group
                </h3>
              </div>
            </div>
            <button
              className="btn-secondary justify-center"
              type="button"
              onClick={downloadAddressBookTemplate}
            >
              <Download size={16} />
              Download Excel CSV template
            </button>
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
            <div className="space-y-4 rounded-3xl border border-white/10 bg-black/10 p-4">
              <div>
                <label className="label">Destination group</label>
                <select
                  className="input"
                  value={uploadForm.addressBookId}
                  onChange={(event) =>
                    setUploadForm((current) => ({
                      ...current,
                      addressBookId: event.target.value,
                    }))
                  }
                >
                  <option value="">Select group</option>
                  {books.map((book: any) => (
                    <option key={book.id} value={book.id}>
                      {book.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Upload file</label>
                <input
                  accept=".csv,.txt"
                  className="input"
                  type="file"
                  onChange={(event) => {
                    loadUploadFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </div>

              <button
                className="btn-primary w-full justify-center"
                disabled={importContactsMutation.isPending}
                type="button"
                onClick={() => importContactsMutation.mutate()}
              >
                <Upload size={16} />
                {importContactsMutation.isPending
                  ? 'Importing...'
                  : 'Upload to group'}
              </button>
            </div>

            <div>
              <label className="label">Upload preview</label>
              <textarea
                className="input min-h-[320px] resize-y font-mono text-sm"
                placeholder="firstName,lastName,phone&#10;Jane,Otieno,0712345678"
                value={uploadForm.contactsText}
                onChange={(event) =>
                  setUploadForm((current) => ({
                    ...current,
                    contactsText: event.target.value,
                  }))
                }
              />
            </div>
          </div>
        </section>
      ) : null}

      {activeWorkspace === 'outbox' ? (
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
      ) : null}
    </div>
  );
}
