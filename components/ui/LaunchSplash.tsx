import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../providers/ThemeProvider';

// ─── constants ────────────────────────────────────────────────────────────────
// Must stay in sync with the expo-splash-screen plugin imageWidth in app.json.
const LOGO_SIZE = 250;

const COLD_START_MIN_SPLASH_MS = 3200;
const COLD_START_MAX_SPLASH_MS = 4200;
const LOGO_FADE_DURATION = 200;
const STAGE_2_DELAY = 120;
const BG_COLOR_DURATION = 250;
const OVERLAY_FADE_DURATION = 300;
const EXIT_FALLBACK_MS = 800;

type LaunchSplashProps = {
  onComplete: () => void;
  onExitStart?: () => void;
  isContentReady?: boolean;
};

// ─── LaunchSplash ─────────────────────────────────────────────────────────────
export function LaunchSplash({ onComplete, onExitStart, isContentReady = false }: LaunchSplashProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  const logoOpacity = useSharedValue(1);
  const bgColorProgress = useSharedValue(0);
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
      logoOpacity.value = 0;
      screenOpacity.value = 0;
      finishExit();
      return;
    }

    // Stage 1 — logo fades out first (fast)
    cancelAnimation(logoOpacity);
    logoOpacity.value = withTiming(0, {
      duration: LOGO_FADE_DURATION,
      easing: Easing.out(Easing.quad),
    });

    // Stage 2 — background dissolves toward app's screen colour while overlay fades
    cancelAnimation(bgColorProgress);
    bgColorProgress.value = withDelay(
      STAGE_2_DELAY,
      withTiming(1, {
        duration: BG_COLOR_DURATION,
        easing: Easing.out(Easing.quad),
      }),
    );

    cancelAnimation(screenOpacity);
    screenOpacity.value = withDelay(
      STAGE_2_DELAY,
      withTiming(
        0,
        {
          duration: OVERLAY_FADE_DURATION,
          easing: Easing.out(Easing.quad),
        },
        (finished) => {
          'worklet';
          if (finished) {
            runOnJS(finishExit)();
          }
        },
      ),
    );

    fallbackTimerRef.current = setTimeout(() => {
      if (!exitedRef.current) {
        cancelAnimation(logoOpacity);
        cancelAnimation(bgColorProgress);
        cancelAnimation(screenOpacity);
        logoOpacity.value = 0;
        bgColorProgress.value = 1;
        screenOpacity.value = 0;
        finishExit();
      }
    }, EXIT_FALLBACK_MS);
  }, [finishExit, onExitStart, reducedMotion, logoOpacity, bgColorProgress, screenOpacity]);

  useEffect(() => {
    // Fallback exit if isContentReady never flips true.
    const t = setTimeout(() => {
      runExit();
    }, Math.max(0, COLD_START_MAX_SPLASH_MS - (STAGE_2_DELAY + OVERLAY_FADE_DURATION)));

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

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
    backgroundColor: interpolateColor(
      bgColorProgress.value,
      [0, 1],
      ['#0B1220', colors.bgScreen],
    ),
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));

  return (
    <Animated.View style={[styles.screen, screenStyle]} pointerEvents="none">
      <View style={styles.logoWrap} pointerEvents="none">
        <Animated.View style={logoStyle}>
          <Image
            source={require('../../assets/images/darklogortvfontana.png')}
            contentFit="contain"
            style={styles.logo}
            cachePolicy="memory"
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
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
