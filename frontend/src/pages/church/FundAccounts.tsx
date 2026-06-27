import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import SmsPhonePreview from '../../components/SmsPhonePreview';
import api from '../../services/api';
import {
  getGsm7SmsMetrics,
  renderSmsPreviewPlaceholders,
} from '../../services/smsMetrics';

const FUND_RECEIPT_TEMPLATE_PREFIX =
  'Dear {name}, we acknowledge receipt of your {account} contribution of KES {amount}';
const GENERAL_RECEIPT_TEMPLATE_PREFIX =
  'Dear {name}, we acknowledge receipt of your contribution of KES {amount}';
const OLD_FUND_RECEIPT_TEMPLATE_PREFIX =
  'Dear {name}, we acknowledge receipt of KES {amount} towards {account}';
const RECEIPT_TEMPLATE_PREFIXES = [
  FUND_RECEIPT_TEMPLATE_PREFIX,
  GENERAL_RECEIPT_TEMPLATE_PREFIX,
  OLD_FUND_RECEIPT_TEMPLATE_PREFIX,
];
const LEGACY_RECEIPT_TEMPLATE_PATTERNS = [
  /^Dear \{name\}, we confirm receipt of KES \{amount\} towards \{account\}\.?\s*/i,
  /^Dear \{name\}, receipt confirmed: KES \{amount\} for \{account\}\.\s*(?:Ref:?\s*\{reference\}\.\s*)?(?:Thank you\.\s*)?/i,
  /^Dear \{name\}, receipt confirmed: KES \{amount\} for \{account\}\s*/i,
];

const initialForm = {
  name: '',
  code: '',
  description: '',
  displayOrder: 0,
  targetAmount: '',
  isActive: true,
  receiptTemplate: FUND_RECEIPT_TEMPLATE_PREFIX,
};

const RECEIPT_TEMPLATE_LIMIT = 459;

function isGeneralFundAccount(account: any) {
  return `${account?.code || account?.name || ''}`.trim().toLowerCase() === 'general';
}

function formatKes(value: unknown) {
  return `KES ${Number(value || 0).toLocaleString('en-KE', {
    maximumFractionDigits: 2,
  })}`;
}

function getReceiptTemplatePrefix(account: any) {
  return isGeneralFundAccount(account)
    ? GENERAL_RECEIPT_TEMPLATE_PREFIX
    : FUND_RECEIPT_TEMPLATE_PREFIX;
}

function normalizeReceiptExtraStart(extraMessage: string) {
  return `${extraMessage || ''}`.replace(/^[ \t]+/, '');
}

function hasLeadingLineBreak(value: string) {
  return /^\r?\n/.test(value);
}

function buildReceiptTemplate(
  extraMessage: string,
  prefix = FUND_RECEIPT_TEMPLATE_PREFIX,
  collapseBlankExtra = false,
) {
  const extra = normalizeReceiptExtraStart(extraMessage);
  if (!extra || (collapseBlankExtra && !extra.trim())) {
    return prefix;
  }
  return hasLeadingLineBreak(extra) ? `${prefix}${extra}` : `${prefix} ${extra}`;
}

function normalizeExtractedReceiptExtra(value: string) {
  if (hasLeadingLineBreak(value)) {
    return value;
  }
  return value.replace(/^[ \t]+/, '');
}

function getReceiptExtraMessage(
  template: string,
  prefix = FUND_RECEIPT_TEMPLATE_PREFIX,
) {
  const normalized = `${template || ''}`.trimStart();
  if (!normalized) {
    return '';
  }
  const knownPrefixes = [
    prefix,
    ...RECEIPT_TEMPLATE_PREFIXES.filter((item) => item !== prefix),
  ];
  for (const knownPrefix of knownPrefixes) {
    if (normalized.startsWith(knownPrefix)) {
      return normalizeExtractedReceiptExtra(
        normalized.slice(knownPrefix.length),
      );
    }
  }
  for (const legacyPattern of LEGACY_RECEIPT_TEMPLATE_PATTERNS) {
    if (legacyPattern.test(normalized)) {
      return normalizeExtractedReceiptExtra(
        normalized.replace(legacyPattern, ''),
      );
    }
  }
  return normalized;
}

export default function ChurchFundAccounts() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [form, setForm] = useState<any>(initialForm);
  const [previewAccount, setPreviewAccount] = useState<any | null>(null);
  const [accountView, setAccountView] = useState<'active' | 'archived'>(
    'active',
  );

  const { data, isLoading } = useQuery({
    queryKey: ['church-fund-accounts'],
    queryFn: () =>
      api.get('/church/fund-accounts').then((response) => response.data),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const receiptPrefix = getReceiptTemplatePrefix(form);
      const payload = {
        ...form,
        targetAmount: `${form.targetAmount || ''}`.trim()
          ? Number(form.targetAmount)
          : null,
        receiptTemplate: buildReceiptTemplate(
          getReceiptExtraMessage(form.receiptTemplate, receiptPrefix),
          receiptPrefix,
          true,
        ),
      };
      if (editingId) {
        const response = await api.patch(
          `/church/fund-accounts/${editingId}`,
          payload,
        );
        return response.data;
      }

      const response = await api.post('/church/fund-accounts', payload);
      return response.data;
    },
    onSuccess: () => {
      toast.success(editingId ? 'Fund account updated' : 'Fund account created');
      setIsEditorOpen(false);
      setEditingId(null);
      setForm(initialForm);
      queryClient.invalidateQueries({ queryKey: ['church-fund-accounts'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to save fund account');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({
      fundAccountId,
      reason,
    }: {
      fundAccountId: string;
      reason: string | null;
    }) => {
      const response = await api.post(
        `/church/fund-accounts/${fundAccountId}/archive`,
        { reason },
      );
      return response.data;
    },
    onSuccess: (account) => {
      toast.success('Fund account archived');
      setPreviewAccount(account);
      setAccountView('archived');
      queryClient.invalidateQueries({ queryKey: ['church-fund-accounts'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to archive account');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (fundAccountId: string) => {
      const response = await api.post(
        `/church/fund-accounts/${fundAccountId}/restore`,
      );
      return response.data;
    },
    onSuccess: (account) => {
      toast.success('Fund account restored');
      setPreviewAccount(account);
      setAccountView('active');
      queryClient.invalidateQueries({ queryKey: ['church-fund-accounts'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to restore account');
    },
  });

  const accounts = useMemo(() => data || [], [data]);
  const activeAccounts = useMemo(
    () => accounts.filter((item: any) => item.isActive !== false),
    [accounts],
  );
  const archivedAccounts = useMemo(
    () => accounts.filter((item: any) => item.isActive === false),
    [accounts],
  );
  const visibleAccounts =
    accountView === 'archived' ? archivedAccounts : activeAccounts;
  const receiptTemplatePrefix = getReceiptTemplatePrefix(form);
  const receiptExtraMessage = getReceiptExtraMessage(
    form.receiptTemplate,
    receiptTemplatePrefix,
  );
  const receiptExtraJoinerLength =
    receiptExtraMessage && !hasLeadingLineBreak(receiptExtraMessage) ? 1 : 0;
  const receiptExtraLimit = Math.max(
    RECEIPT_TEMPLATE_LIMIT -
      receiptTemplatePrefix.length -
      receiptExtraJoinerLength,
    0,
  );
  const composedReceiptTemplate = buildReceiptTemplate(
    receiptExtraMessage,
    receiptTemplatePrefix,
  );
  const templateMetrics = getGsm7SmsMetrics(composedReceiptTemplate);
  const templateRemaining = RECEIPT_TEMPLATE_LIMIT - templateMetrics.length;
  const accountPreview =
    previewAccount ||
    visibleAccounts[0] ||
    activeAccounts[0] ||
    archivedAccounts[0] ||
    null;
  const accountPreviewPrefix = getReceiptTemplatePrefix(accountPreview);
  const accountPreviewTemplate = buildReceiptTemplate(
    getReceiptExtraMessage(
      accountPreview?.receiptTemplate || '',
      accountPreviewPrefix,
    ),
    accountPreviewPrefix,
  );
  const accountPreviewMessage = renderSmsPreviewPlaceholders(
    accountPreviewTemplate,
    { account: accountPreview?.name || 'Account' },
  );
  const formPreviewMessage = renderSmsPreviewPlaceholders(
    composedReceiptTemplate,
    { account: form.name || 'Account' },
  );

  const closeEditor = () => {
    if (saveMutation.isPending) {
      return;
    }
    setIsEditorOpen(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const openCreateEditor = () => {
    setEditingId(null);
    setForm(initialForm);
    setIsEditorOpen(true);
  };

  const openEditEditor = (item: any) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      code: item.code,
      description: item.description || '',
      displayOrder: item.displayOrder || 0,
      targetAmount:
        Number(item.targetAmount || 0) > 0 ? String(item.targetAmount) : '',
      isActive: item.isActive,
      receiptTemplate: item.receiptTemplate || initialForm.receiptTemplate,
    });
    setIsEditorOpen(true);
  };

  const handleArchiveAccount = (item: any) => {
    if (isGeneralFundAccount(item)) {
      toast.error('General account must stay available for fallback payments');
      return;
    }

    const reason = window.prompt(
      `Archive ${item.name}? It will be hidden from new giving, fund displays, and manual contribution entry, but all history will remain available.`,
      item.archiveReason || '',
    );
    if (reason === null) {
      return;
    }

    archiveMutation.mutate({
      fundAccountId: item.id,
      reason: reason.trim() || null,
    });
  };

  return (
    <div className="church-console-page fund-accounts-layout grid gap-5 xl:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)] xl:items-start">
      <section className="table-shell">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Available Accounts
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Fund account list
              </h3>
            </div>
            <button
              className="btn-primary w-full justify-center"
              type="button"
              onClick={openCreateEditor}
            >
              <Plus size={17} />
              Add contribution account
            </button>
          </div>
          <div className="mt-4 rounded-3xl border border-amber-200/15 bg-amber-200/10 p-4 text-sm text-amber-50">
            Edit <span className="font-semibold">General</span> to control the
            fallback receipt message for unmatched M-Pesa account references.
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/10 p-1">
            <button
              className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                accountView === 'active'
                  ? 'bg-emerald-300 text-emerald-950'
                  : 'text-stone-300 hover:bg-white/10'
              }`}
              type="button"
              onClick={() => setAccountView('active')}
            >
              Active ({activeAccounts.length})
            </button>
            <button
              className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                accountView === 'archived'
                  ? 'bg-stone-200 text-stone-950'
                  : 'text-stone-300 hover:bg-white/10'
              }`}
              type="button"
              onClick={() => setAccountView('archived')}
            >
              Archived ({archivedAccounts.length})
            </button>
          </div>
          {accountView === 'archived' ? (
            <p className="mt-3 text-xs text-stone-400">
              Archived accounts stay in reports and old receipts, but are hidden
              from new giving, fund-display setup, and manual entries.
            </p>
          ) : null}
        </div>

        {isLoading ? (
          <div className="p-6 text-stone-300">Loading fund accounts...</div>
        ) : (
          <div className="table-scroll-region">
            <table className="mobile-card-table fund-account-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map((item: any) => (
                  <tr
                    key={item.id}
                    onFocus={() => setPreviewAccount(item)}
                    onMouseEnter={() => setPreviewAccount(item)}
                  >
                    <td data-label="Name">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white">{item.name}</span>
                        {item.isActive === false ? (
                          <span className="rounded-full border border-stone-400/30 bg-stone-400/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-stone-200">
                            Archived
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-500">
                        {item.code}
                      </div>
                      <div className="text-xs text-stone-400">
                        {item.description || 'No description'}
                      </div>
                      <div className="mt-1 text-xs text-amber-100/80">
                        Target:{' '}
                        {Number(item.targetAmount || 0) > 0
                          ? formatKes(item.targetAmount)
                          : 'Open goal'}
                      </div>
                      {item.archiveReason ? (
                        <div className="mt-1 text-xs text-stone-500">
                          Reason: {item.archiveReason}
                        </div>
                      ) : null}
                    </td>
                    <td data-label="Actions">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="btn-secondary px-3 py-2"
                          onFocus={() => setPreviewAccount(item)}
                          onClick={() => openEditEditor(item)}
                        >
                          Edit
                        </button>
                        {item.isActive === false ? (
                          <button
                            className="btn-secondary px-3 py-2"
                            disabled={restoreMutation.isPending}
                            onFocus={() => setPreviewAccount(item)}
                            onClick={() => restoreMutation.mutate(item.id)}
                          >
                            <RotateCcw size={15} />
                            Restore
                          </button>
                        ) : !isGeneralFundAccount(item) ? (
                          <button
                            className="btn-secondary px-3 py-2"
                            disabled={archiveMutation.isPending}
                            onFocus={() => setPreviewAccount(item)}
                            onClick={() => handleArchiveAccount(item)}
                          >
                            <Archive size={15} />
                            Archive
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={2}>
                      <div className="py-8 text-center text-sm text-stone-400">
                        {accountView === 'archived'
                          ? 'No archived fund accounts yet.'
                          : 'No active fund accounts yet.'}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel fund-account-preview-panel p-5 xl:sticky xl:top-6 xl:p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
          Receipt Preview
        </p>
        <h3 className="mt-2 text-xl font-semibold text-white">
          {accountPreview ? `${accountPreview.name} message` : 'Fund message'}
        </h3>
        <p className="mt-2 text-sm text-stone-300">
          Hover or focus a fund account to preview the SMS receipt wording.
        </p>
        <div className="mt-4">
          <SmsPhonePreview
            message={accountPreviewMessage}
            sender="Church SMS"
          />
        </div>
      </section>

      {isEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeEditor}>
          <div className="modal-shell" onClick={(event) => event.stopPropagation()}>
            <section className="panel modal-card church-details-modal-card fund-account-editor-modal p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Fund Account Setup
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    {editingId
                      ? 'Edit contribution account'
                      : 'Create contribution account'}
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm text-stone-300">
                    Each account controls its own receipt wording. The system
                    also keeps a General account for payments whose M-Pesa
                    account reference does not match an existing fund account.
                  </p>
                </div>

                <button
                  aria-label="Close contribution account form"
                  className="shell-icon-button"
                  type="button"
                  onClick={closeEditor}
                >
                  <X size={18} />
                </button>
              </div>

              <form
                className="fund-account-editor-form mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveMutation.mutate();
                }}
              >
                <div className="fund-account-editor-basics grid gap-4 md:grid-cols-2">
                  {[
                    ['name', 'Name'],
                    ['code', 'Code'],
                    ['description', 'Description'],
                    ['displayOrder', 'Display order'],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className="label">{label}</label>
                      <input
                        className="input"
                        type={key === 'displayOrder' ? 'number' : 'text'}
                        value={form[key]}
                        onChange={(event) =>
                          setForm((current: any) => ({
                            ...current,
                            [key]:
                              key === 'displayOrder'
                                ? Number(event.target.value)
                                : event.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                  <div className="md:col-span-2">
                    <label className="label">Collection target (optional)</label>
                    <input
                      className="input"
                      min="1"
                      placeholder="e.g. 146000000"
                      step="0.01"
                      type="number"
                      value={form.targetAmount}
                      onChange={(event) =>
                        setForm((current: any) => ({
                          ...current,
                          targetAmount: event.target.value,
                        }))
                      }
                    />
                    <p className="mt-2 text-xs text-stone-400">
                      Used by public fund displays for this account to show
                      target, amount remaining, and progress.
                    </p>
                  </div>
                </div>

                <div className="fund-account-editor-content grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start">
                  <section className="fund-account-editor-receipt rounded-3xl border border-white/10 bg-black/10 p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                      Receipt Template
                    </p>
                    <h4 className="mt-2 text-lg font-semibold text-white">
                      Personalized confirmation message
                    </h4>
                    <p className="mt-2 text-sm text-stone-300">
                      The base receipt text is locked. Add optional wording
                      after it if this fund account needs more detail.
                    </p>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-400">
                      {receiptTemplatePrefix}
                    </div>

                    <div className="mt-4">
                      <label className="label">Additional message</label>
                      <textarea
                        className="input min-h-36"
                        maxLength={receiptExtraLimit}
                        placeholder="Optional. Example: Thank you for supporting the ministry."
                        value={receiptExtraMessage}
                        onChange={(event) =>
                          setForm((current: any) => ({
                            ...current,
                            receiptTemplate: buildReceiptTemplate(
                              event.target.value,
                              receiptTemplatePrefix,
                            ),
                          }))
                        }
                      />
                    </div>

                    <div className="mt-3 flex flex-col gap-2 text-xs text-stone-400 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        GSM-7 receipt template limit: {RECEIPT_TEMPLATE_LIMIT}{' '}
                        characters, up to 3 SMS parts.
                      </span>
                      <span
                        className={
                          templateRemaining < 0
                            ? 'text-rose-200'
                            : templateRemaining < 20
                            ? 'text-amber-200'
                            : 'text-stone-300'
                        }
                      >
                        {templateMetrics.length} chars |{' '}
                        {templateMetrics.segments} unit
                        {templateMetrics.segments === 1 ? '' : 's'} |{' '}
                        {templateRemaining >= 0
                          ? `${templateRemaining} remaining`
                          : `${Math.abs(templateRemaining)} over limit`}
                      </span>
                    </div>
                  </section>

                  <div className="fund-account-editor-preview xl:sticky xl:top-5">
                    <SmsPhonePreview
                      message={formPreviewMessage}
                      sender="Church SMS"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-stone-100">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((current: any) => ({
                        ...current,
                        isActive: event.target.checked,
                      }))
                    }
                  />
                  Active for church users and public giving
                </label>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    className="btn-secondary justify-center"
                    type="button"
                    onClick={closeEditor}
                  >
                    Cancel
                  </button>
                  <button className="btn-primary justify-center" type="submit">
                    {saveMutation.isPending
                      ? 'Saving...'
                      : editingId
                        ? 'Update account'
                        : 'Create account'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
