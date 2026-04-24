import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius } from '../design-tokens';

type SkeletonCardProps = {
  height?: number;
  style?: ViewStyle;
};

export function SkeletonCard({ height = 120, style }: SkeletonCardProps) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, {
        duration: 1200,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.15, 0.45, 0.15]),
  }));

  return (
    <View style={[styles.card, { height }, style]}>
      <Animated.View style={[styles.shimmer, shimmerStyle]} />
    </View>
  );
}

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
