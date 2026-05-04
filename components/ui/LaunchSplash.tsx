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
// NOTE: logo intentionally has NO entrance animation — it must be visible
// the instant the splash mounts. Only the progress bar / shimmer animate.
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

const COLD_START_MIN_SPLASH_MS = 3200;
const COLD_START_MAX_SPLASH_MS = 4200;
const EXIT_DURATION = 220;

type LaunchSplashProps = {
  onComplete: () => void;
  isContentReady?: boolean;
};

// ─── LaunchSplash ─────────────────────────────────────────────────────────────
export function LaunchSplash({ onComplete, isContentReady = false }: LaunchSplashProps) {
  const progress = useSharedValue(0);
  const shimmerX = useSharedValue(-SHIMMER_WIDTH);
  const screenOpacity = useSharedValue(1);

  const exitedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
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
  const progressFillStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [0, BAR_WIDTH]),
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  return (
    <Animated.View style={[styles.screen, screenStyle]}>
      {/* Logo is absolutely centered to match the native Android splash
          position exactly (expo-splash-screen with imageWidth=184). This
          prevents the logo from "jumping" when the native splash hands
          off to the JS splash. */}
      <View style={styles.logoWrap} pointerEvents="none">
        <Image
          source={appIdentity.logo}
          contentFit="contain"
          style={styles.logo}
          cachePolicy="memory"
        />
      </View>

      {/* Progress bar sits a short distance below the logo. Absolutely
          positioned so the logo's center remains exactly at screen-center. */}
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
    // Dead-center on screen — matches native splash position exactly.
    position: 'absolute',
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
    // Absolutely positioned just below the centered logo so the logo's
    // center stays at exact screen-center (no shift from a flex stack).
    position: 'absolute',
    top: '50%',
    marginTop: LOGO_SIZE / 2 + BAR_GAP,
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
