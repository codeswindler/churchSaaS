import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CreditCard,
  HelpCircle,
  LockKeyhole,
  Moon,
  PhoneCall,
  Send,
  Sun,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, Navigate } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import {
  PUBLIC_COLOR_MODE_STORAGE_KEY,
  useColorMode,
} from '../../hooks/useColorMode';
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
  adminName: '',
  adminEmail: '',
  adminPhone: '',
};

const initialMpesaForm = {
  hasPaybill: '',
  paybillType: '',
  mpesaShortcode: '',
  g2AdminUsername: '',
  businessName: '',
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
    'details' | 'guidance' | null
  >(null);
  const { isLightMode, toggleColorMode } = useColorMode(
    'light',
    PUBLIC_COLOR_MODE_STORAGE_KEY,
  );

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
        callbackPhone: data.adminUser.phone || churchForm.adminPhone,
      }));
      toast.success(
        data.credentialsSent
          ? 'Account created. Credentials sent by SMS.'
          : 'Account created. Credentials SMS needs follow-up.',
      );
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to create church account',
      );
    },
  });

  const onboardingMutation = useMutation({
    mutationFn: async (requestGuidance: boolean) => {
      if (!signupResult) {
        throw new Error('Church account is required first');
      }

      const shortcodeType = requestGuidance
        ? mpesaForm.hasPaybill === 'no'
          ? 'no_paybill'
          : 'bank_paybill'
        : 'safaricom_paybill';

      const response = await api.post('/public/church-signups/mpesa-onboarding', {
        ...mpesaForm,
        churchId: signupResult.churchId,
        shortcodeType,
        requestCallback: requestGuidance,
      });
      return response.data;
    },
    onSuccess: (_data, requestGuidance) => {
      setSubmittedMode(requestGuidance ? 'guidance' : 'details');
      toast.success(
        requestGuidance ? 'Guidance request sent' : 'Paybill details submitted',
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
    return submittedMode === 'guidance'
      ? 'Guidance requested'
      : 'Details submitted';
  }, [signupResult, submittedMode]);
  const needsGuidance =
    mpesaForm.hasPaybill === 'no' || mpesaForm.paybillType === 'bank';
  const isSafaricomPaybill =
    mpesaForm.hasPaybill === 'yes' && mpesaForm.paybillType === 'safaricom';
  const guidanceReason =
    mpesaForm.hasPaybill === 'no'
      ? 'This church does not have a Paybill yet.'
      : 'Bank Paybills need guidance before automated Safaricom C2B setup.';

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

          <div className="flex items-center gap-2">
            <button
              aria-label={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
              className="shell-icon-button"
              title={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
              type="button"
              onClick={toggleColorMode}
            >
              {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            <Link className="btn-secondary justify-center" to="/">
              <ArrowLeft size={16} />
              Back to login
            </Link>
          </div>
        </header>

        <main className="mx-auto mt-6 max-w-5xl">
          <section className="panel overflow-hidden p-0">
            <div className="border-b border-white/10 px-5 py-5 md:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    {signupResult ? 'M-Pesa onboarding' : 'Account details'}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    {signupResult
                      ? 'Submit payment setup details'
                      : 'Create the church workspace'}
                  </h2>
                </div>
                <p className="eyebrow-pill w-fit">{statusText}</p>
              </div>
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
                      required
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
                    <label className="label">Admin name</label>
                    <input
                      className="input"
                      required
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
                    <label className="label">Admin phone</label>
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
                    <label className="label">Admin email</label>
                    <input
                      className="input"
                      type="email"
                      required
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
                </div>

                <button
                  className="btn-primary mt-6 w-full justify-center md:w-auto"
                  disabled={signupMutation.isPending}
                  type="submit"
                >
                  <LockKeyhole size={16} />
                  {signupMutation.isPending
                    ? 'Creating account...'
                    : 'Create account'}
                </button>
              </form>
            ) : (
              <form
                className="p-5 md:p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (isSafaricomPaybill && !submittedMode) {
                    onboardingMutation.mutate(false);
                  }
                }}
              >
                <div className="mb-5 rounded-[24px] border border-emerald-300/25 bg-emerald-400/10 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2
                      className="mt-0.5 shrink-0 text-emerald-300"
                      size={18}
                    />
                    <div>
                      <p className="font-semibold text-white">
                        {signupResult.churchName} account has been created
                      </p>
                      <p className="mt-1 text-sm leading-6 text-stone-300">
                        {signupResult.credentialsSent
                          ? `Login credentials have been sent by SMS to ${
                              signupResult.adminUser.phone || 'the first admin phone'
                            }.`
                          : 'The account was created, but the credentials SMS could not be confirmed. The platform admin has been alerted to follow up.'}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-emerald-200">
                        Workspace: /c/{signupResult.slug}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-black/10 p-4">
                  <div className="flex items-start gap-3">
                    <CreditCard
                      className="mt-1 shrink-0 text-amber-200"
                      size={18}
                    />
                    <p className="text-sm leading-6 text-stone-300">
                      We only need the Safaricom Paybill details for automated
                      M-Pesa setup. If you do not have one, or the current
                      Paybill is bank-issued, request guidance and our team will
                      follow up.
                    </p>
                  </div>
                </div>

                {!submittedMode && !mpesaForm.hasPaybill ? (
                  <div className="mt-5">
                    <p className="label">Do you already have a Paybill?</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <button
                        className="btn-primary justify-center"
                        type="button"
                        onClick={() =>
                          setMpesaForm((current) => ({
                            ...current,
                            hasPaybill: 'yes',
                            paybillType: '',
                          }))
                        }
                      >
                        Yes
                      </button>
                      <button
                        className="btn-secondary justify-center"
                        type="button"
                        onClick={() =>
                          setMpesaForm((current) => ({
                            ...current,
                            hasPaybill: 'no',
                            paybillType: '',
                            mpesaShortcode: '',
                            g2AdminUsername: '',
                            businessName: '',
                          }))
                        }
                      >
                        No
                      </button>
                    </div>
                  </div>
                ) : null}

                {!submittedMode &&
                mpesaForm.hasPaybill === 'yes' &&
                !mpesaForm.paybillType ? (
                  <div className="mt-5">
                    <p className="label">What type of Paybill is it?</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <button
                        className="btn-primary justify-center"
                        type="button"
                        onClick={() =>
                          setMpesaForm((current) => ({
                            ...current,
                            paybillType: 'safaricom',
                          }))
                        }
                      >
                        <CreditCard size={16} />
                        Safaricom Paybill
                      </button>
                      <button
                        className="btn-secondary justify-center"
                        type="button"
                        onClick={() =>
                          setMpesaForm((current) => ({
                            ...current,
                            paybillType: 'bank',
                            mpesaShortcode: '',
                            g2AdminUsername: '',
                            businessName: '',
                          }))
                        }
                      >
                        <Building2 size={16} />
                        Bank Paybill
                      </button>
                    </div>
                  </div>
                ) : null}

                {!submittedMode && isSafaricomPaybill ? (
                  <>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="label">Paybill number</label>
                        <input
                          className="input"
                          required
                          value={mpesaForm.mpesaShortcode}
                          onChange={(event) =>
                            setMpesaForm((current) => ({
                              ...current,
                              mpesaShortcode: event.target.value,
                            }))
                          }
                          placeholder="4049311"
                        />
                      </div>

                      <div>
                        <label className="label">Business name</label>
                        <input
                          className="input"
                          required
                          value={mpesaForm.businessName}
                          onChange={(event) =>
                            setMpesaForm((current) => ({
                              ...current,
                              businessName: event.target.value,
                            }))
                          }
                          placeholder="Registered Paybill business name"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="label">Admin username</label>
                        <input
                          className="input"
                          required
                          value={mpesaForm.g2AdminUsername}
                          onChange={(event) =>
                            setMpesaForm((current) => ({
                              ...current,
                              g2AdminUsername: event.target.value,
                            }))
                          }
                          placeholder="Username used to log in to Safaricom portal"
                        />
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                      <button
                        className="btn-secondary justify-center"
                        type="button"
                        onClick={() =>
                          setMpesaForm((current) => ({
                            ...current,
                            paybillType: '',
                            mpesaShortcode: '',
                            g2AdminUsername: '',
                            businessName: '',
                          }))
                        }
                      >
                        Change Paybill type
                      </button>
                      <button
                        className="btn-primary justify-center"
                        disabled={onboardingMutation.isPending}
                        type="submit"
                      >
                        <Send size={16} />
                        {onboardingMutation.isPending
                          ? 'Submitting...'
                          : 'Submit Paybill details'}
                      </button>
                    </div>
                  </>
                ) : null}

                {!submittedMode && needsGuidance ? (
                  <div className="mt-5 rounded-[24px] border border-amber-200/25 bg-amber-200/10 p-4">
                    <div className="flex items-start gap-3">
                      <HelpCircle
                        className="mt-0.5 shrink-0 text-amber-200"
                        size={18}
                      />
                      <div>
                        <p className="font-semibold text-white">
                          Paybill guidance needed
                        </p>
                        <p className="mt-1 text-sm leading-6 text-stone-300">
                          {guidanceReason} We can guide you on acquiring the
                          right Safaricom Paybill and preparing it for direct
                          collection callbacks.
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <button
                        className="btn-secondary justify-center"
                        type="button"
                        onClick={() =>
                          setMpesaForm((current) => ({
                            ...current,
                            hasPaybill: '',
                            paybillType: '',
                          }))
                        }
                      >
                        Back
                      </button>
                      <button
                        className="btn-primary justify-center"
                        disabled={onboardingMutation.isPending}
                        type="button"
                        onClick={() => onboardingMutation.mutate(true)}
                      >
                        <PhoneCall size={16} />
                        {onboardingMutation.isPending
                          ? 'Sending alert...'
                          : 'Request guidance'}
                      </button>
                    </div>
                  </div>
                ) : null}

                {submittedMode ? (
                  <div className="mt-5 rounded-[24px] border border-emerald-300/25 bg-emerald-400/10 p-4 text-sm leading-6 text-stone-200">
                    {submittedMode === 'guidance'
                      ? 'Thank you. One of our agents will get back to you shortly with Paybill guidance.'
                      : 'Your Safaricom Paybill setup details are now visible to the platform team.'}
                  </div>
                ) : null}
              </form>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
