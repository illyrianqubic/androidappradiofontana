import { memo, useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  makeMutable,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius } from '../design-tokens';

type SkeletonCardProps = {
  height?: number;
  style?: ViewStyle;
};

// Single shared shimmer driver — one looping worklet for ALL skeleton instances.
// Reference-counted so it only runs while at least one SkeletonCard is mounted.
const sharedShimmer = makeMutable(0);
let mountCount = 0;

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

export const SkeletonCard = memo(function SkeletonCard({ height = 120, style }: SkeletonCardProps) {
  useEffect(() => {
    mountCount += 1;
    if (mountCount === 1) startShimmer();
    return () => {
      mountCount -= 1;
      if (mountCount === 0) stopShimmer();
    };
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sharedShimmer.value, [0, 0.5, 1], [0.15, 0.45, 0.15]),
  }));

  return (
    <View style={[styles.card, { height }, style]}>
      <Animated.View style={[styles.shimmer, shimmerStyle]} />
    </View>
  );
});

const styles = StyleSheet.create({
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
});
