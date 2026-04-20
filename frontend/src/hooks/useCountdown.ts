import { useEffect, useRef, useState } from 'react';

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
  expired: boolean;
  formatted: string;
  urgency: 'critical' | 'warning' | 'normal';
}

function compute(targetAt: string | null | undefined): CountdownParts {
  if (!targetAt) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      total: 0,
      expired: true,
      formatted: '0d 00h 00m 00s',
      urgency: 'critical',
    };
  }

  const diff = new Date(targetAt).getTime() - Date.now();
  if (diff <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      total: 0,
      expired: true,
      formatted: 'Expired',
      urgency: 'critical',
    };
  }

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);
  const urgency: CountdownParts['urgency'] =
    diff < 3_600_000 ? 'critical' : diff < 86_400_000 ? 'warning' : 'normal';

  return {
    days,
    hours,
    minutes,
    seconds,
    total: diff,
    expired: false,
    formatted: `${days}d ${String(hours).padStart(2, '0')}h ${String(
      minutes,
    ).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`,
    urgency,
  };
}

export function useCountdown(targetAt: string | null | undefined): CountdownParts {
  const [parts, setParts] = useState<CountdownParts>(() => compute(targetAt));
  const ref = useRef(targetAt);
  ref.current = targetAt;

  useEffect(() => {
    setParts(compute(ref.current));
    const id = window.setInterval(() => setParts(compute(ref.current)), 1000);
    return () => window.clearInterval(id);
  }, [targetAt]);

  return parts;
}
