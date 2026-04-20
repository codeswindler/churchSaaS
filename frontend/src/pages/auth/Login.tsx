import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  Clock4,
  Mail,
  MessageSquareText,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
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

export default function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

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

  return (
    <div className="app-shell-background min-h-screen px-4 py-4 text-stone-50 xl:px-7 2xl:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1880px] gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(420px,0.78fr)]">
        <section className="panel flex flex-col justify-between p-7 lg:p-8 2xl:p-10">
          <div>
            <div className="grid gap-8 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
              <div>
                <p className="eyebrow-pill">
                  Analytics First
                </p>
                <h1 className="display-heading mt-5 max-w-4xl text-5xl font-semibold leading-[1.02] text-white 2xl:text-6xl">
                  Gain a complete view of collections, fund performance, and reporting trends.
                </h1>
                <p className="mt-5 max-w-3xl text-lg leading-8 text-stone-300">
                  Designed to improve contribution tracking, analysis, and accountability.
                </p>

                <div className="mt-8 grid gap-4 xl:grid-cols-2">
                  {featureCards.map((card) => (
                    <div
                      key={card.title}
                      className="rounded-[28px] border border-white/10 bg-black/10 p-5"
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
                  {landingHighlights.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-[28px] border border-white/10 bg-black/10 p-5"
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

              <div className="rounded-[30px] border border-white/10 bg-black/10 p-6">
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Analytics workflow
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-white">
                  Move from received funds to usable financial insight.
                </h2>

                <div className="mt-6 space-y-4">
                  {[
                    'Capture each payment under the right fund account so reporting stays accurate from the start.',
                    'Review performance by account type, payment channel, and selected date range from one clean ledger.',
                    'Turn contribution history into exports and summaries that support confident financial decisions.',
                  ].map((step, index) => (
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

        <section className="panel flex flex-col p-7 lg:p-8 2xl:p-10 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <div>
            <p className="eyebrow-pill">
              Login
            </p>
            <h2 className="display-heading mt-5 text-3xl font-semibold text-white">
              Access your church analytics workspace
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              Sign in to view contributions, monitor fund performance, manage
              staff access, and keep receipt communication aligned with each
              transaction type.
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

            <button className="btn-primary w-full justify-center" type="submit">
              {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
