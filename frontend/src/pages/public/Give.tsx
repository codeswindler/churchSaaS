import { useMutation, useQuery } from '@tanstack/react-query';
import { CreditCard, HeartHandshake, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import api from '../../services/api';

export default function PublicGive() {
  const { slug = '' } = useParams();
  const [paymentMode, setPaymentMode] = useState<'stk' | 'manual'>('stk');
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
  const stkReady = Boolean(data?.paymentInstructions?.supportsStkPush);

  useEffect(() => {
    if (data && !stkReady) {
      setPaymentMode('manual');
    }
  }, [data, stkReady]);

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

  const stkMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/public/churches/${slug}/contributions/stk`, {
        name: form.name,
        phone: form.phone,
        amount: Number(form.amount),
        fundAccountId: form.fundAccountId,
        notes: form.notes,
      });
      return response.data;
    },
    onSuccess: (result) => {
      toast.success(result.message || 'STK push sent to your phone');
      setForm((current) => ({
        ...current,
        amount: '',
        paymentReference: '',
        notes: '',
      }));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to send STK push');
    },
  });

  const effectivePaymentMode =
    paymentMode === 'stk' && !stkReady ? 'manual' : paymentMode;
  const activeMutation =
    effectivePaymentMode === 'stk' ? stkMutation : contributionMutation;

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
            Give securely by receiving an M-Pesa STK prompt on your phone, or
            submit receipt details after paying through the church M-Pesa
            account.
          </p>

          {data?.acceptingContributions ? (
            <div className="mt-6 rounded-3xl border border-amber-200/20 bg-amber-200/10 p-5 text-sm leading-6 text-amber-50">
              <div className="font-semibold">M-Pesa payment details</div>
              <p className="mt-2 text-amber-50/85">
                {effectivePaymentMode === 'stk'
                  ? 'Enter your phone number and amount. Safaricom will send a prompt to complete the contribution.'
                  : data?.paymentInstructions?.shortcode
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
                activeMutation.mutate();
              }}
            >
              <div className="grid gap-3 rounded-3xl border border-white/10 bg-black/10 p-2 sm:grid-cols-2">
                <button
                  className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    effectivePaymentMode === 'stk'
                      ? 'bg-amber-200 text-[#0d2119]'
                      : 'text-stone-300 hover:bg-white/10 hover:text-white'
                  } ${!stkReady ? 'cursor-not-allowed opacity-50' : ''}`}
                  disabled={!stkReady}
                  type="button"
                  onClick={() => setPaymentMode('stk')}
                >
                  <Smartphone size={16} />
                  STK push
                </button>
                <button
                  className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    effectivePaymentMode === 'manual'
                      ? 'bg-amber-200 text-[#0d2119]'
                      : 'text-stone-300 hover:bg-white/10 hover:text-white'
                  }`}
                  type="button"
                  onClick={() => setPaymentMode('manual')}
                >
                  <CreditCard size={16} />
                  Receipt entry
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ['name', 'Your name'],
                  ['phone', 'Phone number'],
                  ['amount', 'Amount'],
                  ...(effectivePaymentMode === 'manual'
                    ? [['paymentReference', 'M-Pesa receipt number']]
                    : []),
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <input
                      className="input"
                      min={key === 'amount' ? 1 : undefined}
                      required={key !== 'name'}
                      type={key === 'amount' ? 'number' : 'text'}
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
                    required
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
                {activeMutation.isPending
                  ? effectivePaymentMode === 'stk'
                    ? 'Sending STK push...'
                    : 'Recording payment...'
                  : effectivePaymentMode === 'stk'
                    ? 'Send STK push'
                    : 'Submit payment details'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
