import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { appIdentity, fonts } from '../../constants/tokens';

// ─── design constants ─────────────────────────────────────────────────────────
const LOGO_SIZE = 108;
const GLOW_SIZE = LOGO_SIZE + 40;
const PRIMARY = '#dc2626';
const NAVY = '#0f172a';
const NAVY_DEEP = '#070b16';

// Keep the branded entrance on screen long enough for the first route to
// settle behind it. Does not wait on network data.
const COLD_START_MIN_SPLASH_MS = 1800;
const COLD_START_MAX_SPLASH_MS = 2800;
const EXIT_DURATION = 240;

type LaunchSplashProps = {
  onComplete: () => void;
  isContentReady?: boolean;
};

// ─── LaunchSplash ─────────────────────────────────────────────────────────────
export function LaunchSplash({ onComplete, isContentReady = false }: LaunchSplashProps) {
  // Logo entrance
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.92);

  // Soft glow halo pulse
  const glow = useSharedValue(0);

  // Wordmark + frequency entrance (staggered after logo)
  const wordmarkOpacity = useSharedValue(0);
  const wordmarkY = useSharedValue(8);
  const freqOpacity = useSharedValue(0);

  // Bottom progress bar
  const progress = useSharedValue(0);

  // Screen fade-out
  const screenOpacity = useSharedValue(1);

  const exitedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
    // 1. Logo fades + scales in
    logoOpacity.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) });
    logoScale.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.4)) });

    // 2. Glow halo gently breathes
    glow.value = withDelay(
      300,
      withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );

    // 3. Wordmark slides up + fades in
    wordmarkOpacity.value = withDelay(280, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    wordmarkY.value = withDelay(280, withTiming(0, { duration: 460, easing: Easing.out(Easing.cubic) }));

    // 4. Frequency badge fades in
    freqOpacity.value = withDelay(520, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));

    // 5. Progress bar fills over the min splash window
    progress.value = withTiming(1, {
      duration: COLD_START_MIN_SPLASH_MS,
      easing: Easing.inOut(Easing.cubic),
    });

    // 6. Fallback exit if content never reports ready
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
      cancelAnimation(glow);
      cancelAnimation(wordmarkOpacity);
      cancelAnimation(wordmarkY);
      cancelAnimation(freqOpacity);
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

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.35, 0.75]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.94, 1.08]) }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkY.value }],
  }));

  const freqStyle = useAnimatedStyle(() => ({ opacity: freqOpacity.value }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${interpolate(progress.value, [0, 1], [0, 100])}%`,
  }));

  return (
    <Animated.View style={[styles.screen, screenStyle]}>
      {/* Background gradient: deep navy → slightly lighter navy at the bottom */}
      <LinearGradient
        colors={[NAVY_DEEP, NAVY, NAVY_DEEP]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Brand stack — perfectly centered */}
      <View style={styles.brandStack}>
        {/* Logo with soft red glow halo */}
        <View style={styles.logoZone}>
          <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" />
          <Animated.View style={[styles.logoCard, logoStyle]}>
            <Image
              source={appIdentity.logo}
              contentFit="cover"
              style={styles.logo}
              cachePolicy="memory"
            />
          </Animated.View>
        </View>

        {/* Wordmark */}
        <Animated.View style={[styles.wordmarkWrap, wordmarkStyle]}>
          <Text style={styles.wordmark} allowFontScaling={false}>RADIO FONTANA</Text>
        </Animated.View>

        {/* Frequency badge */}
        <Animated.View style={[styles.freqWrap, freqStyle]}>
          <View style={styles.freqDot} />
          <Text style={styles.freqText} allowFontScaling={false}>98.8 FM · ISTOG</Text>
        </Animated.View>
      </View>

      {/* Slim progress bar pinned to the bottom */}
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
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 120,
  },
  brandStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoZone: {
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  // Soft red halo behind the logo — pure shadow, no border, no extra geometry
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: PRIMARY,
    // Big soft shadow does the actual glow on Android (elevation) + iOS (shadow*).
    shadowColor: PRIMARY,
    shadowOpacity: 0.85,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 },
    elevation: 24,
    opacity: 0.55,
  },
  logoCard: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    // Subtle outline so the logo edge reads cleanly against the glow
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  wordmarkWrap: {
    alignItems: 'center',
  },
  wordmark: {
    color: '#ffffff',
    fontFamily: fonts.uiBold,
    fontSize: 22,
    letterSpacing: 4.5,
    textAlign: 'center',
  },
  freqWrap: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  freqDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PRIMARY,
  },
  freqText: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    letterSpacing: 2.2,
  },
  // Hairline progress track at the bottom of the screen
  progressTrack: {
    position: 'absolute',
    left: 48,
    right: 48,
    bottom: 64,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: PRIMARY,
    borderRadius: 1,
  },
});
