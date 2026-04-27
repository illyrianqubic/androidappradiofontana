import { memo, useEffect, useMemo, useState } from 'react';
import { Text, type TextStyle } from 'react-native';
import { colors, fonts } from '../design-tokens';

type RelativeTimeProps = {
  timestamp: string;
  style?: TextStyle;
};

// ── Shared module-level clock ─────────────────────────────────────────────────
// A single interval drives all RelativeTime instances instead of one per card.
let _clockMs = Date.now();
const _subscribers = new Set<() => void>();
let _timer: ReturnType<typeof setInterval> | null = null;

function tickSubscribe(fn: () => void): () => void {
  _subscribers.add(fn);
  if (!_timer) {
    _timer = setInterval(() => {
      _clockMs = Date.now();
      _subscribers.forEach((f) => f());
    }, 60_000);
  }
  return () => {
    _subscribers.delete(fn);
    if (_subscribers.size === 0 && _timer) {
      clearInterval(_timer);
      _timer = null;
    }
  };
}

function formatRelative(timestamp: string, nowMs: number) {
  const publishedMs = new Date(timestamp).getTime();

  if (Number.isNaN(publishedMs)) {
    return '';
  }

  const diffMs = Math.max(0, nowMs - publishedMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'Tani';
  }

  if (diffMs < hour) {
    const minutes = Math.floor(diffMs / minute);
    return minutes === 1 ? '1 minutë më parë' : `${minutes} minuta më parë`;
  }

  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    return hours === 1 ? '1 orë më parë' : `${hours} orë më parë`;
  }

  if (diffMs < 2 * day) {
    return 'Dje';
  }

  return new Intl.DateTimeFormat('sq-AL', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(publishedMs));
}

export const RelativeTime = memo(function RelativeTime({ timestamp, style }: RelativeTimeProps) {
  const [clockMs, setClockMs] = useState(() => _clockMs);

  useEffect(() => tickSubscribe(() => setClockMs(_clockMs)), []);

  const label = useMemo(() => formatRelative(timestamp, clockMs), [timestamp, clockMs]);

  return <Text style={[baseStyle, style]}>{label}</Text>;
});

const baseStyle: TextStyle = {
  fontFamily: fonts.uiRegular,
  fontSize: 12,
  color: colors.textMuted,
};
