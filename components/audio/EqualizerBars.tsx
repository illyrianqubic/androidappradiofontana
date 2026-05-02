import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../../constants/tokens';

type EqualizerBarsProps = {
  bars?: number;
  playing: boolean;
  variant?: 'full' | 'mini';
  color?: string;
  height?: number;
};

const FULL_BAR_COUNT = 5;
const MINI_BAR_COUNT = 3;

// H10/H11: ONE master phase value drives every bar. Previously each bar held
// its own withRepeat(withSequence) loop — 13 bars on /live alone meant 13
// independent animation drivers running on the UI thread. Now a single
// withRepeat advances `phase` 0->1->0 and each bar derives its height from a
// staggered sine of that phase. Reanimated runs one animator instead of N.
function Bar({
  index,
  phase,
  minHeight,
  maxHeight,
  width,
  marginRight,
  color,
}: {
  index: number;
  phase: SharedValue<number>;
  minHeight: number;
  maxHeight: number;
  width: number;
  marginRight: number;
  color: string;
}) {
  // Each bar gets a fixed phase offset and amplitude so the row looks lively
  // rather than synchronised. The derived value is a thin worklet that just
  // reads the shared phase — it does not start its own animation.
  const offset = (index * 0.37) % 1;
  const amplitude = 0.5 + (index % 3) * 0.15;

  const h = useDerivedValue(() => {
    'worklet';
    // sin maps [-1,1] -> shift to [0,1] for height interpolation
    const s = (Math.sin((phase.value + offset) * Math.PI * 2) + 1) * 0.5;
    const peak = Math.max(minHeight + 2, maxHeight * amplitude);
    return minHeight + (peak - minHeight) * s;
  }, [minHeight, maxHeight, offset, amplitude]);

  const animatedStyle = useAnimatedStyle(() => ({ height: h.value }), [h]);

  return (
    <Animated.View
      style={[
        styles.bar,
        { width, marginRight, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

// H-B1/H-B2: memoize Bar so parent re-renders (color/height tweens) don't
// rebuild its hooks. The shared `phase` reference is stable across renders.
const MemoBar = memo(Bar);

export function EqualizerBars({
  bars = 5,
  playing,
  variant = 'full',
  color = colors.primary,
  height,
}: EqualizerBarsProps) {
  const maxHeight = height ?? (variant === 'full' ? 68 : 14);
  const minHeight = variant === 'full' ? 18 : 4;
  const visibleBarCount =
    variant === 'mini'
      ? MINI_BAR_COUNT
      : Math.min(Math.max(bars, 1), FULL_BAR_COUNT);

  const barWidth = variant === 'mini' ? 3 : 10;
  const barGap = variant === 'mini' ? 3 : 8;

  // Single shared phase, single withRepeat — drives all bars in this row.
  const phase = useSharedValue(0);

  useEffect(() => {
    if (playing) {
      phase.value = 0;
      phase.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(phase);
      phase.value = withTiming(0, { duration: 200 });
    }
    return () => {
      cancelAnimation(phase);
    };
  }, [playing, phase]);

  return (
    <View
      style={[
        variant === 'mini' ? styles.miniRow : styles.fullRow,
        { height: maxHeight },
      ]}
    >
      {Array.from({ length: visibleBarCount }, (_, index) => (
        <MemoBar
          key={`bar-${index}`}
          index={index}
          phase={phase}
          minHeight={minHeight}
          maxHeight={maxHeight}
          width={barWidth}
          marginRight={index === visibleBarCount - 1 ? 0 : barGap}
          color={color}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fullRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  bar: {
    borderRadius: 4,
  },
});
