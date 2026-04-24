import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../design-tokens';

type EqualizerBarsProps = {
  bars?: number;
  playing: boolean;
  variant?: 'full' | 'mini';
  color?: string;
  height?: number;
};

const FULL_BAR_COUNT = 5;
const MINI_BAR_COUNT = 3;

export function EqualizerBars({
  bars = 5,
  playing,
  variant = 'full',
  color = colors.primary,
  height,
}: EqualizerBarsProps) {
  const maxHeight = height ?? (variant === 'full' ? 68 : 14);
  const minHeight = variant === 'full' ? 18 : 4;
  const visibleBarCount = variant === 'mini' ? MINI_BAR_COUNT : Math.min(Math.max(bars, 1), FULL_BAR_COUNT);

  const animatedHeights = useRef(
    Array.from({ length: FULL_BAR_COUNT }, () => new Animated.Value(minHeight)),
  ).current;

  const visibleHeights = useMemo(
    () => animatedHeights.slice(0, visibleBarCount),
    [animatedHeights, visibleBarCount],
  );

  useEffect(() => {
    if (!playing) {
      visibleHeights.forEach((value) => {
        value.stopAnimation();
        value.setValue(minHeight);
      });
      return;
    }

    const loops = visibleHeights.map((value, index) => {
      const peakHeight = Math.max(minHeight + 2, maxHeight * (0.5 + (index % 3) * 0.15));
      const lowHeight = minHeight + (index % 2 === 0 ? 2 : 0);

      return Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: peakHeight,
            duration: 220 + index * 70,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(value, {
            toValue: lowHeight,
            duration: 240 + index * 60,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ]),
      );
    });

    loops.forEach((loop) => loop.start());

    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [playing, maxHeight, minHeight, visibleHeights]);

  const barWidth = variant === 'mini' ? 3 : 10;
  const barGap = variant === 'mini' ? 3 : 8;

  return (
    <View style={[variant === 'mini' ? styles.miniRow : styles.fullRow, { height: maxHeight }]}>
      {visibleHeights.map((animatedHeight, index) => (
        <Animated.View
          key={`bar-${index}`}
          style={[
            styles.bar,
            {
              width: barWidth,
              marginRight: index === visibleBarCount - 1 ? 0 : barGap,
              backgroundColor: color,
              height: animatedHeight,
            },
          ]}
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
