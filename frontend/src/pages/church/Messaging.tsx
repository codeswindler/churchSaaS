import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  Inbox,
  Loader2,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import SmsPhonePreview from '../../components/SmsPhonePreview';
import api from '../../services/api';
import {
  getGsm7SmsMetrics,
  renderSmsPreviewPlaceholders,
} from '../../services/smsMetrics';

const initialMessageForm = {
  genderFilter: '',
  message: '',
  pastedContacts: '',
  addressBookIds: [] as string[],
  fundAccountIds: [] as string[],
  smsShortcode: '',
};

const initialGroupForm = {
  name: '',
};

const initialContactForm = {
  name: '',
  phone: '',
  gender: '',
};

const initialUploadForm = {
  addressBookId: '',
  contactsText: '',
  file: null as File | null,
};

const initialOutboxFilters = {
  from: '',
  to: '',
  type: '',
  sendStatus: '',
  deliveryStatus: '',
};

type Workspace = 'outbox' | 'compose' | 'addressBooks';

const audienceFilterOptions = [
  {
    id: '',
    title: 'All recipients',
    description: 'No tag filter on selected sources.',
  },
  {
    id: 'male',
    title: 'Men',
    description: 'Selected contributors or contacts tagged male.',
  },
  {
    id: 'female',
    title: 'Women',
    description: 'Selected contributors or contacts tagged female.',
  },
] as const;

function toQueryString(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
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

function formatCount(value: unknown) {
  return Number(value || 0).toLocaleString();
}

const selectableTileClass =
  'rounded-2xl border px-4 py-3 text-left transition';
const selectedTileClass =
  'border-emerald-300/60 bg-emerald-300/15 text-white shadow-[0_0_0_1px_rgba(110,231,183,0.14)]';
const idleTileClass =
  'border-white/10 bg-black/10 text-stone-300 hover:border-emerald-300/35 hover:bg-emerald-300/10 hover:text-white';

function normalizeWorkspace(value: string | null): Workspace {
  return value === 'outbox' || value === 'addressBooks' ? value : 'compose';
}

export default function ChurchMessaging() {
  const queryClient = useQueryClient();
  const messageTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [routeSearchParams, setRouteSearchParams] = useSearchParams();
  const activeWorkspace = normalizeWorkspace(routeSearchParams.get('tab'));
  const setActiveWorkspace = (workspace: Workspace) => {
    const next = new URLSearchParams(routeSearchParams);
    next.set('tab', workspace);
    setRouteSearchParams(next);
  };
  const [form, setForm] = useState(initialMessageForm);
  const [groupForm, setGroupForm] = useState(initialGroupForm);
  const [contactForm, setContactForm] = useState(initialContactForm);
  const [uploadForm, setUploadForm] = useState(initialUploadForm);
  const [selectedAddressBookId, setSelectedAddressBookId] = useState('');
  const [filters, setFilters] = useState(initialOutboxFilters);
  const [selectedOutboxMessage, setSelectedOutboxMessage] =
    useState<any | null>(null);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [activePurchase, setActivePurchase] = useState<any | null>(null);
  const [sendCountdown, setSendCountdown] = useState<number | null>(null);
  const queryString = useMemo(() => toQueryString(filters), [filters]);
  const messageMetrics = getGsm7SmsMetrics(form.message);
  const hasSelectedAudience =
    form.fundAccountIds.length > 0 ||
    form.addressBookIds.length > 0 ||
    form.pastedContacts.trim().length > 0;
  const quotePayload = useMemo(
    () => ({
      genderFilter: form.genderFilter,
      message: form.message,
      pastedContacts: form.pastedContacts,
      addressBookIds: [...form.addressBookIds],
      fundAccountIds: [...form.fundAccountIds],
      smsShortcode: form.smsShortcode,
    }),
    [
      form.addressBookIds,
      form.fundAccountIds,
      form.genderFilter,
      form.message,
      form.pastedContacts,
      form.smsShortcode,
    ],
  );
  const selectedOutboxMetrics = selectedOutboxMessage
    ? getGsm7SmsMetrics(selectedOutboxMessage.messageBody || '')
    : null;

  const { data: messagingConfig, isLoading: messagingConfigLoading } = useQuery({
    queryKey: ['church-messaging-config'],
    queryFn: () =>
      api.get('/church/messaging/config').then((response) => response.data),
  });

  const { data: addressBooks } = useQuery({
    queryKey: ['church-address-books'],
    queryFn: () =>
      api
        .get('/church/messaging/address-books')
        .then((response) => response.data),
  });

  const { data: fundAccountList, isLoading: fundAccountsLoading } = useQuery({
    queryKey: ['church-messaging-fund-accounts'],
    queryFn: () =>
      api.get('/church/fund-accounts').then((response) => response.data),
    retry: false,
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

  const { data: bulkQuote, isFetching: isQuoteLoading } = useQuery({
    queryKey: ['church-bulk-sms-quote', quotePayload],
    enabled:
      activeWorkspace === 'compose' &&
      hasSelectedAudience &&
      Boolean(form.message.trim()),
    queryFn: () =>
      api
        .post('/church/messaging/bulk/quote', quotePayload)
        .then((response) => response.data),
    retry: false,
    staleTime: 5000,
  });

  const shortcodes = messagingConfig?.smsShortcodes || [];
  const isLoadingFundAccounts =
    messagingConfigLoading || fundAccountsLoading;
  const resolvedFundAccounts =
    Array.isArray(fundAccountList) && fundAccountList.length > 0
      ? fundAccountList
      : messagingConfig?.fundAccounts || fundAccountList || [];
  const fundAccounts = resolvedFundAccounts.filter(
    (fundAccount: any) => fundAccount.isActive !== false,
  );
  const defaultShortcode =
    messagingConfig?.defaultSmsShortcode || shortcodes[0] || '';
  const outboxRows = outbox || [];
  const books = addressBooks || [];
  const messagePreview = renderSmsPreviewPlaceholders(form.message);
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

  const createPurchaseMutation = useMutation({
    mutationFn: async (payload: typeof quotePayload & { payerPhone: string }) => {
      const response = await api.post('/church/messaging/bulk/purchase', payload);
      return response.data;
    },
    onSuccess: (data) => {
      setActivePurchase(data);
      setSendCountdown(null);
      toast.success(data.statusDescription || 'STK push sent');
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          'Unable to start SMS unit payment',
      );
    },
  });

  const sendPaidPurchaseMutation = useMutation({
    mutationFn: async (purchaseId: string) => {
      const response = await api.post(
        `/church/messaging/bulk/purchases/${purchaseId}/send`,
      );
      return response.data;
    },
    onSuccess: (data) => {
      setActivePurchase(data);
      toast.success('Bulk SMS sent');
      setForm({
        ...initialMessageForm,
        smsShortcode: defaultShortcode,
      });
      setPaymentPhone('');
      setActiveWorkspace('outbox');
      queryClient.invalidateQueries({ queryKey: ['church-sms-outbox'] });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          'Payment confirmed, but SMS sending failed',
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

  const deleteAddressBookMutation = useMutation({
    mutationFn: async (addressBookId: string) => {
      await api.delete(`/church/messaging/address-books/${addressBookId}`);
      return addressBookId;
    },
    onSuccess: (addressBookId) => {
      toast.success('Contact group deleted');
      const nextBook = books.find((book: any) => book.id !== addressBookId);
      if (selectedAddressBookId === addressBookId) {
        setSelectedAddressBookId(nextBook?.id || '');
        setUploadForm((current) => ({
          ...current,
          addressBookId: nextBook?.id || '',
        }));
      }
      setForm((current) => ({
        ...current,
        addressBookIds: current.addressBookIds.filter(
          (bookId) => bookId !== addressBookId,
        ),
      }));
      queryClient.invalidateQueries({ queryKey: ['church-address-books'] });
      queryClient.removeQueries({
        queryKey: ['church-address-book-contacts', addressBookId],
      });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          'Unable to delete contact group',
      );
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (payload: { addressBookId: string; contactId: string }) => {
      await api.delete(
        `/church/messaging/address-books/${payload.addressBookId}/contacts/${payload.contactId}`,
      );
      return payload;
    },
    onSuccess: ({ addressBookId }) => {
      toast.success('Contact deleted');
      queryClient.invalidateQueries({ queryKey: ['church-address-books'] });
      queryClient.invalidateQueries({
        queryKey: ['church-address-book-contacts', addressBookId],
      });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          'Unable to delete contact',
      );
    },
  });

  const importContactsMutation = useMutation({
    mutationFn: async () => {
      if (!uploadForm.addressBookId) {
        throw new Error('Select a contact group for this upload');
      }
      if (!uploadForm.file && !uploadForm.contactsText.trim()) {
        throw new Error('Upload or paste contacts before importing');
      }

      if (uploadForm.file) {
        const payload = new FormData();
        payload.append('file', uploadForm.file);
        const response = await api.post(
          `/church/messaging/address-books/${uploadForm.addressBookId}/contacts/import-file`,
          payload,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        return response.data;
      }

      const response = await api.post(
        `/church/messaging/address-books/${uploadForm.addressBookId}/contacts/import`,
        { contactsText: uploadForm.contactsText },
      );
      return response.data;
    },
    onSuccess: (data) => {
      toast.custom(
        (toastInstance) => (
          <div
            className={`w-[min(92vw,420px)] rounded-3xl border border-white/10 bg-stone-950/95 p-4 text-stone-100 shadow-2xl backdrop-blur-xl transition ${
              toastInstance.visible
                ? 'translate-y-0 opacity-100'
                : 'translate-y-2 opacity-0'
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
              Upload Summary
            </p>
            <h4 className="mt-2 text-lg font-semibold text-white">
              Address book import complete
            </h4>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <span>Imported contacts</span>
                <strong>{formatCount(data.imported)}</strong>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <span>Updated existing contacts</span>
                <strong>{formatCount(data.updated)}</strong>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <span>Duplicate rows dropped</span>
                <strong>{formatCount(data.duplicatesDropped)}</strong>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <span>Invalid contacts skipped</span>
                <strong>{formatCount(data.invalid)}</strong>
              </div>
            </div>
          </div>
        ),
        { duration: 7000 },
      );
      setUploadForm((current) => ({
        ...current,
        contactsText: '',
        file: null,
      }));
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

  useEffect(() => {
    if (!activePurchase?.id || activePurchase.status !== 'stk_sent') {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const response = await api.get(
          `/church/messaging/bulk/purchases/${activePurchase.id}`,
        );
        setActivePurchase(response.data);
      } catch (error: any) {
        toast.error(
          error?.response?.data?.message || 'Unable to check payment status',
        );
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [activePurchase?.id, activePurchase?.status]);

  useEffect(() => {
    if (activePurchase?.status === 'confirmed' && sendCountdown === null) {
      setSendCountdown(5);
    }
    if (activePurchase?.status === 'failed') {
      setSendCountdown(null);
    }
  }, [activePurchase?.status, sendCountdown]);

  useEffect(() => {
    if (sendCountdown === null || !activePurchase?.id) {
      return;
    }

    if (sendCountdown <= 0) {
      const purchaseId = activePurchase.id;
      setSendCountdown(null);
      sendPaidPurchaseMutation.mutate(purchaseId);
      return;
    }

    const timer = window.setTimeout(() => {
      setSendCountdown((current) =>
        current === null ? current : Math.max(0, current - 1),
      );
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [activePurchase?.id, sendCountdown, sendPaidPurchaseMutation]);

  const queueSend = () => {
    if (!hasSelectedAudience) {
      toast.error(
        'Select at least one fund account, address book, or pasted contact',
      );
      return;
    }
    if (!form.message.trim()) {
      toast.error('Write the message before sending');
      return;
    }
    if (!paymentPhone.trim()) {
      toast.error('Enter the M-Pesa phone number to buy SMS units');
      return;
    }
    if (!bulkQuote) {
      toast.error('Wait for the SMS unit quote before sending');
      return;
    }
    if (Number(bulkQuote.amountKes || 0) <= 0) {
      toast.error('Ask super admin to configure the SMS unit rate');
      return;
    }

    createPurchaseMutation.mutate({
      ...quotePayload,
      payerPhone: paymentPhone,
    });
  };

  const purchaseStatus = activePurchase?.status as string | undefined;
  const purchaseIsBusy =
    createPurchaseMutation.isPending ||
    sendPaidPurchaseMutation.isPending ||
    purchaseStatus === 'stk_sent' ||
    purchaseStatus === 'confirmed' ||
    purchaseStatus === 'sending';
  const purchaseAmount = Number(activePurchase?.amountKes || 0);
  const purchaseButtonLabel = createPurchaseMutation.isPending
    ? 'Sending STK push...'
    : sendPaidPurchaseMutation.isPending || purchaseStatus === 'sending'
      ? 'Sending messages...'
      : purchaseStatus === 'stk_sent'
        ? 'Waiting for payment...'
        : purchaseStatus === 'confirmed' && sendCountdown !== null
          ? `Sending in ${sendCountdown}s`
          : purchaseStatus === 'failed' || purchaseStatus === 'send_failed'
            ? 'Retry payment and send'
            : 'Buy units and send';
  const purchaseStatusTitle = createPurchaseMutation.isPending
    ? 'Starting payment'
    : sendPaidPurchaseMutation.isPending || purchaseStatus === 'sending'
      ? 'Sending bulk SMS'
      : purchaseStatus === 'stk_sent'
        ? 'Waiting for M-Pesa payment'
        : purchaseStatus === 'confirmed'
          ? 'Payment received'
          : purchaseStatus === 'sent'
            ? 'Bulk SMS sent'
            : purchaseStatus === 'failed'
              ? 'Payment failed'
              : purchaseStatus === 'send_failed'
                ? 'SMS sending failed'
                : 'Payment status';
  const purchaseStatusBody =
    activePurchase?.statusDescription ||
    (purchaseStatus === 'stk_sent'
      ? 'Complete the STK prompt on the payment phone.'
      : purchaseStatus === 'confirmed'
        ? 'Proceeding to send messages automatically.'
        : purchaseStatus === 'sent'
          ? 'The paid bulk message has been sent.'
          : purchaseStatus === 'failed' || purchaseStatus === 'send_failed'
            ? 'Retry the payment flow when ready.'
            : 'SMS unit purchase status is being prepared.');

  const closePurchaseStatus = () => {
    setActivePurchase(null);
    setSendCountdown(null);
  };

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

  const toggleFundAccount = (fundAccountId: string) => {
    setForm((current) => {
      const selected = new Set(current.fundAccountIds);
      if (selected.has(fundAccountId)) {
        selected.delete(fundAccountId);
      } else {
        selected.add(fundAccountId);
      }
      return { ...current, fundAccountIds: Array.from(selected) };
    });
  };

  const setAudienceFilter = (gender: string) => {
    setForm((current) => {
      return { ...current, genderFilter: gender };
    });
  };

  const loadUploadFile = (file?: File) => {
    if (!file) return;
    if (!/\.(xlsx|csv|txt)$/i.test(file.name)) {
      toast.error('Please upload an XLSX, CSV, or TXT contact file');
      return;
    }

    if (/\.xlsx$/i.test(file.name)) {
      setUploadForm((current) => ({
        ...current,
        contactsText: `Excel file selected: ${file.name}\n\nThe first worksheet will be imported using columns like firstName, lastName, phone, and gender.`,
        file,
      }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUploadForm((current) => ({
        ...current,
        contactsText: String(reader.result || ''),
        file: null,
      }));
    };
    reader.readAsText(file);
  };

  const downloadAddressBookTemplate = () => {
    downloadTextFile(
      'address-book-template.csv',
      'firstName,lastName,phone,gender\nJane,Otieno,0712345678,female\nPeter,Mwangi,254712345678,male\n',
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

  const refreshDeliveryReportsMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/church/messaging/outbox/delivery-refresh', {
        limit: 100,
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(
        `Checked ${Number(data.checked || 0).toLocaleString()} delivery report${Number(data.checked || 0) === 1 ? '' : 's'}`,
      );
      queryClient.invalidateQueries({ queryKey: ['church-sms-outbox'] });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to refresh delivery reports',
      );
    },
  });

  const fetchDeliveryReportMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const response = await api.post(
        `/church/messaging/outbox/${messageId}/dlr`,
      );
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(data.deliveryDescription || 'Delivery report refreshed');
      setSelectedOutboxMessage((current) =>
        current
          ? {
              ...current,
              deliveryStatus: data.deliveryStatus || current.deliveryStatus,
              deliveryDescription:
                data.deliveryDescription || current.deliveryDescription,
              deliveryTat: data.deliveryTat || current.deliveryTat,
            }
          : current,
      );
      queryClient.invalidateQueries({ queryKey: ['church-sms-outbox'] });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to fetch delivery report',
      );
    },
  });

  const insertMessagePlaceholder = (placeholder: string) => {
    const textarea = messageTextareaRef.current;
    if (!textarea) {
      setForm((current) => ({
        ...current,
        message: `${current.message}${placeholder}`,
      }));
      return;
    }

    const start = textarea.selectionStart ?? form.message.length;
    const end = textarea.selectionEnd ?? form.message.length;
    const nextMessage = `${form.message.slice(0, start)}${placeholder}${form.message.slice(end)}`;
    setForm((current) => ({
      ...current,
      message: nextMessage,
    }));

    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPosition = start + placeholder.length;
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

  return (
    <div className="space-y-5">
      {activeWorkspace === 'compose' ? (
        <section className="panel p-5 sm:p-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              queueSend();
            }}
          >
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Message Composer
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Create bulk SMS
            </h3>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start">
              <div className="grid gap-4 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <label className="label">Audience</label>
                <div className="grid gap-2 md:grid-cols-3">
                  {audienceFilterOptions.map((audience) => {
                    const isSelected = form.genderFilter === audience.id;
                    return (
                      <button
                        key={audience.id}
                        className={`${selectableTileClass} ${
                          isSelected ? selectedTileClass : idleTileClass
                        }`}
                        type="button"
                        onClick={() => setAudienceFilter(audience.id)}
                      >
                        <span className="block font-semibold">
                          {audience.title}
                        </span>
                        <span className="text-xs text-stone-400">
                          {audience.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-2">
                <label className="label">Fund account contributors</label>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {fundAccounts.map((fundAccount: any) => {
                    const isSelected = form.fundAccountIds.includes(
                      fundAccount.id,
                    );
                    return (
                      <button
                        key={fundAccount.id}
                        className={`${selectableTileClass} ${
                          isSelected ? selectedTileClass : idleTileClass
                        }`}
                        type="button"
                        onClick={() => toggleFundAccount(fundAccount.id)}
                      >
                        <span className="block font-semibold">
                          {fundAccount.name}
                        </span>
                        <span className="text-xs text-stone-400">
                          People who contributed to {fundAccount.code}
                        </span>
                      </button>
                    );
                  })}
                  {fundAccounts.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-stone-400">
                      {isLoadingFundAccounts
                        ? 'Loading fund accounts...'
                        : 'No active fund accounts found for this church.'}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="lg:col-span-2">
                <label className="label">Address book groups</label>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {books.map((book: any) => {
                    const isSelected = form.addressBookIds.includes(book.id);
                    return (
                      <button
                        key={book.id}
                        className={`${selectableTileClass} ${
                          isSelected ? selectedTileClass : idleTileClass
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
                <div className="mb-3 rounded-2xl border border-white/10 bg-black/10 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                    Personalization placeholder
                  </p>
                  <button
                    className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-200/40 bg-amber-200/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-200 hover:text-stone-950"
                    type="button"
                    onClick={() => insertMessagePlaceholder('{name}')}
                  >
                    Recipient name
                    <span className="rounded-full bg-black/20 px-2 py-0.5 font-mono text-xs">
                      {'{name}'}
                    </span>
                  </button>
                </div>
                <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                  <label className="label mb-0">Message</label>
                  <span className="text-xs text-stone-400">
                    {messageMetrics.length} chars | {messageMetrics.segments}{' '}
                    unit{messageMetrics.segments === 1 ? '' : 's'} |{' '}
                    {messageMetrics.remainingInCurrentSegment} left on current
                    segment
                  </span>
                </div>
                <textarea
                  ref={messageTextareaRef}
                  className="input mt-2 min-h-44 resize-y"
                  placeholder="Use {name} to personalize each message. Example: Dear {name}, our meeting starts at 5 PM."
                  value={form.message}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      message: event.target.value,
                    }))
                  }
                />
                <div className="mt-4 max-w-md">
                  <label className="label">Sender ID</label>
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
                      <option value="">Default sender</option>
                    ) : null}
                    {shortcodes.map((shortcode: string) => (
                      <option key={shortcode} value={shortcode}>
                        {shortcode}
                        {shortcode === defaultShortcode ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-black/10 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                      Send quote
                    </p>
                    <h4 className="mt-1 text-lg font-semibold text-white">
                      {bulkQuote
                        ? `${Number(bulkQuote.recipientCount || 0).toLocaleString()} recipients, ${Number(bulkQuote.totalUnits || 0).toLocaleString()} SMS units`
                        : isQuoteLoading
                          ? 'Calculating recipients and SMS units...'
                          : 'Select recipients and write a message to calculate units'}
                    </h4>
                  </div>
                  {bulkQuote ? (
                    <div className="rounded-2xl border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-50">
                      KES{' '}
                      {Number(bulkQuote.amountKes || 0).toLocaleString(
                        undefined,
                        {
                          maximumFractionDigits: 2,
                          minimumFractionDigits: 2,
                        },
                      )}{' '}
                      at KES{' '}
                      {Number(bulkQuote.smsUnitRateKes || 0).toFixed(2)}/unit
                    </div>
                  ) : null}
                </div>

                {bulkQuote ? (
                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <span className="text-xs uppercase tracking-[0.18em] text-stone-400">
                        Duplicates dropped
                      </span>
                      <strong className="mt-1 block text-white">
                        {Number(bulkQuote.duplicateCount || 0).toLocaleString()}
                      </strong>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <span className="text-xs uppercase tracking-[0.18em] text-stone-400">
                        Plain / hashed
                      </span>
                      <strong className="mt-1 block text-white">
                        {Number(
                          bulkQuote.plainRecipientCount || 0,
                        ).toLocaleString()}{' '}
                        /{' '}
                        {Number(
                          bulkQuote.hashedRecipientCount || 0,
                        ).toLocaleString()}
                      </strong>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <span className="text-xs uppercase tracking-[0.18em] text-stone-400">
                        Rendered length
                      </span>
                      <strong className="mt-1 block text-white">
                        {Number(bulkQuote.minRenderedLength || 0)}-
                        {Number(bulkQuote.maxRenderedLength || 0)} chars
                      </strong>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <span className="text-xs uppercase tracking-[0.18em] text-stone-400">
                        Unit split
                      </span>
                      <strong className="mt-1 block text-white">
                        {(bulkQuote.unitBreakdown || [])
                          .map(
                            (item: any) =>
                              `${Number(item.recipients || 0)} x ${Number(
                                item.unitsPerRecipient || 0,
                              )}`,
                          )
                          .join(', ') || 'n/a'}
                      </strong>
                    </div>
                  </div>
                ) : null}
                <p className="mt-4 text-xs leading-5 text-stone-400">
                  Selected sources: {form.fundAccountIds.length} fund account
                  {form.fundAccountIds.length === 1 ? '' : 's'},{' '}
                  {form.addressBookIds.length} address book
                  {form.addressBookIds.length === 1 ? '' : 's'}
                  {form.pastedContacts.trim() ? ', plus pasted contacts' : ''}.
                  The quote resolves every selected source and drops duplicate
                  recipients before payment and sending.
                </p>
              </div>

              <div className="lg:col-span-2">
                <label className="label">M-Pesa payment phone</label>
                <input
                  className="input"
                  placeholder="0712 345 678"
                  value={paymentPhone}
                  onChange={(event) => setPaymentPhone(event.target.value)}
                />
                <p className="mt-2 text-xs text-stone-400">
                  The STK prompt is sent to this phone. Messages send
                  automatically after payment confirmation.
                </p>
              </div>

              {activePurchase ? (
                <div className="lg:col-span-2 rounded-3xl border border-amber-200/30 bg-amber-200/10 p-4">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-1 text-amber-200" size={18} />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-100">
                        {purchaseStatusTitle}
                      </p>
                      <p className="mt-1 text-sm text-stone-200">
                        {purchaseStatusBody}
                      </p>
                      {sendCountdown !== null ? (
                        <p className="mt-2 text-sm font-semibold text-white">
                          Sending messages in {sendCountdown}s
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <button
                className="btn-primary w-full justify-center lg:col-span-2"
                disabled={purchaseIsBusy}
                type="submit"
              >
                <CreditCard size={16} />
                {purchaseButtonLabel}
              </button>
              </div>

              <div className="xl:sticky xl:top-6">
                <SmsPhonePreview
                  message={messagePreview}
                  sender={form.smsShortcode || defaultShortcode || 'Choice SMS'}
                />
              </div>
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
                  <div
                    key={book.id}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      isOpen ? selectedTileClass : idleTileClass
                    }`}
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
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
                        <span className="block truncate font-semibold">
                          {book.name}
                        </span>
                        <span className="text-xs text-stone-400">
                          {Number(book.contactCount || 0).toLocaleString()}{' '}
                          contacts
                        </span>
                      </span>
                    </button>
                    <div className="ml-3 flex items-center gap-2">
                      <button
                        className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
                        type="button"
                        onClick={() => {
                          setSelectedAddressBookId(book.id);
                          setUploadForm((current) => ({
                            ...current,
                            addressBookId: book.id,
                          }));
                        }}
                      >
                        {isOpen ? 'Open' : 'View'}
                      </button>
                      <button
                        aria-label={`Delete ${book.name}`}
                        className="rounded-full border border-rose-300/25 bg-rose-300/10 p-2 text-rose-100 transition hover:border-rose-200/60 hover:bg-rose-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={deleteAddressBookMutation.isPending}
                        title="Delete group"
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete "${book.name}" and all contacts in this group?`,
                            )
                          ) {
                            deleteAddressBookMutation.mutate(book.id);
                          }
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
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
                    document
                      .getElementById('contact-upload-panel')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  <Upload size={16} />
                  Upload contacts
                </button>
              ) : null}
            </div>

            <form
              className="mt-6 grid gap-4 xl:grid-cols-[1fr_0.75fr_0.65fr_auto]"
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
              <div>
                <label className="label">Gender</label>
                <select
                  className="input"
                  value={contactForm.gender}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      gender: event.target.value,
                    }))
                  }
                >
                  <option value="">Not tagged</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
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
                  <table className="mobile-card-table w-full min-w-[720px] divide-y divide-white/10 text-sm">
                    <thead className="bg-black/20 text-left text-xs uppercase tracking-[0.22em] text-stone-400">
                      <tr>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3">Gender</th>
                        <th className="px-4 py-3">Source</th>
                        <th className="px-4 py-3">Added</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((contact: any) => (
                        <tr
                          className="border-t border-white/5"
                          key={contact.id}
                        >
                          <td
                            className="px-4 py-3 font-medium text-white"
                            data-label="Name"
                          >
                            {contact.displayName || contact.firstName || '-'}
                          </td>
                          <td className="px-4 py-3" data-label="Phone">
                            {contact.normalizedPhone}
                          </td>
                          <td className="px-4 py-3 capitalize" data-label="Gender">
                            {contact.gender || '-'}
                          </td>
                          <td className="px-4 py-3" data-label="Source">
                            {contact.sourceLabel || 'manual'}
                          </td>
                          <td
                            className="px-4 py-3 text-xs text-stone-400"
                            data-label="Added"
                          >
                            {new Date(contact.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3" data-label="Actions">
                            <button
                              aria-label={`Delete ${
                                contact.displayName ||
                                contact.firstName ||
                                'contact'
                              }`}
                              className="btn-secondary px-3 py-2 text-rose-100 hover:border-rose-200/50 hover:bg-rose-300/10"
                              disabled={deleteContactMutation.isPending}
                              title="Delete contact"
                              type="button"
                              onClick={() => {
                                const label =
                                  contact.displayName ||
                                  contact.firstName ||
                                  contact.normalizedPhone ||
                                  'this contact';
                                if (
                                  window.confirm(
                                    `Delete ${label} from ${
                                      selectedBook?.name || 'this group'
                                    }?`,
                                  )
                                ) {
                                  deleteContactMutation.mutate({
                                    addressBookId:
                                      contact.addressBookId ||
                                      selectedAddressBookId,
                                    contactId: contact.id,
                                  });
                                }
                              }}
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
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

      {activeWorkspace === 'addressBooks' ? (
        <section id="contact-upload-panel" className="panel p-5 sm:p-6">
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
              Download CSV template
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
                  accept=".xlsx,.csv,.txt"
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
                  : uploadForm.file
                    ? 'Upload Excel to group'
                    : 'Upload to group'}
              </button>
            </div>

            <div>
              <label className="label">Upload preview</label>
              <textarea
                className="input min-h-[320px] resize-y font-mono text-sm"
                placeholder="firstName,lastName,phone,gender&#10;Jane,Otieno,0712345678,female"
                readOnly={Boolean(uploadForm.file)}
                value={uploadForm.contactsText}
                onChange={(event) =>
                  setUploadForm((current) => ({
                    ...current,
                    contactsText: event.target.value,
                    file: null,
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
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  className="btn-secondary justify-center"
                  disabled={refreshDeliveryReportsMutation.isPending}
                  type="button"
                  onClick={() => refreshDeliveryReportsMutation.mutate()}
                >
                  <RotateCcw size={16} />
                  {refreshDeliveryReportsMutation.isPending
                    ? 'Checking reports...'
                    : 'Refresh delivery reports'}
                </button>
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={downloadOutbox}
                >
                  <Download size={16} />
                  Download CSV
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="p-6 text-stone-300">Loading outbox...</div>
            ) : (
              <div className="table-scroll-region">
                <table className="mobile-card-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Recipient</th>
                      <th>Type</th>
                      <th>Units</th>
                      <th>Provider</th>
                      <th>Delivery</th>
                      <th>Message</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboxRows.map((item: any) => (
                      <tr key={item.id}>
                        <td className="mono text-xs" data-label="Date">
                          {new Date(item.createdAt).toLocaleString()}
                        </td>
                        <td data-label="Recipient">
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
                        <td data-label="Type">{item.messageType}</td>
                        <td data-label="Units">{item.estimatedUnits}</td>
                        <td data-label="Provider">
                          {item.providerDescription || item.sendStatus}
                        </td>
                        <td data-label="Delivery">
                          {item.deliveryDescription || item.deliveryStatus}
                        </td>
                        <td className="max-w-md truncate" data-label="Message">
                          {item.messageBody}
                        </td>
                        <td data-label="Actions">
                          <button
                            className="btn-secondary px-3 py-2"
                            type="button"
                            onClick={() => setSelectedOutboxMessage(item)}
                          >
                            <Eye size={14} />
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                    {outboxRows.length === 0 ? (
                      <tr>
                        <td colSpan={8}>No SMS outbox records found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      ) : null}

      {activePurchase ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={
            purchaseIsBusy ? undefined : () => closePurchaseStatus()
          }
        >
          <div className="modal-shell">
            <section
              aria-labelledby="sms-payment-status-title"
              aria-modal="true"
              className="panel modal-card max-w-lg p-5 sm:p-6"
              role="dialog"
              onClick={(event) => event.stopPropagation()}
            >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`rounded-2xl border p-3 ${
                    purchaseStatus === 'sent'
                      ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
                      : purchaseStatus === 'failed' ||
                          purchaseStatus === 'send_failed'
                        ? 'border-rose-300/30 bg-rose-300/10 text-rose-100'
                        : 'border-amber-200/30 bg-amber-200/10 text-amber-100'
                  }`}
                >
                  {purchaseStatus === 'sent' ? (
                    <CheckCircle2 size={22} />
                  ) : purchaseIsBusy ? (
                    <Loader2 className="animate-spin" size={22} />
                  ) : (
                    <CreditCard size={22} />
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    SMS unit payment
                  </p>
                  <h3
                    className="mt-2 text-2xl font-semibold text-white"
                    id="sms-payment-status-title"
                  >
                    {purchaseStatusTitle}
                  </h3>
                </div>
              </div>
              {!purchaseIsBusy ? (
                <button
                  aria-label="Close SMS payment status"
                  className="btn-secondary px-3 py-2"
                  type="button"
                  onClick={closePurchaseStatus}
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>

            <p className="mt-5 text-sm leading-6 text-stone-300">
              {purchaseStatusBody}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  Recipients
                </p>
                <strong className="mt-1 block text-white">
                  {Number(activePurchase.recipientCount || 0).toLocaleString()}
                </strong>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  SMS units
                </p>
                <strong className="mt-1 block text-white">
                  {Number(activePurchase.totalUnits || 0).toLocaleString()}
                </strong>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  Amount
                </p>
                <strong className="mt-1 block text-white">
                  KES{' '}
                  {purchaseAmount.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  })}
                </strong>
              </div>
            </div>

            {purchaseStatus === 'confirmed' && sendCountdown !== null ? (
              <div className="mt-5 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm font-semibold text-emerald-50">
                Proceeding to send messages in {sendCountdown}s
              </div>
            ) : null}

            {purchaseStatus === 'failed' || purchaseStatus === 'send_failed' ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  className="btn-primary flex-1 justify-center"
                  disabled={createPurchaseMutation.isPending}
                  type="button"
                  onClick={queueSend}
                >
                  <RotateCcw size={16} />
                  Retry payment and send
                </button>
                <button
                  className="btn-secondary flex-1 justify-center"
                  type="button"
                  onClick={closePurchaseStatus}
                >
                  Close
                </button>
              </div>
            ) : null}

            {purchaseStatus === 'sent' ? (
              <button
                className="btn-primary mt-5 w-full justify-center"
                type="button"
                onClick={closePurchaseStatus}
              >
                Close
              </button>
            ) : null}
            </section>
          </div>
        </div>
      ) : null}

      {selectedOutboxMessage ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setSelectedOutboxMessage(null)}
        >
          <section
            aria-labelledby="sms-outbox-detail-title"
            aria-modal="true"
            className="panel modal-card max-w-3xl p-5 sm:p-6"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  SMS detail
                </p>
                <h3
                  className="mt-2 text-2xl font-semibold text-white"
                  id="sms-outbox-detail-title"
                >
                  {selectedOutboxMessage.recipientName ||
                    selectedOutboxMessage.contributor?.name ||
                    'Recipient'}
                </h3>
                <p className="mt-1 text-sm text-stone-400">
                  {new Date(selectedOutboxMessage.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                aria-label="Close SMS details"
                className="btn-secondary px-3 py-2"
                type="button"
                onClick={() => setSelectedOutboxMessage(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  Length
                </p>
                <strong className="mt-1 block text-white">
                  {selectedOutboxMetrics?.length || 0} chars
                </strong>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  SMS units
                </p>
                <strong className="mt-1 block text-white">
                  {selectedOutboxMessage.estimatedUnits ||
                    selectedOutboxMetrics?.segments ||
                    1}
                </strong>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  Provider
                </p>
                <strong className="mt-1 block text-white">
                  {selectedOutboxMessage.providerDescription ||
                    selectedOutboxMessage.sendStatus}
                </strong>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  Delivery
                </p>
                <strong className="mt-1 block text-white">
                  {selectedOutboxMessage.deliveryDescription ||
                    selectedOutboxMessage.deliveryStatus}
                </strong>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  Recipient type
                </p>
                <p className="mt-1 text-sm text-stone-200">
                  {selectedOutboxMessage.isHashedRecipient
                    ? 'Hashed Safaricom recipient'
                    : selectedOutboxMessage.recipientMobile}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  Provider message ID
                </p>
                <p className="mt-1 break-all font-mono text-sm text-stone-200">
                  {selectedOutboxMessage.providerMessageId || 'n/a'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  Batch
                </p>
                <p className="mt-1 break-all font-mono text-sm text-stone-200">
                  {selectedOutboxMessage.batchId || 'n/a'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  DLR turnaround
                </p>
                <p className="mt-1 text-sm text-stone-200">
                  {selectedOutboxMessage.deliveryTat || 'n/a'}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-white/10 bg-black/10 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                Rendered message
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-100">
                {selectedOutboxMessage.messageBody}
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                className="btn-secondary flex-1 justify-center"
                disabled={
                  fetchDeliveryReportMutation.isPending ||
                  !selectedOutboxMessage.providerMessageId
                }
                type="button"
                onClick={() =>
                  fetchDeliveryReportMutation.mutate(selectedOutboxMessage.id)
                }
              >
                <RotateCcw size={16} />
                {fetchDeliveryReportMutation.isPending
                  ? 'Fetching DLR...'
                  : 'Fetch delivery report'}
              </button>
              <button
                className="btn-primary flex-1 justify-center"
                type="button"
                onClick={() => setSelectedOutboxMessage(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
