import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  Clock4,
  Facebook,
  Globe2,
  Instagram,
  LifeBuoy,
  Mail,
  MessageSquareText,
  PhoneCall,
  ShieldCheck,
  Twitter,
  UserCog,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import api, { getPortalPath, saveSession } from '../../services/api';

const landingHighlights = [
  {
    icon: ShieldCheck,
    title: 'Contribution analytics',
    text: 'See total collections, account performance, payment channel mix, and contribution trends from one clear finance dashboard.',
  },
  {
    icon: Clock4,
    title: 'Action-ready reporting',
    text: 'Filter by date, account, and payment channel, then export reports that support reviews, accountability, and planning.',
  },
  {
    icon: Mail,
    title: 'Receipt communication',
    text: 'Send personalized confirmation messages based on the exact transaction type that was received.',
  },
];

const featureCards = [
  {
    label: 'Staff access',
    title: 'Controlled user access and role assignment',
    icon: UserCog,
    points: [
      'Create staff accounts for the people who manage finance, reporting, and contribution entry.',
      'Keep sensitive finance activity controlled by giving each user the right level of visibility and action access.',
    ],
  },
  {
    label: 'Transaction messaging',
    title: 'Personalized messages by transaction type',
    icon: MessageSquareText,
    points: [
      'Configure different confirmation messages for tithe, offering, harambee, and other fund accounts.',
      'Use transaction-specific templates so receipts match the contribution type that was recorded.',
    ],
  },
];

const workflowSteps = [
  'Capture each payment under the right fund account so reporting stays accurate from the start.',
  'Review performance by account type, payment channel, and selected date range from one clean ledger.',
  'Turn contribution history into exports and summaries that support confident financial decisions.',
];

const heroPillOptions = [
  'Detailed analytics',
  'Clear records',
  'Personalized responses',
  'Easy-to-use',
];

const widestHeroPillLabel = heroPillOptions.reduce((widest, option) =>
  option.length > widest.length ? option : widest
);

const initialEnquiryForm = {
  organizationName: '',
  contactName: '',
  email: '',
  phone: '',
  message: '',
};

export default function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showLoginSheet, setShowLoginSheet] = useState(false);
  const [showEnquiryModal, setShowEnquiryModal] = useState(false);
  const [activeHeroPill, setActiveHeroPill] = useState(0);
  const [enquiryForm, setEnquiryForm] = useState(initialEnquiryForm);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/auth/login', {
        identifier,
        password,
      });
      return response.data;
    },
    onSuccess: (data) => {
      const session = saveSession(data);
      toast.success('Signed in successfully');
      navigate(getPortalPath(session.user), { replace: true });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to sign in');
    },
  });

  const enquiryMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/public/enquiries', enquiryForm);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Enquiry submitted successfully');
      setEnquiryForm(initialEnquiryForm);
      setShowEnquiryModal(false);
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to submit enquiry',
      );
    },
  });

  useEffect(() => {
    if (!showLoginSheet) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowLoginSheet(false);
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => window.removeEventListener('keydown', handleEscape);
  }, [showLoginSheet]);

  useEffect(() => {
    if (!showEnquiryModal) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !enquiryMutation.isPending) {
        setShowEnquiryModal(false);
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => window.removeEventListener('keydown', handleEscape);
  }, [showEnquiryModal, enquiryMutation.isPending]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveHeroPill((current) => (current + 1) % heroPillOptions.length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reveal]')
    );

    if (!nodes.length) {
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.16,
        rootMargin: '0px 0px -10% 0px',
      }
    );

    nodes.forEach((node, index) => {
      node.style.setProperty('--reveal-delay', `${Math.min(index * 70, 360)}ms`);
      observer.observe(node);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="app-shell-background min-h-screen px-4 py-4 text-stone-50 xl:px-7 2xl:px-8">
      <div className="mx-auto min-h-[calc(100vh-2rem)] max-w-[1880px]">
        <section className="panel reveal-block p-7 lg:p-8 2xl:p-10" data-reveal>
          <div>
            <div className="grid gap-8 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
              <div>
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-6 xl:gap-8">
                  <div className="flex shrink-0 flex-col items-start">
                    <BrandLogo className="mb-4" size="xl" />
                    <p className="eyebrow-pill relative justify-center text-center">
                      <span aria-hidden="true" className="invisible whitespace-nowrap">
                        {widestHeroPillLabel}
                      </span>
                      <span
                        aria-live="polite"
                        className="absolute inset-0 inline-flex items-center justify-center px-3.5"
                      >
                        {heroPillOptions[activeHeroPill]}
                      </span>
                    </p>
                  </div>

                  <div className="max-w-5xl flex-1 lg:pt-3">
                    <h1 className="display-heading text-[2rem] font-semibold leading-[1.04] tracking-[-0.028em] text-white sm:text-[2.25rem] lg:text-[2.55rem] xl:text-[2.85rem] 2xl:text-[3.05rem]">
                      Gain a complete view of collections, fund performance, and reporting trends.
                    </h1>
                    <p className="mt-4 max-w-3xl text-[0.98rem] leading-7 text-stone-300 xl:text-[1.02rem]">
                      Designed to improve contribution tracking, analysis, and accountability.
                    </p>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                      <button
                        className="btn-primary justify-center sm:min-w-[180px]"
                        type="button"
                        onClick={() => setShowLoginSheet(true)}
                      >
                        Sign in
                      </button>
                      <button
                        className="btn-secondary justify-center sm:min-w-[220px]"
                        type="button"
                        onClick={() => setShowEnquiryModal(true)}
                      >
                        Create account with us
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-8 grid gap-4 xl:grid-cols-2">
                  {featureCards.map((card, index) => (
                    <div
                      key={card.title}
                      className="reveal-block rounded-[28px] border border-white/10 bg-black/10 p-5"
                      data-reveal
                      style={{ transitionDelay: `${120 + index * 80}ms` }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                            {card.label}
                          </p>
                          <h3 className="mt-3 text-xl font-semibold text-white">
                            {card.title}
                          </h3>
                        </div>
                        <card.icon size={20} className="mt-1 shrink-0 text-amber-200" />
                      </div>

                      <div className="mt-5 space-y-3">
                        {card.points.map((point) => (
                          <div
                            key={point}
                            className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                          >
                            <ArrowRight
                              size={16}
                              className="mt-0.5 shrink-0 text-amber-200"
                            />
                            <p className="text-sm leading-6 text-stone-300">{point}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 grid gap-4 xl:grid-cols-3">
                  {landingHighlights.map((item, index) => (
                    <div
                      key={item.title}
                      className="reveal-block rounded-[28px] border border-white/10 bg-black/10 p-5"
                      data-reveal
                      style={{ transitionDelay: `${200 + index * 80}ms` }}
                    >
                      <item.icon size={18} className="text-amber-200" />
                      <h3 className="mt-4 text-lg font-semibold text-white">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-stone-300">
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="reveal-block rounded-[30px] border border-white/10 bg-black/10 p-6"
                data-reveal
              >
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Analytics workflow
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-white">
                  Move from received funds to usable financial insight.
                </h2>

                <div className="mt-6 space-y-4">
                  {workflowSteps.map((step, index) => (
                    <div
                      key={step}
                      className="flex items-start gap-4 rounded-3xl border border-white/10 bg-white/5 p-4"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-200/25 bg-amber-200/10 text-sm font-semibold text-amber-100">
                        0{index + 1}
                      </span>
                      <p className="text-sm leading-6 text-stone-300">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="panel reveal-block mt-6 overflow-hidden p-0" data-reveal>
          <div className="border-b border-white/10 px-6 py-6 sm:px-7">
            <h3 className="text-[2rem] font-semibold text-white">
              Connect With Us
            </h3>

            <div className="mt-5 flex gap-3">
              <button className="shell-icon-button" type="button" aria-label="Facebook">
                <Facebook size={18} />
              </button>
              <button className="shell-icon-button" type="button" aria-label="Instagram">
                <Instagram size={18} />
              </button>
              <button className="shell-icon-button" type="button" aria-label="X">
                <Twitter size={18} />
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-3 text-[1.05rem] text-stone-100">
              <div className="flex items-center gap-3 leading-7">
                <Mail size={17} className="shrink-0 text-stone-300" />
                <span className="break-all sm:break-normal">
                  support@choicenetworks.co.ke
                </span>
              </div>

              <div className="flex items-center gap-3 leading-7 text-stone-100">
                <PhoneCall size={17} className="shrink-0 text-stone-300" />
                <span>Client support line available on request</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-6 py-5 text-sm text-stone-300 sm:px-7 sm:text-base">
            <p>© 2026 Choice Networks. All rights reserved.</p>
            <a
              className="power-credit-link transition hover:text-white"
              href="https://pulsecloud.theleasemaster.com"
              target="_blank"
              rel="noreferrer"
            >
              Powered by{' '}
              <span className="power-credit-mark font-semibold text-sky-300">
                LeaseMaster Pulse Cloud
              </span>
            </a>
          </div>
        </footer>
      </div>

      {showEnquiryModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!enquiryMutation.isPending) {
              setShowEnquiryModal(false);
            }
          }}
        >
          <div
            className="modal-shell items-center"
            onClick={(event) => event.stopPropagation()}
          >
            <section className="panel modal-card max-w-5xl p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Client onboarding
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    We create and prepare each workspace with you.
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-300">
                    Share your enquiry and our team will help you prepare the
                    right subscription setup, fund account structure, and user
                    access plan for your workspace.
                  </p>
                </div>

                <button
                  aria-label="Close enquiry modal"
                  className="btn-secondary px-3 py-2"
                  type="button"
                  onClick={() => setShowEnquiryModal(false)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <div className="rounded-[28px] border border-white/10 bg-black/10 p-5">
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                        What happens next
                      </p>
                      <div className="mt-4 space-y-3">
                        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <Globe2 size={16} className="mt-0.5 shrink-0 text-amber-200" />
                          <p className="text-sm leading-6 text-stone-300">
                            We review your operating needs and recommend the
                            best workspace setup for your team.
                          </p>
                        </div>
                        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <ShieldCheck
                            size={16}
                            className="mt-0.5 shrink-0 text-amber-200"
                          />
                          <p className="text-sm leading-6 text-stone-300">
                            We help prepare fund accounts, reporting access, and
                            contribution controls before go-live.
                          </p>
                        </div>
                        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <LifeBuoy
                            size={16}
                            className="mt-0.5 shrink-0 text-amber-200"
                          />
                          <p className="text-sm leading-6 text-stone-300">
                            Support follows through onboarding so your team can
                            start using the workspace with clarity.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="badge border-white/10 bg-white/5 text-stone-200">
                        Subscription setup
                      </span>
                      <span className="badge border-white/10 bg-white/5 text-stone-200">
                        Fund account configuration
                      </span>
                      <span className="badge border-white/10 bg-white/5 text-stone-200">
                        User access setup
                      </span>
                    </div>
                  </div>
                </div>

                <form
                  className="rounded-[28px] border border-white/10 bg-black/10 p-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    enquiryMutation.mutate();
                  }}
                >
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Submit enquiry
                  </p>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="label">Organization name</label>
                      <input
                        className="input"
                        value={enquiryForm.organizationName}
                        onChange={(event) =>
                          setEnquiryForm((current) => ({
                            ...current,
                            organizationName: event.target.value,
                          }))
                        }
                        placeholder="Choice Networks Church"
                      />
                    </div>

                    <div>
                      <label className="label">Contact name</label>
                      <input
                        className="input"
                        value={enquiryForm.contactName}
                        onChange={(event) =>
                          setEnquiryForm((current) => ({
                            ...current,
                            contactName: event.target.value,
                          }))
                        }
                        placeholder="Full name"
                      />
                    </div>

                    <div>
                      <label className="label">Email</label>
                      <input
                        className="input"
                        type="email"
                        value={enquiryForm.email}
                        onChange={(event) =>
                          setEnquiryForm((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        placeholder="support@example.com"
                      />
                    </div>

                    <div>
                      <label className="label">Phone</label>
                      <input
                        className="input"
                        value={enquiryForm.phone}
                        onChange={(event) =>
                          setEnquiryForm((current) => ({
                            ...current,
                            phone: event.target.value,
                          }))
                        }
                        placeholder="+254..."
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="label">What do you need help with?</label>
                      <textarea
                        className="input min-h-36 resize-y"
                        value={enquiryForm.message}
                        onChange={(event) =>
                          setEnquiryForm((current) => ({
                            ...current,
                            message: event.target.value,
                          }))
                        }
                        placeholder="Tell us about your reporting, onboarding, or contribution management needs."
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button
                      className="btn-secondary flex-1 justify-center"
                      type="button"
                      onClick={() => setShowEnquiryModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-primary flex-1 justify-center"
                      type="submit"
                    >
                      {enquiryMutation.isPending
                        ? 'Submitting enquiry...'
                        : 'Submit enquiry'}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {showLoginSheet ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setShowLoginSheet(false)}
        >
          <div className="modal-shell" onClick={(event) => event.stopPropagation()}>
            <section className="panel reveal-block is-visible w-full max-w-2xl rounded-[30px] p-5 sm:p-6">
              <div className="mx-auto mb-6 h-1.5 w-16 rounded-full bg-white/10" />

              <div>
                <p className="eyebrow-pill">
                  Login
                </p>
                <h2 className="display-heading mt-5 text-3xl font-semibold text-white">
                  Access your church analytics workspace
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">
                  Sign in to view contributions, monitor fund performance,
                  manage staff access, and keep receipt communication aligned
                  with each transaction type.
                </p>
              </div>

              <form
                className="mt-8 space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  loginMutation.mutate();
                }}
              >
                <div>
                  <label className="label">Email, username, or phone</label>
                  <input
                    className="input"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="admin@example.com"
                  />
                </div>

                <div>
                  <label className="label">Password</label>
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    className="btn-secondary justify-center sm:flex-1"
                    type="button"
                    onClick={() => setShowLoginSheet(false)}
                  >
                    Back
                  </button>
                  <button
                    className="btn-primary justify-center sm:flex-1"
                    type="submit"
                  >
                    {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
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
