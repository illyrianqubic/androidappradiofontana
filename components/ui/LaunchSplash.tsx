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
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { appIdentity } from '../../constants/tokens';

// ─── constants ────────────────────────────────────────────────────────────────
const LOGO_SIZE = 184;
const PRIMARY = '#dc2626';
const PRIMARY_SOFT = '#ef4444';

// Progress bar geometry — sits directly under the logo
const BAR_WIDTH = 168;
const BAR_HEIGHT = 4;
const BAR_GAP = 28;
// A short shimmer band slides across the filled portion repeatedly
const SHIMMER_WIDTH = 60;

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
  const logoTranslate = useSharedValue(6);
  const progress = useSharedValue(0);
  const shimmerX = useSharedValue(-SHIMMER_WIDTH);
  const screenOpacity = useSharedValue(1);

  const exitedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
    // Logo: gentle fade-up — calm, no spring overshoot.
    logoOpacity.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) });
    logoTranslate.value = withTiming(0, { duration: 460, easing: Easing.out(Easing.cubic) });

    // Progress bar fills smoothly across the minimum splash window.
    progress.value = withDelay(
      120,
      withTiming(1, {
        duration: COLD_START_MIN_SPLASH_MS - 120,
        easing: Easing.inOut(Easing.cubic),
      }),
    );

    // Shimmer band slides across the bar continuously — pure UI-thread work.
    shimmerX.value = withDelay(
      200,
      withRepeat(
        withTiming(BAR_WIDTH, {
          duration: 1200,
          easing: Easing.inOut(Easing.cubic),
        }),
        -1,
        false,
      ),
    );

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
      cancelAnimation(logoTranslate);
      cancelAnimation(progress);
      cancelAnimation(shimmerX);
      cancelAnimation(screenOpacity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ translateY: logoTranslate.value }],
  }));
  const progressFillStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [0, BAR_WIDTH]),
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  return (
    <Animated.View style={[styles.screen, screenStyle]}>
      <View style={styles.stack}>
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <Image
            source={appIdentity.logo}
            contentFit="contain"
            style={styles.logo}
            cachePolicy="memory"
          />
        </Animated.View>

        {/* Animated progress bar — fills with a moving shimmer highlight */}
        <View style={styles.progressTrack} pointerEvents="none">
          <Animated.View style={[styles.progressFill, progressFillStyle]}>
            <LinearGradient
              colors={[PRIMARY, PRIMARY_SOFT, PRIMARY]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Bright shimmer band sliding across the filled portion */}
            <Animated.View style={[styles.shimmer, shimmerStyle]}>
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0)',
                  'rgba(255,255,255,0.55)',
                  'rgba(255,255,255,0)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </Animated.View>
        </View>
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
  stack: {
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: BAR_GAP,
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: 'rgba(15,23,42,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: BAR_HEIGHT / 2,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SHIMMER_WIDTH,
  },
});
