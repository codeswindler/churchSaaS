import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const initialForm = {
  name: '',
  code: '',
  description: '',
  displayOrder: 0,
  isActive: true,
  receiptTemplate:
    'Dear {name}, receipt confirmed: KES {amount} for {account}. Ref {reference}. Thank you.',
};

const RECEIPT_TEMPLATE_LIMIT = 160;

export default function ChurchFundAccounts() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [form, setForm] = useState<any>(initialForm);

  const { data, isLoading } = useQuery({
    queryKey: ['church-fund-accounts'],
    queryFn: () =>
      api.get('/church/fund-accounts').then((response) => response.data),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const response = await api.patch(`/church/fund-accounts/${editingId}`, form);
        return response.data;
      }

      const response = await api.post('/church/fund-accounts', form);
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
  const templateLength = `${form.receiptTemplate || ''}`.length;
  const templateRemaining = RECEIPT_TEMPLATE_LIMIT - templateLength;

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
    <div className="space-y-5">
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
                <tr key={item.id}>
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

                <section className="rounded-3xl border border-white/10 bg-black/10 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Receipt Template
                  </p>
                  <h4 className="mt-2 text-lg font-semibold text-white">
                    Personalized confirmation message
                  </h4>
                  <p className="mt-2 text-sm text-stone-300">
                    Use placeholders like <code>{'{name}'}</code>,{' '}
                    <code>{'{amount}'}</code>, <code>{'{account}'}</code>,{' '}
                    <code>{'{date}'}</code>, and <code>{'{reference}'}</code>.
                    The General account template is used when a payer enters an
                    account reference that does not exist.
                  </p>
                  <textarea
                    className="input mt-4 min-h-44"
                    maxLength={RECEIPT_TEMPLATE_LIMIT}
                    value={form.receiptTemplate}
                    onChange={(event) =>
                      setForm((current: any) => ({
                        ...current,
                        receiptTemplate: event.target.value,
                      }))
                    }
                  />
                  <div className="mt-3 flex flex-col gap-2 text-xs text-stone-400 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      GSM-7 receipt template limit: {RECEIPT_TEMPLATE_LIMIT}{' '}
                      characters for one SMS page.
                    </span>
                    <span
                      className={
                        templateRemaining < 20
                          ? 'text-amber-200'
                          : 'text-stone-300'
                      }
                    >
                      {templateRemaining} characters remaining
                    </span>
                  </div>
                </section>

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
