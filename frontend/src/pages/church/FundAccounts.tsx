import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import SmsPhonePreview from '../../components/SmsPhonePreview';
import api from '../../services/api';
import {
  getGsm7SmsMetrics,
  renderSmsPreviewPlaceholders,
} from '../../services/smsMetrics';

const RECEIPT_TEMPLATE_PREFIX =
  'Dear {name}, we confirm receipt of KES {amount} towards {account}';

const initialForm = {
  name: '',
  code: '',
  description: '',
  displayOrder: 0,
  isActive: true,
  receiptTemplate: RECEIPT_TEMPLATE_PREFIX,
};

const RECEIPT_TEMPLATE_LIMIT = 306;

function buildReceiptTemplate(extraMessage: string) {
  const extra = extraMessage.trim();
  return extra ? `${RECEIPT_TEMPLATE_PREFIX} ${extra}` : RECEIPT_TEMPLATE_PREFIX;
}

function getReceiptExtraMessage(template: string) {
  const normalized = `${template || ''}`.trim();
  if (!normalized) {
    return '';
  }
  if (normalized.startsWith(RECEIPT_TEMPLATE_PREFIX)) {
    return normalized.slice(RECEIPT_TEMPLATE_PREFIX.length).trimStart();
  }
  return normalized;
}

export default function ChurchFundAccounts() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [form, setForm] = useState<any>(initialForm);
  const [previewAccount, setPreviewAccount] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['church-fund-accounts'],
    queryFn: () =>
      api.get('/church/fund-accounts').then((response) => response.data),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        receiptTemplate: buildReceiptTemplate(
          getReceiptExtraMessage(form.receiptTemplate),
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

  const accounts = useMemo(() => data || [], [data]);
  const receiptExtraMessage = getReceiptExtraMessage(form.receiptTemplate);
  const receiptExtraLimit = Math.max(
    RECEIPT_TEMPLATE_LIMIT - RECEIPT_TEMPLATE_PREFIX.length - 1,
    0,
  );
  const composedReceiptTemplate = buildReceiptTemplate(receiptExtraMessage);
  const templateMetrics = getGsm7SmsMetrics(composedReceiptTemplate);
  const templateRemaining = RECEIPT_TEMPLATE_LIMIT - templateMetrics.length;
  const accountPreview = previewAccount || accounts[0] || null;
  const accountPreviewMessage = renderSmsPreviewPlaceholders(
    accountPreview?.receiptTemplate || initialForm.receiptTemplate,
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
      isActive: item.isActive,
      receiptTemplate: item.receiptTemplate || initialForm.receiptTemplate,
    });
    setIsEditorOpen(true);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start">
      <section className="table-shell">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Available Accounts
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Fund account list
              </h3>
            </div>
            <button
              className="btn-primary justify-center"
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
        </div>

        {isLoading ? (
          <div className="p-6 text-stone-300">Loading fund accounts...</div>
        ) : (
          <table className="mobile-card-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Status</th>
                <th>Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((item: any) => (
                <tr
                  key={item.id}
                  onFocus={() => setPreviewAccount(item)}
                  onMouseEnter={() => setPreviewAccount(item)}
                >
                  <td data-label="Name">
                    <div className="font-medium text-white">{item.name}</div>
                    <div className="text-xs text-stone-400">
                      {item.description || 'No description'}
                    </div>
                  </td>
                  <td className="mono" data-label="Code">
                    {item.code}
                  </td>
                  <td data-label="Status">
                    {item.isActive ? 'Active' : 'Inactive'}
                  </td>
                  <td data-label="Order">{item.displayOrder}</td>
                  <td data-label="Actions">
                    <button
                      className="btn-secondary px-3 py-2"
                      onFocus={() => setPreviewAccount(item)}
                      onClick={() => openEditEditor(item)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel p-4 xl:sticky xl:top-6">
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
            <section className="panel modal-card church-details-modal-card p-5 sm:p-6">
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
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveMutation.mutate();
                }}
              >
                <div className="grid gap-4 md:grid-cols-2">
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
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start">
                  <section className="rounded-3xl border border-white/10 bg-black/10 p-5">
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
                      {RECEIPT_TEMPLATE_PREFIX}
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
                            ),
                          }))
                        }
                      />
                    </div>

                    <div className="mt-3 flex flex-col gap-2 text-xs text-stone-400 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        GSM-7 receipt template limit: {RECEIPT_TEMPLATE_LIMIT}{' '}
                        characters, up to 2 SMS parts.
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

                  <div className="xl:sticky xl:top-5">
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
