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
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { appIdentity } from '../../constants/tokens';

// ─── constants ────────────────────────────────────────────────────────────────
const LOGO_SIZE = 116;
const LOGO_RADIUS = 26;

const COLD_START_MIN_SPLASH_MS = 1600;
const COLD_START_MAX_SPLASH_MS = 2600;
const EXIT_DURATION = 220;

type LaunchSplashProps = {
  onComplete: () => void;
  isContentReady?: boolean;
};

// ─── Ripple ───────────────────────────────────────────────────────────────────
function Ripple({ delay, color }: { delay: number; color: string }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.2, 1], [0, 0.22, 0]),
    transform: [{ scale: interpolate(p.value, [0, 1], [1.0, 2.6]) }],
    borderColor: color,
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.ripple, style]}
      pointerEvents="none"
    />
  );
}

// ─── LaunchSplash ─────────────────────────────────────────────────────────────
export function LaunchSplash({ onComplete, isContentReady = false }: LaunchSplashProps) {
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.7);
  const rippleVisible = useSharedValue(0);
  const screenOpacity = useSharedValue(1);

  const exitedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) });
    logoScale.value = withSpring(1, { damping: 13, stiffness: 160, mass: 0.9 });
    rippleVisible.value = withDelay(320, withTiming(1, { duration: 0 }));

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
      cancelAnimation(logoScale);
      cancelAnimation(rippleVisible);
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
    transform: [{ scale: logoScale.value }],
  }));
  const rippleContainerStyle = useAnimatedStyle(() => ({ opacity: rippleVisible.value }));

  return (
    <Animated.View style={[styles.screen, screenStyle]}>
      <View style={styles.logoZone}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.rippleContainer, rippleContainerStyle]}
          pointerEvents="none"
        >
          <Ripple delay={0}    color="#dc2626" />
          <Ripple delay={500}  color="#dc2626" />
          <Ripple delay={1000} color="#dc2626" />
        </Animated.View>

        <Animated.View style={[styles.logoCard, logoStyle]}>
          <Image
            source={appIdentity.logo}
            contentFit="cover"
            style={styles.logo}
            cachePolicy="memory"
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 120,
  },
  logoZone: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rippleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_RADIUS,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  logoCard: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_RADIUS,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});
