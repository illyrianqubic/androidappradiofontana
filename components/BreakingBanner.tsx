import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, fonts, spacing } from '../design-tokens';

type BreakingBannerProps = {
  title: string;
  visible: boolean;
  onDismiss: () => void;
};

export function BreakingBanner({ title, visible, onDismiss }: BreakingBannerProps) {
  const translateY = useSharedValue(-110);
  const progress = useSharedValue(1);

  useEffect(() => {
    if (!visible) {
      translateY.value = withTiming(-110, {
        duration: 180,
      });
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);

    translateY.value = withTiming(0, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });

    progress.value = 1;
    progress.value = withTiming(
      0,
      {
        duration: 8000,
        easing: Easing.linear,
      },
      (finished) => {
        if (finished) {
          runOnJS(onDismiss)();
        }
      },
    );
  }, [onDismiss, progress, translateY, visible]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.max(progress.value, 0) * 100}%`,
  }));

  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[styles.wrapper, containerStyle]}>
      <View style={styles.container}>
        <View style={styles.row}>
          <Text style={styles.badge}>LAJM I FUNDIT</Text>
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.closeText}>Mbyll</Text>
          </Pressable>
        </View>

        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>

        <Animated.View style={[styles.progress, progressStyle]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    zIndex: 80,
  },
  container: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  badge: {
    color: colors.surface,
    fontSize: 11,
    fontFamily: fonts.uiBold,
    letterSpacing: 0.6,
  },
  closeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  closeText: {
    color: colors.surface,
    fontFamily: fonts.uiMedium,
    fontSize: 12,
  },
  title: {
    color: colors.surface,
    fontFamily: fonts.uiBold,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  progress: {
    height: 2,
    borderRadius: 99,
    backgroundColor: colors.surface,
  },
});
