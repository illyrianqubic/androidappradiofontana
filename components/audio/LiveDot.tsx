import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../../constants/tokens';

type LiveDotProps = {
  size?: number;
};

export function LiveDot({ size = 8 }: LiveDotProps) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    pulse.value = withRepeat(
      withTiming(1, {
        duration: 1800,
        easing: Easing.out(Easing.ease),
      }),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reducedMotion]);

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0 : interpolate(pulse.value, [0, 1], [0.42, 0]),
    transform: [{ scale: reducedMotion ? 1 : interpolate(pulse.value, [0, 1], [1, 2]) }],
  }));

  const rippleSize = size + 8;

  return (
    <View style={[styles.wrapper, { width: rippleSize, height: rippleSize }]}>
      <Animated.View
        style={[
          styles.ripple,
          {
            width: rippleSize,
            height: rippleSize,
            borderRadius: rippleSize / 2,
          },
          rippleStyle,
        ]}
      />
      <View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ripple: {
    position: 'absolute',
    backgroundColor: colors.primary,
  },
  dot: {
    backgroundColor: colors.primary,
  },
});
