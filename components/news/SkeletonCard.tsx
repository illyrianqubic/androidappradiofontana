import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  makeMutable,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { radius } from '../../constants/tokens';
import { useTheme } from '../../providers/ThemeProvider';
import type { ThemeColors } from '../../providers/ThemeProvider';

type SkeletonCardProps = {
  height?: number;
  style?: ViewStyle;
};

// Single shared shimmer driver — one looping worklet for ALL skeleton instances.
// Reference-counted so it only runs while at least one visible screen has a
// SkeletonCard mounted.
const sharedShimmer = makeMutable(0);
let activeCount = 0;

function startShimmer() {
  sharedShimmer.value = withRepeat(
    withTiming(1, { duration: 1200, easing: Easing.linear }),
    -1,
    false,
  );
}

function stopShimmer() {
  cancelAnimation(sharedShimmer);
  sharedShimmer.value = 0;
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceSubtle,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.card,
      overflow: 'hidden',
    },
    shimmer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.border,
    },
    skeletonRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      gap: 12,
    },
    skeletonThumb: {
      width: 80,
      height: 80,
      backgroundColor: colors.border,
      borderRadius: radius.sm,
    },
    skeletonLines: {
      flex: 1,
      gap: 10,
      justifyContent: 'center',
    },
    skeletonLine: {
      height: 12,
      backgroundColor: colors.border,
      borderRadius: 3,
      width: '92%',
    },
    skeletonLineShort: {
      width: '55%',
    },
  });

export const SkeletonCard = memo(function SkeletonCard({ height = 120, style }: SkeletonCardProps) {
  const { colors } = useTheme();
  const isFocused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const shouldAnimate = isFocused && !reducedMotion;

  useEffect(() => {
    if (!shouldAnimate) return undefined;
    activeCount += 1;
    if (activeCount === 1) startShimmer();
    return () => {
      activeCount -= 1;
      if (activeCount === 0) stopShimmer();
    };
  }, [shouldAnimate]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sharedShimmer.value, [0, 0.5, 1], [0.15, 0.45, 0.15]),
  }));

  const isCompact = (height ?? 120) < 80;


  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={[styles.card, { height }, style]}>
      {isCompact ? (
        <Animated.View style={[styles.shimmer, shimmerStyle]} />
      ) : (
        <>
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonThumb} />
            <View style={styles.skeletonLines}>
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
            </View>
          </View>
          <Animated.View style={[styles.shimmer, shimmerStyle]} />
        </>
      )}
    </View>
  );
});
