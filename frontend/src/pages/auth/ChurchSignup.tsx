import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Church,
  HandCoins,
  Landmark,
  LockKeyhole,
  PhoneCall,
  Send,
  UserRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, Navigate } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import api, { getSession } from '../../services/api';

type SignupResult = {
  churchId: string;
  churchName: string;
  slug: string;
  credentialsSent: boolean;
  adminUser: {
    name: string;
    email: string;
    username?: string | null;
    phone?: string | null;
  };
};

const initialChurchForm = {
  churchName: '',
  address: '',
  contactEmail: '',
  contactPhone: '',
  adminName: '',
  adminEmail: '',
  adminPhone: '',
  adminUsername: '',
};

const initialMpesaForm = {
  shortcodeType: 'paybill',
  mpesaShortcode: '',
  g2AdminUsername: '',
  contactName: '',
  email: '',
  callbackPhone: '',
};

export default function ChurchSignup() {
  const session = getSession();
  const [churchForm, setChurchForm] = useState(initialChurchForm);
  const [mpesaForm, setMpesaForm] = useState(initialMpesaForm);
  const [signupResult, setSignupResult] = useState<SignupResult | null>(null);
  const [submittedMode, setSubmittedMode] = useState<
    'details' | 'callback' | null
  >(null);

  const signupMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/public/church-signups', churchForm);
      return response.data as SignupResult;
    },
    onSuccess: (data) => {
      setSignupResult(data);
      setMpesaForm((current) => ({
        ...current,
        contactName: data.adminUser.name || churchForm.adminName,
        email: data.adminUser.email || churchForm.adminEmail,
        callbackPhone:
          data.adminUser.phone || churchForm.adminPhone || churchForm.contactPhone,
      }));
      toast.success('Church account created');
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to create church account',
      );
    },
  });

  const onboardingMutation = useMutation({
    mutationFn: async (requestCallback: boolean) => {
      if (!signupResult) {
        throw new Error('Church account is required first');
      }

      const response = await api.post('/public/church-signups/mpesa-onboarding', {
        ...mpesaForm,
        churchId: signupResult.churchId,
        requestCallback,
      });
      return response.data;
    },
    onSuccess: (_data, requestCallback) => {
      setSubmittedMode(requestCallback ? 'callback' : 'details');
      toast.success(
        requestCallback
          ? 'Callback request sent'
          : 'M-Pesa setup details submitted',
      );
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to submit onboarding details',
      );
    },
  });

  const statusText = useMemo(() => {
    if (!signupResult) {
      return 'Step 1 of 2';
    }
    if (!submittedMode) {
      return 'Step 2 of 2';
    }
    return submittedMode === 'callback'
      ? 'Callback requested'
      : 'Details submitted';
  }, [signupResult, submittedMode]);
  const isTillSetup = mpesaForm.shortcodeType === 'till';
  const mpesaNumberLabel = isTillSetup ? 'Till store number' : 'Paybill number';
  const mpesaNumberPlaceholder = isTillSetup
    ? 'Enter the till store number'
    : 'Enter the paybill number';

  if (session?.user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app-shell-background min-h-screen px-4 py-5 text-stone-50 md:px-6 xl:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo size="lg" />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Self-service onboarding
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-white md:text-3xl">
                Create church account
              </h1>
            </div>
          </div>

          <Link className="btn-secondary justify-center" to="/">
            <ArrowLeft size={16} />
            Back to login
          </Link>
        </header>

        <main className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <aside className="panel p-5 md:p-6">
            <p className="eyebrow-pill w-fit">{statusText}</p>
            <h2 className="mt-5 text-2xl font-semibold text-white">
              Account created first, payment details collected next.
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              Once the account is created, the church appears in the Churches
              section for the platform admin. The next step only captures the
              M-Pesa details needed to complete setup.
            </p>

            <div className="mt-6 space-y-3">
              {[
                {
                  icon: Church,
                  title: 'Church profile',
                  text: 'Church name, contact email, phone, and address.',
                },
                {
                  icon: UserRound,
                  title: 'First admin',
                  text: 'The first admin details are attached to the new church.',
                },
                {
                  icon: HandCoins,
                  title: 'M-Pesa readiness',
                  text: 'Paybill or till store number, plus the portal username.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[24px] border border-white/10 bg-black/10 p-4"
                >
                  <div className="flex items-start gap-3">
                    <item.icon className="mt-1 shrink-0 text-amber-200" size={18} />
                    <div>
                      <h3 className="font-semibold text-white">{item.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-stone-300">
                        {item.text}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {signupResult ? (
              <div className="mt-6 rounded-[24px] border border-emerald-300/25 bg-emerald-400/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className="mt-0.5 shrink-0 text-emerald-300"
                    size={18}
                  />
                  <div>
                    <p className="font-semibold text-white">
                      {signupResult.churchName} has been created
                    </p>
                    <p className="mt-1 text-sm leading-6 text-stone-300">
                      It now appears in the Churches section. The platform admin
                      can complete the remaining setup credentials there.
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-emerald-200">
                      Workspace: /c/{signupResult.slug}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </aside>

          <section className="panel overflow-hidden p-0">
            <div className="border-b border-white/10 px-5 py-5 md:px-6">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                {signupResult ? 'M-Pesa onboarding' : 'Account details'}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {signupResult
                  ? 'Submit payment setup details'
                  : 'Create the church workspace'}
              </h2>
            </div>

            {!signupResult ? (
              <form
                className="p-5 md:p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  signupMutation.mutate();
                }}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Church name</label>
                    <input
                      className="input"
                      value={churchForm.churchName}
                      onChange={(event) =>
                        setChurchForm((current) => ({
                          ...current,
                          churchName: event.target.value,
                        }))
                      }
                      placeholder="Grace Community Church"
                    />
                  </div>

                  <div>
                    <label className="label">Church phone</label>
                    <input
                      className="input"
                      value={churchForm.contactPhone}
                      onChange={(event) =>
                        setChurchForm((current) => ({
                          ...current,
                          contactPhone: event.target.value,
                        }))
                      }
                      placeholder="0712 345 678"
                    />
                  </div>

                  <div>
                    <label className="label">Church email</label>
                    <input
                      className="input"
                      type="email"
                      value={churchForm.contactEmail}
                      onChange={(event) =>
                        setChurchForm((current) => ({
                          ...current,
                          contactEmail: event.target.value,
                        }))
                      }
                      placeholder="office@example.org"
                    />
                  </div>

                  <div>
                    <label className="label">Address</label>
                    <input
                      className="input"
                      value={churchForm.address}
                      onChange={(event) =>
                        setChurchForm((current) => ({
                          ...current,
                          address: event.target.value,
                        }))
                      }
                      placeholder="Town, estate, building"
                    />
                  </div>

                  <div>
                    <label className="label">First admin name</label>
                    <input
                      className="input"
                      value={churchForm.adminName}
                      onChange={(event) =>
                        setChurchForm((current) => ({
                          ...current,
                          adminName: event.target.value,
                        }))
                      }
                      placeholder="Full name"
                    />
                  </div>

                  <div>
                    <label className="label">First admin phone</label>
                    <input
                      className="input"
                      value={churchForm.adminPhone}
                      onChange={(event) =>
                        setChurchForm((current) => ({
                          ...current,
                          adminPhone: event.target.value,
                        }))
                      }
                      placeholder="0712 345 678"
                    />
                  </div>

                  <div>
                    <label className="label">First admin email</label>
                    <input
                      className="input"
                      type="email"
                      value={churchForm.adminEmail}
                      onChange={(event) =>
                        setChurchForm((current) => ({
                          ...current,
                          adminEmail: event.target.value,
                        }))
                      }
                      placeholder="admin@example.org"
                    />
                  </div>

                  <div>
                    <label className="label">Preferred username</label>
                    <input
                      className="input"
                      value={churchForm.adminUsername}
                      onChange={(event) =>
                        setChurchForm((current) => ({
                          ...current,
                          adminUsername: event.target.value,
                        }))
                      }
                      placeholder="church-admin"
                    />
                  </div>
                </div>

                <button
                  className="btn-primary mt-6 w-full justify-center md:w-auto"
                  type="submit"
                >
                  <LockKeyhole size={16} />
                  {signupMutation.isPending
                    ? 'Creating account...'
                    : 'Create account'}
                </button>
              </form>
            ) : (
              <form className="p-5 md:p-6">
                <div className="rounded-[24px] border border-white/10 bg-black/10 p-4">
                  <div className="flex items-start gap-3">
                    <Landmark className="mt-1 shrink-0 text-amber-200" size={18} />
                    <p className="text-sm leading-6 text-stone-300">
                      Select whether the church uses a Paybill or Till. For a
                      Paybill, enter the paybill number. For a Till, enter the
                      store number used for collections. The username is the
                      user who signs in to the M-Pesa portal or Safaricom G2
                      portal.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">M-Pesa account type</label>
                    <select
                      className="input"
                      value={mpesaForm.shortcodeType}
                      onChange={(event) =>
                        setMpesaForm((current) => ({
                          ...current,
                          shortcodeType: event.target.value,
                          mpesaShortcode: '',
                        }))
                      }
                    >
                      <option value="paybill">Paybill</option>
                      <option value="till">Till</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">{mpesaNumberLabel}</label>
                    <input
                      className="input"
                      value={mpesaForm.mpesaShortcode}
                      onChange={(event) =>
                        setMpesaForm((current) => ({
                          ...current,
                          mpesaShortcode: event.target.value,
                        }))
                      }
                      placeholder={mpesaNumberPlaceholder}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="label">M-Pesa portal / G2 username</label>
                    <input
                      className="input"
                      value={mpesaForm.g2AdminUsername}
                      onChange={(event) =>
                        setMpesaForm((current) => ({
                          ...current,
                          g2AdminUsername: event.target.value,
                        }))
                      }
                      placeholder="Username used to log in to the portal"
                    />
                  </div>
                </div>

                {submittedMode ? (
                  <div className="mt-5 rounded-[24px] border border-emerald-300/25 bg-emerald-400/10 p-4 text-sm leading-6 text-stone-200">
                    {submittedMode === 'callback'
                      ? 'Your callback request is now visible in the enquiries section.'
                      : 'Your M-Pesa onboarding details are now visible in the enquiries section.'}
                  </div>
                ) : null}

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <button
                    className="btn-secondary justify-center"
                    type="button"
                    onClick={() => onboardingMutation.mutate(true)}
                  >
                    <PhoneCall size={16} />
                    {onboardingMutation.isPending
                      ? 'Submitting...'
                      : 'Request callback'}
                  </button>
                  <button
                    className="btn-primary justify-center"
                    type="button"
                    onClick={() => onboardingMutation.mutate(false)}
                  >
                    {submittedMode === 'details' ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <Send size={16} />
                    )}
                    {onboardingMutation.isPending
                      ? 'Submitting...'
                      : 'Submit M-Pesa details'}
                  </button>
                </div>

                <div className="mt-4 flex items-start gap-3 text-sm leading-6 text-stone-400">
                  <PhoneCall className="mt-0.5 shrink-0" size={16} />
                  <p>
                    Callback requests use the first admin phone or email from
                    the account creation step.
                  </p>
                </div>
              </form>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
