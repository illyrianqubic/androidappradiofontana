import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useDrawer } from '../../providers/DrawerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import type { ThemeColors } from '../../providers/ThemeProvider';

export function HamburgerButton() {
  const { isOpen, toggle, progress } = useDrawer();
  const { colors } = useTheme();

  // The icon morph reads the same SharedValue that DrawerProvider drives
  // synchronously on press — zero React-render dependency, zero risk of the
  // icon being out of sync with the panel.

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * 7 },
      { rotate: `${progress.value * 45}deg` },
    ],
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.inkDark, colors.primary]),
  }));

  const midStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));

  const botStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * -7 },
      { rotate: `${progress.value * -45}deg` },
    ],
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.inkDark, colors.primary]),
  }));

  return (
    <Pressable
      // onPressIn fires the moment the finger touches the button (touch-down),
      // ~50–100 ms before onPress would commit the gesture. Combined with the
      // synchronous animation kick in DrawerProvider.toggle(), the slide
      // starts on the same UI-thread frame as the touch event — the user
      // perceives zero latency.
      onPressIn={toggle}
      accessibilityRole="button"
      accessibilityLabel={isOpen ? 'Mbyll menûnë' : 'Hap menûnë'}
      accessibilityState={{ expanded: isOpen }}
      style={({ pressed }) => [styles.button, isOpen && { backgroundColor: colors.redTint }, pressed && styles.buttonPressed]}
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
    backgroundColor: 'transparent',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  line: {
    width: 20,
    height: 2,
    borderRadius: 1,
  },
});
