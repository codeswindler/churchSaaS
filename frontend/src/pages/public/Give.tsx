import { useMutation, useQuery } from '@tanstack/react-query';
import { HeartHandshake } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import api from '../../services/api';

export default function PublicGive() {
  const { slug = '' } = useParams();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    amount: '',
    fundAccountId: '',
    paymentReference: '',
    notes: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['public-church-config', slug],
    queryFn: () =>
      api.get(`/public/churches/${slug}/config`).then((response) => response.data),
    enabled: Boolean(slug),
  });

  const funds = useMemo(() => data?.fundAccounts || [], [data]);

  const contributionMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/public/churches/${slug}/contributions/mpesa`, {
        ...form,
        amount: Number(form.amount),
      });
      return response.data;
    },
    onSuccess: (result) => {
      toast.success(result.message || 'Payment details recorded');
      setForm((current) => ({
        ...current,
        amount: '',
        paymentReference: '',
        notes: '',
      }));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to record payment');
    },
  });

  if (isLoading) {
    return <div className="min-h-screen p-8 text-stone-200">Loading church...</div>;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(242,190,90,0.18),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(42,110,92,0.3),_transparent_28%),linear-gradient(180deg,_#071812_0%,_#0d2119_45%,_#10231a_100%)] px-4 py-10 text-stone-50">
      <div className="mx-auto max-w-3xl">
        <div className="panel p-8 lg:p-10">
          <div className="inline-flex items-center gap-3 rounded-full border border-amber-200/25 bg-amber-200/10 px-4 py-2 text-sm text-amber-50">
            <HeartHandshake size={16} />
            Secure church giving
          </div>

          <h1 className="mt-6 text-4xl font-semibold text-white">
            {data?.church?.name || 'Church Giving'}
          </h1>
          <p className="mt-3 text-lg text-stone-300">
            Pay using the church M-Pesa account, then submit your receipt details so the contribution can be recorded under the right fund.
          </p>

          {data?.acceptingContributions ? (
            <div className="mt-6 rounded-3xl border border-amber-200/20 bg-amber-200/10 p-5 text-sm leading-6 text-amber-50">
              <div className="font-semibold">M-Pesa payment details</div>
              <p className="mt-2 text-amber-50/85">
                {data?.paymentInstructions?.shortcode
                  ? `Use M-Pesa shortcode ${data.paymentInstructions.shortcode}, then enter the M-Pesa receipt number below.`
                  : data?.paymentInstructions?.referenceHint ||
                    'Make the M-Pesa payment, then enter the receipt/reference number below.'}
              </p>
            </div>
          ) : null}

          {!data?.acceptingContributions ? (
            <div className="mt-8 rounded-3xl border border-rose-300/20 bg-rose-500/15 p-5 text-rose-50">
              {data?.subscription?.status === 'suspended'
                ? 'This church is not accepting contributions right now. Please contact the church office for help.'
                : 'This church is not accepting contributions right now. Please contact the church office for help.'}
            </div>
          ) : (
            <form
              className="mt-8 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                contributionMutation.mutate();
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ['name', 'Your name'],
                  ['phone', 'Phone number'],
                  ['amount', 'Amount'],
                  ['paymentReference', 'M-Pesa receipt number'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <input
                      className="input"
                      required={key !== 'name'}
                      value={(form as any)[key]}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}

                <div>
                  <label className="label">Contribution account</label>
                  <select
                    className="input"
                    value={form.fundAccountId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        fundAccountId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select an account</option>
                    {funds.map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Note (optional)</label>
                <textarea
                  className="input min-h-28"
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </div>

              <button className="btn-primary w-full justify-center" type="submit">
                {contributionMutation.isPending
                  ? 'Recording payment...'
                  : 'Submit payment details'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
