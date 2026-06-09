import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilLine, Plus, Search, Send, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const initialForm = {
  name: '',
  isActive: true,
};

export default function PlatformSenders() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);

  const { data: senders = [], isLoading } = useQuery({
    queryKey: ['platform-senders'],
    queryFn: () => api.get('/platform/senders').then((response) => response.data),
  });

  const filteredSenders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return senders;
    return senders.filter((sender: any) =>
      `${sender.name}`.toLowerCase().includes(query),
    );
  }, [search, senders]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editor) {
        return api
          .patch(`/platform/senders/${editor.id}`, form)
          .then((response) => response.data);
      }
      return api.post('/platform/senders', form).then((response) => response.data);
    },
    onSuccess: () => {
      toast.success(editor ? 'Sender ID updated' : 'Sender ID created');
      setIsModalOpen(false);
      setEditor(null);
      setForm(initialForm);
      queryClient.invalidateQueries({ queryKey: ['platform-senders'] });
      queryClient.invalidateQueries({ queryKey: ['platform-churches'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to save sender ID');
    },
  });

  const openEditor = (sender?: any) => {
    setEditor(sender || null);
    setForm(
      sender
        ? { name: sender.name || '', isActive: sender.isActive !== false }
        : initialForm,
    );
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-5">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Send className="mt-1 text-amber-200" size={20} />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Sender registry
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                SMS sender IDs
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-stone-300">
                Create sender names once, then allocate one or more to each
                church and mark its default.
              </p>
            </div>
          </div>
          <button
            className="btn-primary justify-center"
            type="button"
            onClick={() => openEditor()}
          >
            <Plus size={16} />
            Add sender ID
          </button>
        </div>

        <div className="relative mt-6 max-w-xl">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
            size={16}
          />
          <input
            className="input"
            style={{ paddingLeft: '2.75rem' }}
            placeholder="Search sender IDs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </section>

      <section className="table-shell">
        <div className="border-b border-white/10 px-5 py-5">
          <h3 className="text-xl font-semibold text-white">Available senders</h3>
        </div>
        {isLoading ? (
          <p className="p-6 text-sm text-stone-300">Loading sender IDs...</p>
        ) : (
          <div className="divide-y divide-white/10">
            {filteredSenders.map((sender: any) => (
              <div
                key={sender.id}
                className="grid gap-3 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center"
              >
                <div>
                  <h4 className="font-semibold text-white">{sender.name}</h4>
                  <p className="mt-1 text-xs text-stone-400">
                    {Number(sender.churchCount || 0).toLocaleString()} church
                    allocation{Number(sender.churchCount || 0) === 1 ? '' : 's'}
                  </p>
                </div>
                <span
                  className={`badge ${
                    sender.isActive
                      ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                      : 'border-white/10 bg-white/5 text-stone-300'
                  }`}
                >
                  {sender.isActive ? 'Active' : 'Inactive'}
                </span>
                <button
                  className="btn-secondary px-3 py-2"
                  type="button"
                  onClick={() => openEditor(sender)}
                >
                  <PencilLine size={15} />
                  Edit
                </button>
              </div>
            ))}
            {filteredSenders.length === 0 ? (
              <p className="p-6 text-sm text-stone-300">
                No sender IDs match this search.
              </p>
            ) : null}
          </div>
        )}
      </section>

      {isModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsModalOpen(false)}
        >
          <div className="modal-shell">
            <section
              className="panel modal-card max-w-xl p-5 sm:p-6"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    {editor ? 'Edit sender' : 'New sender'}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    Sender ID details
                  </h3>
                </div>
                <button
                  className="rounded-full border border-white/10 p-2 text-stone-200 hover:bg-white/5"
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <form
                className="mt-6 space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveMutation.mutate();
                }}
              >
                <div>
                  <label className="label">Sender ID name</label>
                  <input
                    className="input"
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 text-sm font-semibold text-stone-200">
                  <input
                    checked={form.isActive}
                    type="checkbox"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        isActive: event.target.checked,
                      }))
                    }
                  />
                  Active sender ID
                </label>
                <button
                  className="btn-primary w-full justify-center"
                  disabled={saveMutation.isPending}
                  type="submit"
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save sender ID'}
                </button>
              </form>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
