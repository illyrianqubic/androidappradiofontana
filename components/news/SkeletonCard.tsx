import { memo, useEffect } from 'react';
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
import { colors, radius } from '../../constants/tokens';

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

export const SkeletonCard = memo(function SkeletonCard({ height = 120, style }: SkeletonCardProps) {
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
