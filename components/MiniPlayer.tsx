import { memo, useEffect, useMemo, useState } from 'react';
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
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appIdentity, colors, fonts } from '../design-tokens';
import { s } from '../lib/responsive';
import { useAudioActions, useAudioState } from '../services/audio';
import { useDrawer } from '../context/DrawerContext';
import { EqualizerBars } from './EqualizerBars';

// MiniPlayer hides on these routes automatically — no context state update needed.
// '/news/' (with trailing slash) matches any /news/<slug> article path via startsWith,
// while keeping the /news index visible.
const HIDDEN_ROUTES = ['/rreth-nesh', '/(tabs)/live', '/live', '/news/'];

type MiniPlayerProps = {
  onOpenPlayer: () => void;
  forceHidden: boolean;
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

// C-A5: route-derived visibility computed in a tiny outer gate so usePathname
// changes don't re-render the audio-driven body. The gate component is the
// only one re-rendered on navigation; the inner MiniPlayer is React.memo'd
// and only re-renders when audio state changes. Crucially the inner
// MiniPlayer stays MOUNTED across navigation — hidden via opacity/transform
// only — so its worklets, gradient shaders and image cache binding survive
// every article open/close round trip. Previously a `return null` here tore
// down 5 worklets, 3 LinearGradient shader compiles and an image binding on
// every navigation — ~25 ms reconcile cost per article round-trip.
export function MiniPlayerVisibilityGate({ onOpenPlayer }: { onOpenPlayer: () => void }) {
  const pathname = usePathname();
  const forceHidden =
    pathname === '/player' ||
    HIDDEN_ROUTES.some((r) => pathname === r || pathname.startsWith(r));
  return <MiniPlayer onOpenPlayer={onOpenPlayer} forceHidden={forceHidden} />;
}

function MiniPlayerInner({ onOpenPlayer, forceHidden }: MiniPlayerProps) {
  const insets = useSafeAreaInsets();
  const { isPlaying, isBuffering, isReconnecting } = useAudioState();
  const { toggle } = useAudioActions();
  const { isOpen: drawerOpen } = useDrawer();
  const miniPlayerBottom = insets.bottom + s(76);

  // H-B3: UIContext was dead code (hideMiniPlayer/showMiniPlayer never
  // called anywhere) and forced spurious re-renders here on every root
  // re-render. Removed entirely — visibility is now driven only by route
  // (forceHidden) and drawer state.
  const shouldHide = drawerOpen || forceHidden;

  const hideOffset = useSharedValue(0);

  useEffect(() => {
    hideOffset.value = withTiming(shouldHide ? 1 : 0, { duration: 220 });
  }, [shouldHide, hideOffset]);

  // R-5 / R-6: after the slide-out animation completes, also apply
  // display: 'none' so the View is removed from layout AND stops GPU
  // compositing entirely. Crucially the worklets, gradient shaders and
  // Image binding stay MOUNTED \u2014 only the layout/draw pass is skipped.
  // When shouldHide flips back to false we drop display:'none' immediately
  // so the slide-in animation has something to animate against.
  const [layoutHidden, setLayoutHidden] = useState(false);
  useEffect(() => {
    if (shouldHide) {
      const t = setTimeout(() => setLayoutHidden(true), 240);
      return () => clearTimeout(t);
    }
    setLayoutHidden(false);
  }, [shouldHide]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hideOffset.value * 120 }],
    opacity: 1 - hideOffset.value,
  }));

  const isActive = isPlaying || isBuffering || isReconnecting;

  // H15: stable bottom-position style so prop array identity stays steady.
  const positionStyle = useMemo(
    () => ({ bottom: miniPlayerBottom }),
    [miniPlayerBottom],
  );

  const layoutHiddenStyle = layoutHidden ? styles.layoutHidden : null;

  return (
    <Animated.View
      pointerEvents={shouldHide ? 'none' : 'auto'}
      style={[styles.outerShadow, animatedStyle, positionStyle, layoutHiddenStyle]}
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
          {/* ── Logo + Text (tap to expand) ──────────────── */}
          <Pressable
            onPress={onOpenPlayer}
            style={styles.infoArea}
            hitSlop={4}
          >
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
          </Pressable>

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

// memo: only re-render when onOpenPlayer reference or forceHidden flips,
// which is rare. Audio state subscriptions inside still drive ticks normally.
export const MiniPlayer = memo(MiniPlayerInner);

const styles = StyleSheet.create({
  // R-5/R-6: applied AFTER the slide-out animation completes; removes the
  // view from layout and stops GPU compositing without unmounting children.
  layoutHidden: { display: 'none' },
  outerShadow: {
    position: 'absolute',
    left: s(10),
    right: s(10),
    height: s(72),
    borderRadius: s(20),
    zIndex: 40,
    // H14: lighter shadow — elevation 18 + 28px shadowRadius forces Mali-G52
    // to redraw a large blur every frame the MiniPlayer is on screen.
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  outer: {
    flex: 1,
    borderRadius: s(20),
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
    paddingLeft: s(14),
    paddingRight: s(12),
    gap: s(12),
  },
  infoArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
  },

  // ── Logo ──────────────────────────────────────────────────
  logoContainer: {
    position: 'relative',
  },
  logoWrap: {
    width: s(46),
    height: s(46),
    borderRadius: s(12),
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
    top: -s(3),
    right: -s(3),
    width: s(10),
    height: s(10),
    borderRadius: s(5),
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
    width: s(48),
    height: s(48),
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    borderRadius: s(24),
    backgroundColor: colors.primary,
  },
  playButton: {
    width: s(46),
    height: s(46),
    borderRadius: s(23),
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
