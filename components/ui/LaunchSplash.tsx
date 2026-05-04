import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { appIdentity } from '../../constants/tokens';

// ─── constants ────────────────────────────────────────────────────────────────
const LOGO_SIZE = 132;
const PRIMARY = '#dc2626';

const COLD_START_MIN_SPLASH_MS = 1600;
const COLD_START_MAX_SPLASH_MS = 2600;
const EXIT_DURATION = 220;

type LaunchSplashProps = {
  onComplete: () => void;
  isContentReady?: boolean;
};

// ─── LaunchSplash ─────────────────────────────────────────────────────────────
export function LaunchSplash({ onComplete, isContentReady = false }: LaunchSplashProps) {
  const logoOpacity = useSharedValue(0);
  const progress = useSharedValue(0);
  const screenOpacity = useSharedValue(1);

  const exitedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
    // Logo fades in — calm, no scale, no spring, no overshoot.
    logoOpacity.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });

    // Red progress bar fills smoothly across the minimum splash window.
    progress.value = withTiming(1, {
      duration: COLD_START_MIN_SPLASH_MS,
      easing: Easing.inOut(Easing.cubic),
    });

    // Fallback exit if isContentReady never flips true.
    screenOpacity.value = withDelay(
      Math.max(0, COLD_START_MAX_SPLASH_MS - EXIT_DURATION),
      withTiming(0, { duration: EXIT_DURATION, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished && !exitedRef.current) {
          exitedRef.current = true;
          runOnJS(onComplete)();
        }
      }),
    );

    return () => {
      cancelAnimation(logoOpacity);
      cancelAnimation(progress);
      cancelAnimation(screenOpacity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exit when content is ready and minimum window elapsed.
  useEffect(() => {
    if (!isContentReady || exitedRef.current) return;
    const elapsed = Date.now() - mountedAtRef.current;
    const wait = Math.max(0, COLD_START_MIN_SPLASH_MS - elapsed);
    const t = setTimeout(() => {
      if (exitedRef.current) return;
      cancelAnimation(screenOpacity);
      screenOpacity.value = withTiming(
        0,
        { duration: EXIT_DURATION, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished && !exitedRef.current) {
            exitedRef.current = true;
            runOnJS(onComplete)();
          }
        },
      );
    }, wait);
    return () => clearTimeout(t);
  }, [isContentReady, screenOpacity, onComplete]);

  const screenStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.value }));
  const progressStyle = useAnimatedStyle(() => ({
    width: `${interpolate(progress.value, [0, 1], [0, 100])}%`,
  }));

  return (
    <Animated.View style={[styles.screen, screenStyle]}>
      {/* Logo sits flush on the white background — no card, no shadow,
         no border. contentFit="contain" keeps the image inside its
         bounds with the original aspect ratio. */}
      <Animated.View style={[styles.logoWrap, logoStyle]}>
        <Image
          source={appIdentity.logo}
          contentFit="contain"
          style={styles.logo}
          cachePolicy="memory"
        />
      </Animated.View>

      {/* Slim red progress bar pinned to the bottom — fills over the
         minimum splash window so the user always sees motion. */}
      <View style={styles.progressTrack} pointerEvents="none">
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>
    </Animated.View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 120,
  },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  progressTrack: {
    position: 'absolute',
    left: 56,
    right: 56,
    bottom: 72,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: PRIMARY,
    borderRadius: 1,
  },
});
