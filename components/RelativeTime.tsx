import { useEffect, useMemo, useState } from 'react';
import { Text, type TextStyle } from 'react-native';
import { colors, fonts } from '../design-tokens';

type RelativeTimeProps = {
  timestamp: string;
  style?: TextStyle;
};

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
    if (minutes === 1) {
      return '1 minutë më parë';
    }

    return `${minutes} minuta më parë`;
  }

  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    if (hours === 1) {
      return '1 orë më parë';
    }

    return `${hours} orë më parë`;
  }

  if (diffMs < 2 * day) {
    return 'Dje';
  }

  return new Intl.DateTimeFormat('sq-AL', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(publishedMs));
}

export function RelativeTime({ timestamp, style }: RelativeTimeProps) {
  const [clockTick, setClockTick] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick(Date.now());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const label = useMemo(() => formatRelative(timestamp, clockTick), [timestamp, clockTick]);

  return <Text style={[baseStyle, style]}>{label}</Text>;
}

const baseStyle: TextStyle = {
  fontFamily: fonts.uiRegular,
  fontSize: 12,
  color: colors.textMuted,
};
