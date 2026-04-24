import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appIdentity, colors, elevation, fonts, motion, radius, spacing } from '../design-tokens';
import { useAudio } from '../services/audio';
import { EqualizerBars } from './EqualizerBars';

type MiniPlayerProps = {
  onOpenPlayer: () => void;
};

export function MiniPlayer({ onOpenPlayer }: MiniPlayerProps) {
  const insets = useSafeAreaInsets();
  const { isPlaying, isBuffering, isReconnecting, toggle } = useAudio();
  const miniPlayerBottom = insets.bottom + 76;

  const translateY = useSharedValue(0);

  const openPlayer = useCallback(() => {
    onOpenPlayer();
  }, [onOpenPlayer]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY < 0) {
        translateY.value = event.translationY * 0.35;
      }
    })
    .onEnd((event) => {
      const shouldOpen = event.translationY < -30 || event.velocityY < -520;
      if (shouldOpen) {
        runOnJS(openPlayer)();
      }

      translateY.value = withSpring(0, motion.spring);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.outer, animatedStyle, { bottom: miniPlayerBottom }]}>
        <Pressable style={styles.inner} onPress={openPlayer}>
          <View style={styles.leftWrap}>
            <Image source={appIdentity.logo} style={styles.logo} contentFit="cover" />
            {isPlaying ? <EqualizerBars variant="mini" bars={3} playing={isPlaying} color={colors.primary} /> : null}
          </View>

          <View style={styles.textWrap}>
            <Text numberOfLines={1} style={styles.title}>
              Radio Fontana 98.8 FM
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {isReconnecting ? 'Po lidhet me stream...' : appIdentity.location}
            </Text>
          </View>

          <Pressable
            onPress={toggle}
            style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
          >
            <Text style={styles.playButtonLabel}>
              {isBuffering || isReconnecting ? '...' : isPlaying ? 'II' : '▶'}
            </Text>
          </Pressable>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...elevation.floating,
    zIndex: 40,
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  leftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
  },
  textWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.uiBold,
    color: colors.text,
    fontSize: 15,
  },
  subtitle: {
    marginTop: 1,
    fontFamily: fonts.uiRegular,
    color: colors.textMuted,
    fontSize: 12,
    flexShrink: 1,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginLeft: 2,
  },
  playButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  playButtonLabel: {
    color: colors.surface,
    fontSize: 14,
    lineHeight: 14,
    fontFamily: fonts.uiBold,
  },
});
