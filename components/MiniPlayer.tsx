import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { appIdentity, colors, fonts } from '../design-tokens';
import { useAudio } from '../services/audio';
import { useDrawer } from '../context/DrawerContext';
import { useUI } from '../context/UIContext';
import { EqualizerBars } from './EqualizerBars';

const HIDDEN_ROUTES = ['/rreth-nesh', '/(tabs)/live', '/live'];

type MiniPlayerProps = {
  onOpenPlayer: () => void;
};

// Pulsing glow ring — shown behind play button when actively playing
function GlowRing() {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [pulse, reducedMotion]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0 : interpolate(pulse.value, [0, 1], [0.5, 0]),
    transform: [{ scale: reducedMotion ? 1 : interpolate(pulse.value, [0, 1], [1, 1.8]) }],
  }));

  return <Animated.View style={[StyleSheet.absoluteFillObject, styles.glowRing, ringStyle]} />;
}

export function MiniPlayer({ onOpenPlayer: _onOpenPlayer }: MiniPlayerProps) {
  const insets = useSafeAreaInsets();
  const { isPlaying, isBuffering, isReconnecting, toggle } = useAudio();
  const { isOpen: drawerOpen } = useDrawer();
  const pathname = usePathname();
  const miniPlayerBottom = insets.bottom + 76;

  const isHiddenRoute = HIDDEN_ROUTES.some((r) => pathname === r || pathname.startsWith(r));
  const { miniPlayerHidden } = useUI();
  const shouldHide = drawerOpen || isHiddenRoute || miniPlayerHidden;

  const hideOffset = useSharedValue(0);

  useEffect(() => {
    hideOffset.value = withTiming(shouldHide ? 1 : 0, { duration: 220 });
  }, [shouldHide, hideOffset]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hideOffset.value * 120 }],
    opacity: 1 - hideOffset.value,
  }));

  const isActive = isPlaying || isBuffering || isReconnecting;

  return (
    <Animated.View
      pointerEvents={shouldHide ? 'none' : 'auto'}
      style={[styles.outerShadow, animatedStyle, { bottom: miniPlayerBottom }]}
    >
      <LinearGradient
        colors={['#1e1b4b', '#0f172a', '#18181b']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.outer}
      >
        {/* Subtle inner highlight at top */}
        <View style={styles.topHighlight} />

        {/* Red shimmer sweep — decorative diagonal */}
        <View style={styles.shimmerDiag} />

        <View style={styles.inner}>
          {/* ── Logo ──────────────────────────────────────── */}
          <View style={styles.logoContainer}>
            <View style={styles.logoWrap}>
              <Image source={appIdentity.logo} style={styles.logo} contentFit="cover" />
              {isPlaying ? (
                <View style={styles.eqOverlay}>
                  <EqualizerBars variant="mini" bars={3} playing={isPlaying} color="#fff" />
                </View>
              ) : null}
            </View>
            {/* Live dot */}
            {isPlaying ? <View style={styles.liveDot} /> : null}
          </View>

          {/* ── Text ──────────────────────────────────────── */}
          <View style={styles.textWrap}>
            <Text numberOfLines={1} style={styles.title}>
              Radio Fontana{' '}
              <Text style={styles.titleFreq}>98.8 FM</Text>
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {isReconnecting
                ? 'Po lidhet me stream...'
                : isPlaying
                ? '🔴  LIVE · Duke transmetuar'
                : 'Shtyp për të dëgjuar live'}
            </Text>
          </View>

          {/* ── Play / Pause ──────────────────────────────── */}
          <View style={styles.btnWrap}>
            {isPlaying ? <GlowRing /> : null}
            <Pressable
              onPress={toggle}
              style={({ pressed }) => [
                styles.playButton,
                isActive && styles.playButtonActive,
                pressed && styles.playButtonPressed,
              ]}
            >
              <LinearGradient
                colors={isActive ? [colors.primary, '#9f1239'] : ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.07)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.playButtonGrad}
              >
                <Text style={styles.playButtonIcon}>
                  {isPlaying ? '❙❙' : (isBuffering || isReconnecting) ? '···' : '▶'}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerShadow: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 72,
    borderRadius: 20,
    zIndex: 40,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  outer: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 1,
  },
  shimmerDiag: {
    position: 'absolute',
    top: -30,
    right: 60,
    width: 60,
    height: 130,
    backgroundColor: colors.primary,
    opacity: 0.06,
    transform: [{ rotate: '35deg' }],
    borderRadius: 6,
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 12,
    gap: 12,
  },

  // ── Logo ──────────────────────────────────────────────────
  logoContainer: {
    position: 'relative',
  },
  logoWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  eqOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(185,28,28,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    borderWidth: 1.5,
    borderColor: '#0f172a',
  },

  // ── Text ──────────────────────────────────────────────────
  textWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  title: {
    fontFamily: fonts.uiBold,
    color: '#f8fafc',
    fontSize: 13,
    letterSpacing: -0.1,
  },
  titleFreq: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
  },
  subtitle: {
    fontFamily: fonts.uiRegular,
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    letterSpacing: 0.1,
  },

  // ── Play button ───────────────────────────────────────────
  btnWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    borderRadius: 24,
    backgroundColor: colors.primary,
  },
  playButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  playButtonActive: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  playButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.91 }],
  },
  playButtonGrad: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 14,
    fontFamily: fonts.uiBold,
    marginLeft: 1,
  },
});
