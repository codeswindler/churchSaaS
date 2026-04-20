import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    'Dear {name}, we confirm receipt of KES {amount} towards {account} on {date}. Ref: {reference}. Thank you for supporting the ministry.',
};

export default function ChurchFundAccounts() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
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
      setEditingId(null);
      setForm(initialForm);
      queryClient.invalidateQueries({ queryKey: ['church-fund-accounts'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to save fund account');
    },
  });

  const accounts = useMemo(() => data || [], [data]);

  return (
    <div className="page-grid">
      <section className="panel p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
          Fund Account Setup
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-white">
          {editingId ? 'Edit contribution account' : 'Create contribution account'}
        </h3>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
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

          <div>
            <label className="label">Receipt template</label>
            <textarea
              className="input min-h-40"
              value={form.receiptTemplate}
              onChange={(event) =>
                setForm((current: any) => ({
                  ...current,
                  receiptTemplate: event.target.value,
                }))
              }
            />
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

          <div className="flex gap-3">
            <button className="btn-primary flex-1 justify-center" type="submit">
              {saveMutation.isPending ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            {editingId ? (
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(initialForm);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="table-shell">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            Available Accounts
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Fund account list
          </h3>
        </div>

        {isLoading ? (
          <div className="p-6 text-stone-300">Loading fund accounts...</div>
        ) : (
          <table>
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
                  <td>
                    <div className="font-medium text-white">{item.name}</div>
                    <div className="text-xs text-stone-400">
                      {item.description || 'No description'}
                    </div>
                  </td>
                  <td className="mono">{item.code}</td>
                  <td>{item.isActive ? 'Active' : 'Inactive'}</td>
                  <td>{item.displayOrder}</td>
                  <td>
                    <button
                      className="btn-secondary px-3 py-2"
                      onClick={() => {
                        setEditingId(item.id);
                        setForm({
                          name: item.name,
                          code: item.code,
                          description: item.description || '',
                          displayOrder: item.displayOrder || 0,
                          isActive: item.isActive,
                          receiptTemplate: item.receiptTemplate,
                        });
                      }}
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
    </div>
  );
}
