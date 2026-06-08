import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const initialSenderForm = {
  smsPartnerId: '',
  smsApiKey: '',
  smsShortcode: '',
  smsBaseUrl: 'https://quicksms.advantasms.com',
  mpesaEnvironment: 'sandbox',
  mpesaConsumerKey: '',
  mpesaConsumerSecret: '',
  mpesaPasskey: '',
  mpesaShortcode: '',
  mpesaCallbackUrl: '',
};

function getDefaultSmsUnitsCallbackUrl() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/api/payments/mpesa/sms-units/webhook`;
}

export default function PlatformSettings() {
  const queryClient = useQueryClient();
  const [senderForm, setSenderForm] = useState(initialSenderForm);
  const [showSmsApiKey, setShowSmsApiKey] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['platform-messaging-config'],
    queryFn: () =>
      api.get('/platform/messaging/config').then((response) => response.data),
  });

  const smsConfig = config?.smsConfig;
  const platformSmsReady = Boolean(
    smsConfig?.configured || smsConfig?.fallbackConfigured,
  );
  const platformMpesaReady = Boolean(smsConfig?.mpesaConfigured);

  const saveSenderMutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch(
        '/platform/messaging/config',
        senderForm,
      );
      return response.data;
    },
    onSuccess: () => {
      toast.success('Platform settings saved');
      queryClient.invalidateQueries({
        queryKey: ['platform-messaging-config'],
      });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          'Unable to save platform settings',
      );
    },
  });

  useEffect(() => {
    if (!smsConfig) {
      return;
    }

    setSenderForm({
      smsPartnerId: smsConfig.smsPartnerId || '',
      smsApiKey: smsConfig.smsApiKey || '',
      smsShortcode: smsConfig.smsShortcode || '',
      smsBaseUrl: smsConfig.smsBaseUrl || 'https://quicksms.advantasms.com',
      mpesaEnvironment: smsConfig.mpesaEnvironment || 'sandbox',
      mpesaConsumerKey: smsConfig.mpesaConsumerKey || '',
      mpesaConsumerSecret: smsConfig.mpesaConsumerSecret || '',
      mpesaPasskey: smsConfig.mpesaPasskey || '',
      mpesaShortcode: smsConfig.mpesaShortcode || '',
      mpesaCallbackUrl:
        smsConfig.mpesaCallbackUrl || getDefaultSmsUnitsCallbackUrl(),
    });
  }, [
    smsConfig?.smsPartnerId,
    smsConfig?.smsApiKey,
    smsConfig?.smsShortcode,
    smsConfig?.smsBaseUrl,
    smsConfig?.mpesaEnvironment,
    smsConfig?.mpesaConsumerKey,
    smsConfig?.mpesaConsumerSecret,
    smsConfig?.mpesaPasskey,
    smsConfig?.mpesaShortcode,
    smsConfig?.mpesaCallbackUrl,
  ]);

  const updateSenderForm = (
    key: keyof typeof initialSenderForm,
    value: string,
  ) => {
    setSenderForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  return (
    <div className="space-y-5">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <SettingsIcon className="mt-1 text-amber-200" size={20} />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Platform Settings
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Super admin SMS and payment credentials
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-300">
                These credentials power platform messages and SMS-unit STK
                purchases for client churches.
              </p>
            </div>
          </div>
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              platformSmsReady && platformMpesaReady
                ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                : 'border-amber-200/30 bg-amber-200/10 text-amber-100'
            }`}
          >
            {platformSmsReady && platformMpesaReady
              ? 'Sender and paybill ready'
              : platformSmsReady
                ? 'Paybill setup needed'
                : 'Sender setup needed'}
          </div>
        </div>

        <form
          className="mt-6 grid gap-4 lg:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveSenderMutation.mutate();
          }}
        >
          <div>
            <label className="label">Partner ID</label>
            <input
              className="input"
              placeholder="Advanta partnerID"
              value={senderForm.smsPartnerId}
              onChange={(event) =>
                updateSenderForm('smsPartnerId', event.target.value)
              }
            />
          </div>
          <div>
            <label className="label">API key / apikey</label>
            <div className="relative">
              <input
                className="input pr-12"
                placeholder="Advanta apikey"
                type={showSmsApiKey ? 'text' : 'password'}
                value={senderForm.smsApiKey}
                onChange={(event) =>
                  updateSenderForm('smsApiKey', event.target.value)
                }
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-stone-400 transition hover:bg-white/10 hover:text-white"
                type="button"
                onClick={() => setShowSmsApiKey((current) => !current)}
              >
                {showSmsApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Sender shortcode</label>
            <input
              className="input"
              placeholder="Advanta shortcode"
              value={senderForm.smsShortcode}
              onChange={(event) =>
                updateSenderForm('smsShortcode', event.target.value)
              }
            />
          </div>
          <div>
            <label className="label">Base URL</label>
            <input
              className="input"
              value={senderForm.smsBaseUrl}
              onChange={(event) =>
                updateSenderForm('smsBaseUrl', event.target.value)
              }
            />
          </div>
          <div className="mt-2 rounded-3xl border border-white/10 bg-black/10 p-4 lg:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                  SMS unit payment Paybill
                </p>
                <h4 className="mt-1 text-lg font-semibold text-white">
                  Platform M-Pesa STK credentials
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${
                    platformMpesaReady
                      ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                      : 'border-amber-200/30 bg-amber-200/10 text-amber-100'
                  }`}
                >
                  {platformMpesaReady ? 'Paybill ready' : 'Paybill missing'}
                </span>
                <span className="rounded-2xl border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-100">
                  {senderForm.mpesaEnvironment === 'production'
                    ? 'Production Daraja'
                    : 'Sandbox Daraja'}
                </span>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Environment</label>
                <select
                  className="input"
                  value={senderForm.mpesaEnvironment}
                  onChange={(event) =>
                    updateSenderForm('mpesaEnvironment', event.target.value)
                  }
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Production</option>
                </select>
              </div>
              <div>
                <label className="label">Paybill shortcode</label>
                <input
                  className="input"
                  value={senderForm.mpesaShortcode}
                  onChange={(event) =>
                    updateSenderForm('mpesaShortcode', event.target.value)
                  }
                />
              </div>
              <div>
                <label className="label">Consumer key</label>
                <input
                  className="input"
                  value={senderForm.mpesaConsumerKey}
                  onChange={(event) =>
                    updateSenderForm('mpesaConsumerKey', event.target.value)
                  }
                />
              </div>
              <div>
                <label className="label">Consumer secret</label>
                <input
                  className="input"
                  type="password"
                  value={senderForm.mpesaConsumerSecret}
                  onChange={(event) =>
                    updateSenderForm('mpesaConsumerSecret', event.target.value)
                  }
                />
              </div>
              <div>
                <label className="label">Passkey</label>
                <input
                  className="input"
                  type="password"
                  value={senderForm.mpesaPasskey}
                  onChange={(event) =>
                    updateSenderForm('mpesaPasskey', event.target.value)
                  }
                />
              </div>
              <div>
                <label className="label">SMS unit callback URL</label>
                <input
                  className="input"
                  value={senderForm.mpesaCallbackUrl}
                  onChange={(event) =>
                    updateSenderForm('mpesaCallbackUrl', event.target.value)
                  }
                />
              </div>
            </div>
          </div>
          <button
            className="btn-primary w-full justify-center lg:col-span-2"
            disabled={saveSenderMutation.isPending}
            type="submit"
          >
            <KeyRound size={16} />
            {saveSenderMutation.isPending
              ? 'Saving...'
              : 'Save platform settings'}
          </button>
        </form>
      </section>
    </div>
  );
}
