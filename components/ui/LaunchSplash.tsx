import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { appSettings } from '../../services/storage';

// ─── constants ────────────────────────────────────────────────────────────────
// Must stay in sync with the expo-splash-screen plugin imageWidth in app.json.
const LOGO_SIZE = 280;

function getLaunchLogo() {
  const isDark = appSettings.getItem('app_theme') !== 'light';
  return isDark
    ? require('../../assets/images/darklogortvfontana.png')
    : require('../../assets/images/applogortvfontana.png');
}

function getLaunchBackground() {
  const isDark = appSettings.getItem('app_theme') !== 'light';
  return isDark ? '#0B1220' : '#FFFFFF';
}

const COLD_START_MIN_SPLASH_MS = 3200;
const COLD_START_MAX_SPLASH_MS = 4200;
const EXIT_DURATION = 220;

type LaunchSplashProps = {
  onComplete: () => void;
  isContentReady?: boolean;
};

// ─── LaunchSplash ─────────────────────────────────────────────────────────────
export function LaunchSplash({ onComplete, isContentReady = false }: LaunchSplashProps) {
  const screenOpacity = useSharedValue(1);

  const exitedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
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

  return (
    <Animated.View style={[styles.screen, { backgroundColor: getLaunchBackground() }, screenStyle]}>
      <View style={styles.logoWrap} pointerEvents="none">
        <Image
          source={getLaunchLogo()}
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
