import { Clock3, ShieldAlert, TimerReset } from 'lucide-react';
import { useCountdown } from '../hooks/useCountdown';

interface CountdownBadgeProps {
  status: 'active' | 'grace' | 'suspended';
  expiresAt?: string | null;
  graceEndsAt?: string | null;
  label?: string;
  variant?: 'inline' | 'card';
}

export function CountdownBadge({
  status,
  expiresAt,
  graceEndsAt,
  label,
  variant = 'inline',
}: CountdownBadgeProps) {
  const target =
    status === 'grace'
      ? graceEndsAt || null
      : status === 'active'
      ? expiresAt || null
      : null;
  const countdown = useCountdown(target);

  const meta =
    status === 'suspended'
      ? {
          tone: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
          icon: <ShieldAlert size={18} />,
          text: 'Suspended',
        }
      : status === 'grace'
      ? {
          tone: 'border-amber-400/30 bg-amber-400/10 text-amber-50',
          icon: <TimerReset size={18} />,
          text: countdown.formatted,
        }
      : {
          tone:
            countdown.urgency === 'critical'
              ? 'border-orange-400/40 bg-orange-400/10 text-orange-50'
              : countdown.urgency === 'warning'
              ? 'border-yellow-300/30 bg-yellow-300/10 text-yellow-50'
              : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-50',
          icon: <Clock3 size={18} />,
          text: countdown.formatted,
        };

  if (variant === 'card') {
    return (
      <div className={`rounded-3xl border p-5 ${meta.tone}`}>
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-2xl bg-black/15 p-2">{meta.icon}</div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/70">
              {label || (status === 'grace' ? 'Grace ends in' : 'Subscription ends in')}
            </p>
            <p className="text-sm text-white/70">
              {status === 'suspended'
                ? 'Access is blocked until the platform admin reactivates the church.'
                : 'Live countdown from the server-side subscription window.'}
            </p>
          </div>
        </div>
        <div className="mono text-3xl font-semibold tracking-tight">{meta.text}</div>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${meta.tone}`}
    >
      {meta.icon}
      <span>{label || (status === 'grace' ? 'Grace ends in' : 'Ends in')}</span>
      <span className="mono">{meta.text}</span>
    </div>
  );
}
