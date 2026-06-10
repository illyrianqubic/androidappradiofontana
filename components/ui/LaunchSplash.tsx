import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// ─── constants ────────────────────────────────────────────────────────────────
// Must stay in sync with the expo-splash-screen plugin imageWidth in app.json.
const LOGO_SIZE = 250;

const COLD_START_MIN_SPLASH_MS = 3200;
const COLD_START_MAX_SPLASH_MS = 4200;
const EXIT_DURATION = 400;
const EXIT_FALLBACK_MS = 800;

type LaunchSplashProps = {
  onComplete: () => void;
  onExitStart?: () => void;
  isContentReady?: boolean;
};

// ─── LaunchSplash ─────────────────────────────────────────────────────────────
export function LaunchSplash({ onComplete, onExitStart, isContentReady = false }: LaunchSplashProps) {
  const reducedMotion = useReducedMotion();
  const screenOpacity = useSharedValue(1);

  const exitedRef = useRef(false);
  const exitStartedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishExit = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    runOnJS(onComplete)();
  }, [onComplete]);

  const runExit = useCallback(() => {
    if (exitStartedRef.current) return;
    exitStartedRef.current = true;

    if (onExitStart) {
      runOnJS(onExitStart)();
    }

    if (reducedMotion) {
      screenOpacity.value = 0;
      finishExit();
      return;
    }

    cancelAnimation(screenOpacity);
    screenOpacity.value = withTiming(
      0,
      { duration: EXIT_DURATION, easing: Easing.out(Easing.quad) },
      (finished) => {
        'worklet';
        if (finished) {
          runOnJS(finishExit)();
        }
      },
    );

    fallbackTimerRef.current = setTimeout(() => {
      if (!exitedRef.current) {
        cancelAnimation(screenOpacity);
        screenOpacity.value = 0;
        finishExit();
      }
    }, EXIT_FALLBACK_MS);
  }, [finishExit, onExitStart, reducedMotion, screenOpacity]);

  useEffect(() => {
    // Fallback exit if isContentReady never flips true.
    const t = setTimeout(() => {
      runExit();
    }, Math.max(0, COLD_START_MAX_SPLASH_MS - EXIT_DURATION));

    return () => {
      clearTimeout(t);
    };
  }, [runExit]);

  useEffect(() => {
    if (!isContentReady || exitedRef.current) return;
    const elapsed = Date.now() - mountedAtRef.current;
    const wait = Math.max(0, COLD_START_MIN_SPLASH_MS - elapsed);
    const t = setTimeout(() => {
      runExit();
    }, wait);
    return () => clearTimeout(t);
  }, [isContentReady, runExit]);

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  const screenStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));

  return (
    <Animated.View style={[styles.screen, screenStyle]}>
      <View style={styles.logoWrap} pointerEvents="none">
        <Image
          source={require('../../assets/images/darklogortvfontana.png')}
          contentFit="contain"
          style={styles.logo}
          cachePolicy="memory"
        />
      </View>
    </Animated.View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 120,
  },
  logoWrap: {
    // Dead-center on screen — the padded asset shifts the visual logo up.
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
});
