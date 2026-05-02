import { memo, useEffect, useState } from 'react';
import { Text, type TextStyle } from 'react-native';
import { colors, fonts } from '../../constants/tokens';

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

  return `${Math.floor(diffMs / day)} ditë më parë`;
}

export const RelativeTime = memo(function RelativeTime({ timestamp, style }: RelativeTimeProps) {
  // H17: store the formatted label string directly. The minute-tick updates
  // every subscribed instance, but most timestamps stay in the same bucket
  // ("3 orë më parë") for many ticks. Comparing the new label against the
  // previous and only setState'ing on real change short-circuits the whole
  // React reconciliation for ~90% of ticks across a screen full of cards.
  const [label, setLabel] = useState(() => formatRelative(timestamp, _clockMs));

  useEffect(() => {
    // Re-evaluate label whenever the prop timestamp changes (e.g. card
    // recycle in FlashList swaps in a different post).
    setLabel((prev) => {
      const next = formatRelative(timestamp, _clockMs);
      return prev === next ? prev : next;
    });
    return tickSubscribe(() => {
      setLabel((prev) => {
        const next = formatRelative(timestamp, _clockMs);
        return prev === next ? prev : next;
      });
    });
  }, [timestamp]);

  return <Text style={[baseStyle, style]}>{label}</Text>;
});

const baseStyle: TextStyle = {
  fontFamily: fonts.uiRegular,
  fontSize: 12,
  color: colors.textMuted,
};
