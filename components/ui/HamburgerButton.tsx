import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useDrawer } from '../../providers/DrawerProvider';
import { colors } from '../../constants/tokens';

export function HamburgerButton() {
  const { isOpen, toggle } = useDrawer();

  // useSharedValue + useEffect instead of useDerivedValue so the animation
  // only starts when isOpen actually changes — not on every component
  // re-render. useDerivedValue re-registers its worklet on every render
  // (including frozen-tab unfreezes with freezeOnBlur:true), which caused
  // spurious mid-animation restarts and "opens halfway" on Galaxy A-series.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(isOpen ? 1 : 0, { duration: 200 });
  }, [isOpen, progress]);

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * 7 },
      { rotate: `${progress.value * 45}deg` },
    ],
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#111827', colors.primary]),
  }));

  const midStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));

  const botStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * -7 },
      { rotate: `${progress.value * -45}deg` },
    ],
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#111827', colors.primary]),
  }));

  return (
    <Pressable
      onPress={toggle}
      style={({ pressed }) => [styles.button, isOpen && styles.buttonActive, pressed && styles.buttonPressed]}
      hitSlop={8}
    >
      <Animated.View style={[styles.line, topStyle]} />
      <Animated.View style={[styles.line, midStyle]} />
      <Animated.View style={[styles.line, botStyle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
  },
  buttonActive: {
    backgroundColor: '#fef2f2',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  line: {
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#111827',
  },
});
