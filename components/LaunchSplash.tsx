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
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { appIdentity } from '../design-tokens';

// ─── constants ────────────────────────────────────────────────────────────────
const LOGO_SIZE = 124;
const RING_BASE = LOGO_SIZE + 6;       // ring diameter before scale animation
const SHIMMER_W = Math.round(LOGO_SIZE * 0.52);
const PRIMARY = '#dc2626';

// AUDIT FIX P1.1: hard-cap max splash time to 600 ms. Exit the moment the
// caller signals content is ready (home-hero hydrated from MMKV cache OR
// network resolved), or fall back to the 600 ms ceiling — whichever happens
// first. Removed the previous 1300 ms hardcoded EXIT_DELAY which alone burned
// up to 900 ms of perceived cold-start time.
const MAX_VISIBLE_MS = 600;
const MIN_VISIBLE_MS = 280; // never flash; let the logo entrance complete
const EXIT_DURATION = 200;

// ─── types ────────────────────────────────────────────────────────────────────
type LaunchSplashProps = {
  onComplete: () => void;
  // True when first home query has data (from cache or network). When this
  // flips true past MIN_VISIBLE_MS we exit immediately; otherwise we exit at
  // MAX_VISIBLE_MS regardless.
  isContentReady?: boolean;
};

// ─── PulseRing ────────────────────────────────────────────────────────────────
// A single expanding ring that fades in briefly then dissolves outward.
function PulseRing({ delay }: { delay: number }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.10, 0.60, 1], [0, 0.46, 0.07, 0]),
    transform: [{ scale: interpolate(p.value, [0, 1], [0.86, 2.35]) }],
  }));

  return <Animated.View style={[styles.ring, style]} />;
}

// ─── LoadingDot ───────────────────────────────────────────────────────────────
// One of three dots in the pulsing "loading" row below the logo.
function LoadingDot({ delay }: { delay: number }) {
  const a = useSharedValue(0);

  useEffect(() => {
    // Each dot runs the same 1000 ms cycle, just offset by `delay` ms.
    a.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }),
          withTiming(0, { duration: 480 }), // hold at rest — keeps cycle = 1000 ms
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(a);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(a.value, [0, 1], [0.38, 1]) }],
    opacity: interpolate(a.value, [0, 1], [0.25, 1]),
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

// ─── LaunchSplash ─────────────────────────────────────────────────────────────
export function LaunchSplash({ onComplete, isContentReady = false }: LaunchSplashProps) {
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);
  const screenOpacity = useSharedValue(1);
  const shimmerX = useSharedValue(-(LOGO_SIZE + SHIMMER_W));
  const exitedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
    // 1 — logo entrance: fade in + spring scale 0.8 → 1 (slight overshoot)
    logoOpacity.value = withTiming(1, {
      duration: 580,
      easing: Easing.out(Easing.cubic),
    });
    logoScale.value = withSpring(1, { damping: 13, stiffness: 170, mass: 0.85 });

    // 2 — shimmer: sweep right → snap back → pause → repeat indefinitely
    //    starts 560 ms in so it runs over the already-visible logo
    shimmerX.value = withDelay(
      560,
      withRepeat(
        withSequence(
          withTiming(LOGO_SIZE + SHIMMER_W, {
            duration: 470,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(-(LOGO_SIZE + SHIMMER_W), { duration: 0 }), // instant snap back
          withTiming(-(LOGO_SIZE + SHIMMER_W), { duration: 340 }), // pause before next
        ),
        -1,
        false,
      ),
    );

    // 3 — exit: fade entire screen to white, then notify parent. Now
    // capped at MAX_VISIBLE_MS as a fallback ceiling. The early-exit path
    // (driven by isContentReady) lives in the second effect below.
    screenOpacity.value = withDelay(
      MAX_VISIBLE_MS,
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
      cancelAnimation(screenOpacity);
      cancelAnimation(shimmerX);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AUDIT FIX P1.1: early exit the moment content is ready (after the
  // minimum visible window so the entrance doesn't pop). Cancels the
  // scheduled fallback fade and starts the exit immediately.
  useEffect(() => {
    if (!isContentReady || exitedRef.current) return;
    const elapsed = Date.now() - mountedAtRef.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
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

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  return (
    <Animated.View style={[styles.screen, screenStyle]}>
      {/*
       * Center block — fixed-size container so the absolute rings stay
       * correctly centered relative to the logo.
       */}
      <View style={styles.center}>
        {/* Three staggered pulse rings behind the logo */}
        <PulseRing delay={220} />
        <PulseRing delay={760} />
        <PulseRing delay={1300} />

        {/*
         * logoShadow: carries elevation/shadow WITHOUT overflow:hidden so the
         * drop shadow isn't clipped on Android.
         * logoWrap: overflow:hidden clips the shimmer to the logo bounds.
         */}
        <Animated.View style={[styles.logoShadow, logoStyle]}>
          <View style={styles.logoWrap}>
            <Image
              source={appIdentity.logo}
              contentFit="cover"
              style={styles.logo}
              cachePolicy="memory"
            />

            {/* Shimmer band — translates left→right, clipped by logoWrap */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Animated.View style={[styles.shimmerBand, shimmerStyle]}>
                <LinearGradient
                  colors={[
                    'transparent',
                    'rgba(255,255,255,0.20)',
                    'rgba(255,255,255,0.52)',
                    'rgba(255,255,255,0.20)',
                    'transparent',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Three pulsing dots below the logo */}
      <View style={styles.dotsRow}>
        <LoadingDot delay={0} />
        <LoadingDot delay={167} />
        <LoadingDot delay={334} />
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
  // Fixed-size box that all rings + logo are positioned within.
  center: {
    width: RING_BASE * 2.7,
    height: RING_BASE * 2.7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_BASE,
    height: RING_BASE,
    borderRadius: RING_BASE / 2,
    borderWidth: 1.5,
    borderColor: PRIMARY,
  },
  // Outer shadow wrapper — no overflow:hidden so shadow is visible on Android
  logoShadow: {
    borderRadius: 28,
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.13,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  // Inner clip wrapper — hides shimmer outside the logo bounds
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: 28,
    overflow: 'hidden',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  // The moving shimmer rectangle — translateX drives it across the logo
  shimmerBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SHIMMER_W,
  },
  dotsRow: {
    flexDirection: 'row',
    marginTop: 76,
    gap: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: PRIMARY,
  },
});