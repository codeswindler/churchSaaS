import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus, RotateCcw, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
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
  aliases: [] as string[],
  receiptTemplate: FUND_RECEIPT_TEMPLATE_PREFIX,
};

const RECEIPT_TEMPLATE_LIMIT = 459;
const MAX_FUND_ALIASES = 12;

// Mirrors the backend: an M-Pesa reference matches an account when its
// alphanumeric-only, lowercased form equals the account name, code, or an alias.
function normalizeFundReference(value: unknown) {
  return `${value ?? ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isFallbackFundAccount(account: any) {
  if (!account) return false;
  if (account.isFallback) return true;
  // Back-compat for churches not yet migrated off the retired General account.
  return (
    `${account?.code || account?.name || ''}`.trim().toLowerCase() === 'general'
  );
}

function formatKes(value: unknown) {
  return `KES ${Number(value || 0).toLocaleString('en-KE', {
    maximumFractionDigits: 2,
  })}`;
}

// Only the retired General account used the account-less wording. Every current
// account, fallback included, prints {account}.
function getReceiptTemplatePrefix(account: any) {
  return `${account?.code || ''}`.trim().toLowerCase() === 'general'
    ? GENERAL_RECEIPT_TEMPLATE_PREFIX
    : FUND_RECEIPT_TEMPLATE_PREFIX;
}

// A template is "untouched" when it still matches one of the shipped defaults
// verbatim. Only untouched templates are re-seeded when the fund code changes
// between general/non-general, so admin-authored wording is never overwritten.
function isUntouchedDefaultTemplate(template: string) {
  const value = `${template || ''}`.trim();
  return RECEIPT_TEMPLATE_PREFIXES.some((prefix) => value === prefix);
}

// Legacy rows may still hold pre-migration wording. We surface them as-is in the
// editor (nothing is stripped anymore), but flag them so the admin knows why the
// text looks different from the current default.
function isLegacyReceiptTemplate(template: string) {
  const value = `${template || ''}`.trimStart();
  if (!value) {
    return false;
  }
  if (value.startsWith(OLD_FUND_RECEIPT_TEMPLATE_PREFIX)) {
    return true;
  }
  return LEGACY_RECEIPT_TEMPLATE_PATTERNS.some((pattern) =>
    pattern.test(value),
  );
}

// Only placeholders the backend renderer actually resolves. {firstName} is
// deliberately excluded: the SMS preview substitutes it, but the production
// renderer has no value for it and would send an empty string.
const RECEIPT_PLACEHOLDERS = [
  { token: '{name}', label: 'Name', hint: 'Contributor name, e.g. Geoffrey' },
  { token: '{amount}', label: 'Amount', hint: 'Contribution amount, e.g. 1,000.00' },
  { token: '{account}', label: 'Account', hint: 'Fund account name, e.g. Tithe' },
  { token: '{date}', label: 'Date', hint: 'Date received, e.g. Jun 4, 2026' },
  { token: '{reference}', label: 'Reference', hint: 'M-Pesa payment reference' },
];

const REQUIRED_RECEIPT_PLACEHOLDERS = ['{name}', '{amount}'];

function getMissingReceiptPlaceholders(template: string) {
  const value = `${template || ''}`;
  return REQUIRED_RECEIPT_PLACEHOLDERS.filter(
    (placeholder) => !value.includes(placeholder),
  );
}

export default function ChurchFundAccounts() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [form, setForm] = useState<any>(initialForm);
  const [previewAccount, setPreviewAccount] = useState<any | null>(null);
  const receiptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [aliasDraft, setAliasDraft] = useState('');
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
      const existingAliases: string[] = form.aliases || [];
      const draft = aliasDraft.trim();
      const draftKey = normalizeFundReference(draft);
      const pendingAliases =
        draftKey &&
        !existingAliases.some(
          (alias) => normalizeFundReference(alias) === draftKey,
        )
          ? [...existingAliases, draft]
          : existingAliases;

      // The template is stored verbatim. If the admin cleared it entirely we
      // fall back to the default for this fund's code rather than saving blank.
      const template = `${form.receiptTemplate || ''}`.trim()
        ? form.receiptTemplate
        : getReceiptTemplatePrefix(form);
      const payload = {
        ...form,
        targetAmount: `${form.targetAmount || ''}`.trim()
          ? Number(form.targetAmount)
          : null,
        // Commit a half-typed alias the admin never pressed Enter on, rather
        // than silently dropping it. The backend re-validates for conflicts.
        aliases: pendingAliases,
        receiptTemplate: template,
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
  const composedReceiptTemplate = `${form.receiptTemplate || ''}`;
  const missingReceiptPlaceholders = getMissingReceiptPlaceholders(
    composedReceiptTemplate,
  );
  const isEditingLegacyTemplate = isLegacyReceiptTemplate(
    composedReceiptTemplate,
  );
  const templateMetrics = getGsm7SmsMetrics(composedReceiptTemplate);
  const templateRemaining = RECEIPT_TEMPLATE_LIMIT - templateMetrics.length;
  const accountPreview =
    previewAccount ||
    visibleAccounts[0] ||
    activeAccounts[0] ||
    archivedAccounts[0] ||
    null;
  const accountPreviewTemplate =
    accountPreview?.receiptTemplate ||
    getReceiptTemplatePrefix(accountPreview);
  const accountPreviewMessage = renderSmsPreviewPlaceholders(
    accountPreviewTemplate,
    { account: accountPreview?.name || 'Account' },
  );
  const formPreviewMessage = renderSmsPreviewPlaceholders(
    composedReceiptTemplate,
    { account: form.name || 'Account' },
  );

  const formAliases: string[] = form.aliases || [];

  // Pre-flight the same conflict rules the backend enforces, so the admin sees
  // the problem while typing rather than as a 400 on save.
  const aliasConflict = (() => {
    const key = normalizeFundReference(aliasDraft);
    if (!key) return null;
    if (formAliases.some((alias) => normalizeFundReference(alias) === key)) {
      return 'Already added to this account.';
    }
    if (
      key === normalizeFundReference(form.name) ||
      key === normalizeFundReference(form.code)
    ) {
      return 'Matches this account’s own name or code, so it already works.';
    }
    const clash = accounts.find(
      (account: any) =>
        account.id !== editingId &&
        [account.name, account.code, ...(account.aliases || [])].some(
          (value: string) => normalizeFundReference(value) === key,
        ),
    );
    return clash ? `Already used by ${clash.name}.` : null;
  })();

  const canAddAlias =
    Boolean(normalizeFundReference(aliasDraft)) &&
    !aliasConflict &&
    formAliases.length < MAX_FUND_ALIASES;

  const addAlias = () => {
    if (!canAddAlias) return;
    setForm((current: any) => ({
      ...current,
      aliases: [...(current.aliases || []), aliasDraft.trim()],
    }));
    setAliasDraft('');
  };

  const removeAlias = (alias: string) => {
    setForm((current: any) => ({
      ...current,
      aliases: (current.aliases || []).filter((item: string) => item !== alias),
    }));
  };

  // Insert a placeholder at the caret (replacing any selection), then restore
  // focus with the caret just past the inserted token.
  const insertReceiptPlaceholder = (token: string) => {
    const textarea = receiptTextareaRef.current;
    const current = `${form.receiptTemplate || ''}`;

    if (!textarea) {
      setForm((prev: any) => ({
        ...prev,
        receiptTemplate: `${prev.receiptTemplate || ''}${token}`,
      }));
      return;
    }

    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`;

    setForm((prev: any) => ({ ...prev, receiptTemplate: next }));

    requestAnimationFrame(() => {
      const caret = start + token.length;
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

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
    setAliasDraft('');
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
      aliases: item.aliases || [],
      receiptTemplate: item.receiptTemplate || initialForm.receiptTemplate,
    });
    setAliasDraft('');
    setIsEditorOpen(true);
  };

  const handleArchiveAccount = (item: any) => {
    if (isFallbackFundAccount(item)) {
      toast.error(
        'The fallback account must stay available for unmatched payments',
      );
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
            Unmatched M-Pesa account references are grouped under your fallback
            account (<span className="font-semibold">Offering</span> by default).
            Add aliases to an account to catch common spellings before they fall
            through.
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
                  <th className="w-px whitespace-nowrap text-right">Actions</th>
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
                        {isFallbackFundAccount(item) ? (
                          <span
                            title="Receives payments whose M-Pesa account reference matches no account"
                            className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-emerald-100"
                          >
                            Fallback
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-500">
                        {item.code}
                      </div>
                      <div className="text-xs text-stone-400">
                        {item.description || 'No description'}
                      </div>
                      {(item.aliases || []).length > 0 ? (
                        <div className="mt-1 text-xs text-stone-400">
                          Also matches: {(item.aliases || []).join(', ')}
                        </div>
                      ) : null}
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
                    <td data-label="Actions" className="w-px whitespace-nowrap align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2"
                          onFocus={() => setPreviewAccount(item)}
                          onClick={() => openEditEditor(item)}
                        >
                          Edit
                        </button>
                        {item.isActive === false ? (
                          <button
                            className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2"
                            disabled={restoreMutation.isPending}
                            onFocus={() => setPreviewAccount(item)}
                            onClick={() => restoreMutation.mutate(item.id)}
                          >
                            <RotateCcw size={15} />
                            Restore
                          </button>
                        ) : !isFallbackFundAccount(item) ? (
                          <button
                            className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2"
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
                    Each account controls its own receipt wording and can list
                    aliases that route to it. Payments whose M-Pesa account
                    reference matches nothing are grouped under the fallback
                    account.
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
                          setForm((current: any) => {
                            const next = {
                              ...current,
                              [key]:
                                key === 'displayOrder'
                                  ? Number(event.target.value)
                                  : event.target.value,
                            };
                            // Re-seed the default wording when the code flips
                            // between general/non-general, but only while the
                            // template is still an untouched shipped default.
                            if (
                              key === 'code' &&
                              isUntouchedDefaultTemplate(current.receiptTemplate)
                            ) {
                              next.receiptTemplate =
                                getReceiptTemplatePrefix(next);
                            }
                            return next;
                          })
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

                  <div className="md:col-span-2">
                    <label className="label">Account aliases (optional)</label>
                    <p className="mb-2 text-xs text-stone-400">
                      Other spellings contributors might type as their M-Pesa
                      account reference. Anything listed here routes to this
                      account. Case and punctuation are ignored.
                    </p>

                    {formAliases.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {formAliases.map((alias) => (
                          <span
                            key={alias}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-stone-100"
                          >
                            {alias}
                            <button
                              type="button"
                              aria-label={`Remove alias ${alias}`}
                              className="text-stone-400 transition hover:text-rose-200"
                              onClick={() => removeAlias(alias)}
                            >
                              <X size={13} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        type="text"
                        placeholder="e.g. Tithes, Zaka, Sadaka ya Kumi"
                        value={aliasDraft}
                        disabled={formAliases.length >= MAX_FUND_ALIASES}
                        onChange={(event) => setAliasDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ',') {
                            event.preventDefault();
                            addAlias();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn-secondary px-4"
                        disabled={!canAddAlias}
                        onClick={addAlias}
                      >
                        Add
                      </button>
                    </div>

                    {aliasConflict ? (
                      <p className="mt-2 text-xs text-amber-200">
                        {aliasConflict}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-stone-500">
                        {formAliases.length >= MAX_FUND_ALIASES
                          ? `Alias limit reached (${MAX_FUND_ALIASES}).`
                          : `Press Enter or comma to add. ${
                              MAX_FUND_ALIASES - formAliases.length
                            } remaining.`}
                      </p>
                    )}
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
                      Write the full receipt message for this fund account.
                      Insert a placeholder to have it replaced with real values
                      when the receipt is sent.
                    </p>

                    <div className="mt-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                        Insert placeholder
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {RECEIPT_PLACEHOLDERS.map((placeholder) => {
                          const used = composedReceiptTemplate.includes(
                            placeholder.token,
                          );
                          return (
                            <button
                              key={placeholder.token}
                              type="button"
                              title={placeholder.hint}
                              onClick={() =>
                                insertReceiptPlaceholder(placeholder.token)
                              }
                              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                                used
                                  ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100'
                                  : 'border-white/15 bg-white/5 text-stone-200 hover:border-white/30 hover:bg-white/10'
                              }`}
                            >
                              {placeholder.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="label">Receipt message</label>
                      <textarea
                        ref={receiptTextareaRef}
                        className="input min-h-36"
                        maxLength={RECEIPT_TEMPLATE_LIMIT}
                        placeholder={receiptTemplatePrefix}
                        value={composedReceiptTemplate}
                        onChange={(event) =>
                          setForm((current: any) => ({
                            ...current,
                            receiptTemplate: event.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="mt-2 text-xs text-stone-400 underline underline-offset-4 hover:text-stone-200"
                        onClick={() =>
                          setForm((current: any) => ({
                            ...current,
                            receiptTemplate: getReceiptTemplatePrefix(current),
                          }))
                        }
                      >
                        Reset to default wording
                      </button>
                    </div>

                    {missingReceiptPlaceholders.length > 0 && (
                      <p className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs text-amber-100">
                        Heads up: this message is missing{' '}
                        {missingReceiptPlaceholders.join(' and ')}. Receipts will
                        still send, but they won't show the{' '}
                        {missingReceiptPlaceholders
                          .map((token) => token.replace(/[{}]/g, ''))
                          .join(' or ')}
                        .
                      </p>
                    )}

                    {isEditingLegacyTemplate && (
                      <p className="mt-3 rounded-2xl border border-sky-300/30 bg-sky-300/10 px-4 py-3 text-xs text-sky-100">
                        This account still uses older receipt wording. It keeps
                        sending as-is until you change it here.
                      </p>
                    )}

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
