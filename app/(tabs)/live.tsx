import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ChevronRight,
  Clock,
  Loader,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Wifi,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { HamburgerButton } from '../../components/ui/HamburgerButton';
import { fonts } from '../../constants/tokens';
import { useTheme } from '../../providers/ThemeProvider';
import type { ThemeColors } from '../../providers/ThemeProvider';
import { ms, s } from '../../lib/responsive';
import { useAudioActions, useAudioState, useAudioMetadata } from '../../services/audio';
import { PlayerState } from '../../services/audio';
import type { AudioStateValue, AudioActionsValue } from '../../services/audio';

// ═══════════════════════════════════════════════════════════════════════════════
// PREMIUM CIRCLE — radial gradient album-art visualizer
// ═══════════════════════════════════════════════════════════════════════════════

const CIRCLE_SIZE = s(200);
const RING_SIZE = s(216);
const BORDER_WIDTH = 3;

function PremiumCircle({
  playing,
  buffering,
  isDark,
  colors,
}: {
  playing: boolean;
  buffering: boolean;
  isDark: boolean;
  colors: ThemeColors;
}) {
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(1);
  const glowOpacity = useSharedValue(playing ? 0.35 : 0.15);
  const logoOpacity = useSharedValue(playing ? 1 : 0.5);

  // ── Rotation animation ────────────────────────────────────────
  useEffect(() => {
    if (playing && !buffering) {
      rotation.value = withRepeat(withTiming(360, { duration: 8000, easing: Easing.linear }), -1, false);
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      glowOpacity.value = withTiming(0.35, { duration: 400 });
      logoOpacity.value = withTiming(1, { duration: 400 });
    } else if (buffering) {
      rotation.value = withRepeat(withTiming(360, { duration: 2000, easing: Easing.linear }), -1, false);
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 400 });
      glowOpacity.value = withTiming(0.25, { duration: 400 });
      logoOpacity.value = withTiming(0.6, { duration: 400 });
    } else {
      cancelAnimation(rotation);
      rotation.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.ease) });
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 400 });
      glowOpacity.value = withTiming(0.15, { duration: 400 });
      logoOpacity.value = withTiming(0.5, { duration: 400 });
    }
    return () => {
      cancelAnimation(rotation);
      cancelAnimation(pulse);
    };
  }, [playing, buffering, rotation, pulse, glowOpacity, logoOpacity]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));

  const arcDasharray = buffering ? '100 300' : '160 480';

  return (
    <View style={circleStyles.wrapper}>
      {/* Background glow */}
      <Animated.View
        style={[
          circleStyles.glow,
          {
            shadowColor: colors.primary,
            shadowRadius: playing ? 40 : 16,
            shadowOpacity: playing ? 0.35 : 0.15,
            elevation: playing ? 12 : 4,
          },
          pulseStyle,
        ]}
      />

      {/* Rotating gradient ring (SVG) */}
      <Animated.View style={[circleStyles.ringContainer, ringStyle]}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
          <Defs>
            <SvgLinearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.9" />
              <Stop offset="50%" stopColor={colors.primaryDeep} stopOpacity="0.6" />
              <Stop offset="100%" stopColor={colors.primary} stopOpacity="0.9" />
            </SvgLinearGradient>
          </Defs>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={(RING_SIZE - BORDER_WIDTH) / 2}
            stroke="url(#ringGrad)"
            strokeWidth={BORDER_WIDTH}
            fill="none"
            strokeDasharray={arcDasharray}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {/* Main circle with radial gradient (layered circles) */}
      <Animated.View style={[circleStyles.circle, pulseStyle]}>
        <View style={[circleStyles.circleBase, { backgroundColor: colors.primaryDeep }]} />
        <View style={[circleStyles.circleMid, { backgroundColor: colors.primary }]} />
        <View style={[circleStyles.circleInner, { backgroundColor: colors.primary }]} />

        {/* Logo */}
        <Animated.View style={logoStyle}>
          <Image
            source={
              isDark
                ? require('../../assets/images/logo-white-transparent.png')
                : require('../../assets/images/logo-white-transparent.png')
            }
            contentFit="contain"
            style={circleStyles.logo}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const circleStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: s(20),
    width: RING_SIZE,
    height: RING_SIZE,
  },
  glow: {
    position: 'absolute',
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: 'transparent',
  },
  ringContainer: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  circleBase: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CIRCLE_SIZE / 2,
  },
  circleMid: {
    position: 'absolute',
    top: '10%',
    left: '10%',
    right: '10%',
    bottom: '10%',
    borderRadius: (CIRCLE_SIZE * 0.8) / 2,
    opacity: 0.7,
  },
  circleInner: {
    position: 'absolute',
    top: '25%',
    left: '25%',
    right: '25%',
    bottom: '25%',
    borderRadius: (CIRCLE_SIZE * 0.5) / 2,
    opacity: 0.4,
  },
  logo: {
    width: s(120),
    height: s(120),
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREMIUM EQUALIZER — 16 bars, gradient, staggered animation
// ═══════════════════════════════════════════════════════════════════════════════

const EQ_BAR_WIDTH = s(4);
const EQ_BAR_GAP = s(3);
const EQ_MAX_HEIGHTS = [18, 32, 44, 28, 48, 36, 22, 42, 30, 20, 38, 26, 46, 34, 24, 40].map((h) => s(h));
const EQ_OFFSETS = [0, 0.18, 0.09, 0.31, 0.06, 0.24, 0.12, 0.37, 0.15, 0.27, 0.04, 0.21, 0.10, 0.33, 0.19, 0.28];
const EQ_ROW_HEIGHT = s(48);
const EQ_MIN_H = 3;

const EqBar = memo(function EqBar({
  maxH,
  offset,
  phase,
  staggerIndex,
  color,
  isAnimating,
}: {
  maxH: number;
  offset: number;
  phase?: SharedValue<number>;
  staggerIndex: number;
  color: string;
  isAnimating: boolean;
}) {
  const fallbackPhase = useSharedValue(0);
  const activePhase = phase ?? fallbackPhase;
  const staggerProgress = useSharedValue(isAnimating ? 1 : 0);

  useEffect(() => {
    if (isAnimating) {
      staggerProgress.value = withDelay(
        staggerIndex * 30,
        withTiming(1, { duration: 300, easing: Easing.out(Easing.back(1.2)) }),
      );
    } else {
      staggerProgress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.ease) });
    }
    return () => {
      cancelAnimation(staggerProgress);
    };
  }, [isAnimating, staggerIndex, staggerProgress]);

  const h = useDerivedValue(() => {
    'worklet';
    const wave = (Math.sin((activePhase.value + offset) * Math.PI * 2) + 1) * 0.5;
    const fullH = EQ_MIN_H + (maxH - EQ_MIN_H) * wave;
    return fullH * staggerProgress.value;
  }, [maxH, offset]);

  const barStyle = useAnimatedStyle(() => ({
    height: h.value,
    opacity: 0.4 + 0.6 * (h.value / maxH),
  }));

  return (
    <Animated.View
      style={[
        eqStyles.bar,
        {
          width: EQ_BAR_WIDTH,
          backgroundColor: color,
          borderTopLeftRadius: s(3),
          borderTopRightRadius: s(3),
        },
        barStyle,
      ]}
    />
  );
});

const eqStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: EQ_BAR_GAP,
    height: EQ_ROW_HEIGHT,
    marginTop: 0,
  },
  bar: {
    borderTopLeftRadius: s(3),
    borderTopRightRadius: s(3),
  },
});

function PremiumEqualizer({ playing }: { playing: boolean }) {
  const { colors } = useTheme();
  const phase = useSharedValue(0);
  const isFocused = useIsFocused();
  const shouldAnimate = playing && isFocused;

  useEffect(() => {
    if (shouldAnimate) {
      phase.value = 0;
      phase.value = withRepeat(
        withTiming(1, { duration: 1100, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(phase);
      phase.value = withTiming(0, { duration: 220 });
    }
    return () => {
      cancelAnimation(phase);
    };
  }, [shouldAnimate, phase]);

  return (
    <View style={eqStyles.row}>
      {EQ_MAX_HEIGHTS.map((h, i) => (
        <EqBar
          key={i}
          maxH={h}
          offset={EQ_OFFSETS[i]}
          phase={phase}
          staggerIndex={i}
          color={colors.primary}
          isAnimating={shouldAnimate}
        />
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREMIUM STATUS BADGE — shimmer, blinking dot, animated dots
// ═══════════════════════════════════════════════════════════════════════════════

function PremiumBadge({
  variant,
  badgeLabel,
  loadingDotsIndex,
  colors,
}: {
  variant: 'playing' | 'error' | 'loading' | 'default';
  badgeLabel: string;
  loadingDotsIndex: number;
  colors: ThemeColors;
}) {
  const shimmer = useSharedValue(0.8);
  const dotOpacity = useSharedValue(1);
  const loadingPulse = useSharedValue(0.6);

  useEffect(() => {
    if (variant === 'playing') {
      shimmer.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.8, { duration: 750, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      dotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.15, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else if (variant === 'loading') {
      cancelAnimation(shimmer);
      shimmer.value = 1;
      cancelAnimation(dotOpacity);
      dotOpacity.value = 0.5;
      loadingPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.6, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(shimmer);
      shimmer.value = 1;
      cancelAnimation(dotOpacity);
      dotOpacity.value = 1;
      cancelAnimation(loadingPulse);
      loadingPulse.value = 1;
    }
    return () => {
      cancelAnimation(shimmer);
      cancelAnimation(dotOpacity);
      cancelAnimation(loadingPulse);
    };
  }, [variant, shimmer, dotOpacity, loadingPulse]);

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: variant === 'loading' ? loadingPulse.value : shimmer.value,
  }));

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: variant === 'playing' ? dotOpacity.value : variant === 'loading' ? 0.5 : 1,
  }));

  const loadingDots = '.'.repeat((loadingDotsIndex % 3) + 1);

  return (
    <Animated.View
      style={[
        badgeStyles.badge,
        variant === 'playing' && { backgroundColor: colors.primary },
        variant === 'error' && { backgroundColor: colors.redTint },
        variant === 'loading' && { backgroundColor: colors.surfaceSubtle },
        variant === 'default' && { backgroundColor: colors.surfaceSubtle },
        badgeAnimatedStyle,
      ]}
    >
      <Animated.View
        style={[
          badgeStyles.dot,
          {
            backgroundColor:
              variant === 'playing'
                ? colors.surface
                : variant === 'error'
                ? colors.primary
                : colors.textMuted,
          },
          dotAnimatedStyle,
        ]}
      />
      <Text
        style={[
          badgeStyles.text,
          variant === 'playing' && { color: colors.surface },
          variant === 'error' && { color: colors.primary },
          variant === 'loading' && { color: colors.textMuted },
          variant === 'default' && { color: colors.textSecondary },
        ]}
      >
        {variant === 'loading'
          ? `${badgeLabel}${loadingDots}`
          : variant === 'playing'
          ? '\u25CF LIVE'
          : badgeLabel}
      </Text>
    </Animated.View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    paddingHorizontal: s(16),
    paddingVertical: s(7),
    borderRadius: 999,
    marginBottom: s(16),
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  text: {
    fontFamily: fonts.uiBold,
    fontSize: ms(12),
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOW PLAYING METADATA — fade transitions with theme colors
// ═══════════════════════════════════════════════════════════════════════════════

function NowPlayingMetadata({ colors }: { colors: ThemeColors }) {
  const metadata = useAudioMetadata() ?? { title: 'RTV Fontana 98.8 FM', artist: '' };
  const fadeOpacity = useSharedValue(1);
  const [displayedTitle, setDisplayedTitle] = useState('RTV Fontana 98.8 FM');
  const [displayedArtist, setDisplayedArtist] = useState('');
  const prevKeyRef = useRef('');
  const expectedKeyRef = useRef('');
  const mountedRef = useRef(true);

  const currentKey = `${metadata.title}|${metadata.artist}`;

  const applyText = useCallback((rawTitle: string, rawArtist: string, expectedKey: string) => {
    if (!mountedRef.current || expectedKeyRef.current !== expectedKey) return;

    let title: string;
    let artist: string;

    if (rawTitle && rawTitle !== 'RTV Fontana' && rawTitle !== 'Unknown') {
      const dashIdx = rawTitle.indexOf(' - ');
      if (dashIdx > 0) {
        artist = rawTitle.slice(0, dashIdx).trim();
        title = rawTitle.slice(dashIdx + 3).trim();
      } else {
        title = rawTitle;
        artist = rawArtist && rawArtist !== 'Unknown' ? rawArtist : 'RTV Fontana 98.8 FM';
      }
    } else {
      title = 'RTV Fontana 98.8 FM';
      artist = rawArtist && rawArtist !== 'Unknown' ? rawArtist : 'Istog, Kosovë';
    }

    setDisplayedTitle(title);
    setDisplayedArtist(artist);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (currentKey === prevKeyRef.current) return;
    const isFirstRender = prevKeyRef.current === '';
    prevKeyRef.current = currentKey;
    expectedKeyRef.current = currentKey;

    const rawTitle = metadata.title || '';
    const rawArtist = metadata.artist || '';

    if (isFirstRender) {
      applyText(rawTitle, rawArtist, currentKey);
      return;
    }

    // Fade out, then update text on the JS thread and fade back in.
    fadeOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
      if (!finished) return;
      runOnJS(applyText)(rawTitle, rawArtist, expectedKeyRef.current);
      fadeOpacity.value = withTiming(1, { duration: 300 });
    });
  }, [currentKey, metadata.title, metadata.artist, fadeOpacity, applyText]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fadeOpacity.value,
  }));

  return (
    <Animated.View style={[npStyles.container, animatedStyle]}>
      <Text style={[npStyles.title, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
        {displayedTitle}
      </Text>
      {displayedArtist ? (
        <Text style={[npStyles.artist, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
          {displayedArtist}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const npStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: s(4),
    paddingHorizontal: s(32),
    marginBottom: s(20),
    minHeight: s(52),
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.uiBold,
    fontSize: ms(18),
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  artist: {
    fontFamily: fonts.uiRegular,
    fontSize: ms(14),
    textAlign: 'center',
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREMIUM PLAY BUTTON — spring press, outer ring, retry
// ═══════════════════════════════════════════════════════════════════════════════

const PLAY_BTN_SIZE = s(78);

function PremiumPlayButton({
  isPlaying,
  isLoading,
  showRetry,
  onToggle,
  onRetry,
  colors,
}: {
  isPlaying: boolean;
  isLoading: boolean;
  showRetry: boolean;
  onToggle: () => void;
  onRetry: () => void;
  colors: ThemeColors;
}) {
  const btnScale = useSharedValue(1);

  const PlayIcon = isPlaying ? Pause : isLoading ? Loader : Play;

  const btnAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const onPressIn = useCallback(() => {
    btnScale.value = withSpring(0.92, { stiffness: 400, damping: 26 });
  }, [btnScale]);

  const onPressOut = useCallback(() => {
    btnScale.value = withSpring(1, { stiffness: 400, damping: 26 });
  }, [btnScale]);

  return (
    <View style={pbStyles.container}>
      {/* Play/Pause button */}
      <Animated.View style={btnAnimatedStyle}>
        <Pressable
          onPress={onToggle}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          hitSlop={16}
          style={[
            pbStyles.button,
            {
              backgroundColor: isPlaying ? colors.primaryDeep : colors.primary,
              shadowColor: colors.primary,
              shadowOpacity: isPlaying ? 0.4 : 0.28,
              shadowRadius: isPlaying ? 20 : 14,
              elevation: isPlaying ? 8 : 6,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pauzoje radion' : 'Luaj radion'}
        >
          <PlayIcon
            size={s(36)}
            color={colors.surface}
            strokeWidth={1.5}
            style={PlayIcon === Play ? { marginLeft: 5 } : undefined}
          />
        </Pressable>
      </Animated.View>

      {/* Retry button */}
      {showRetry && (
        <Pressable
          onPress={onRetry}
          hitSlop={12}
          style={({ pressed }) => [
            pbStyles.retryBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.84, transform: [{ scale: 0.95 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Provo përsëri"
        >
          <RefreshCw size={s(16)} color={colors.surface} strokeWidth={2} />
          <Text style={[pbStyles.retryText, { color: colors.surface }]}>Provo Përsëri</Text>
        </Pressable>
      )}
    </View>
  );
}

const pbStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: s(16),
  },
  button: {
    width: PLAY_BTN_SIZE,
    height: PLAY_BTN_SIZE,
    borderRadius: PLAY_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    paddingHorizontal: s(22),
    paddingVertical: s(12),
    borderRadius: s(12),
    marginTop: s(14),
    shadowColor: '#dc2626',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  retryText: {
    fontFamily: fonts.uiBold,
    fontSize: ms(13.5),
    letterSpacing: 0.2,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE SCREEN — main component
// ═══════════════════════════════════════════════════════════════════════════════

export default function LiveScreen() {
  const audioState = useAudioState();
  const audioActions = useAudioActions();

  if (!audioState || !audioActions) return null;

  return <LiveScreenInner audioState={audioState} audioActions={audioActions} />;
}

function LiveScreenInner({
  audioState,
  audioActions,
}: {
  audioState: AudioStateValue;
  audioActions: AudioActionsValue;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { isPlaying, isReconnecting, isBuffering, playbackState, reconnectAttempt } = audioState;
  const { toggle, play } = audioActions;
  const styles = useMemo(() => getStyles(colors), [colors]);

  // ── Sleep timer ───────────────────────────────────────────────
  const [sleepSecondsLeft, setSleepSecondsLeft] = useState<number | null>(null);
  const [showSleepModal, setShowSleepModal] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cancelSleepTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setSleepSecondsLeft(null);
  }, []);

  const startSleepTimer = useCallback((minutes: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setShowSleepModal(false);
    setSleepSecondsLeft(minutes * 60);
  }, []);

  useEffect(() => {
    if (sleepSecondsLeft === null) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    if (sleepSecondsLeft <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      toggle();
      setSleepSecondsLeft(null);
      return;
    }
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setSleepSecondsLeft((prev) => {
        if (prev === null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sleepSecondsLeft, toggle]);

  useEffect(() => {
    if (!isPlaying && sleepSecondsLeft !== null) {
      cancelSleepTimer();
    }
  }, [isPlaying, sleepSecondsLeft, cancelSleepTimer]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── Elapsed time ──────────────────────────────────────────────
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying) {
      if (elapsedRef.current) return;
      elapsedRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current);
        elapsedRef.current = null;
      }
    }
    return () => {
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current);
        elapsedRef.current = null;
      }
    };
  }, [isPlaying]);

  // Reset elapsed on new play session
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (playbackState === PlayerState.playing && !wasPlayingRef.current) {
      setElapsedSeconds(0);
    }
    wasPlayingRef.current = playbackState === PlayerState.playing;
  }, [playbackState]);

  const formatElapsed = (seconds: number): string => {
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const sec = seconds % 60;
      return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
    const m = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const SLEEP_OPTIONS: { label: string; minutes: number }[] = [
    { label: '15 minuta', minutes: 15 },
    { label: '30 minuta', minutes: 30 },
    { label: '60 minuta', minutes: 60 },
    { label: '90 minuta', minutes: 90 },
  ];

  // ── State derivations ─────────────────────────────────────────
  const isBufferingOrReconnecting = isBuffering || isReconnecting;
  const isLoading = isBufferingOrReconnecting || playbackState === PlayerState.connecting;
  const showRetry = playbackState === PlayerState.error && !isReconnecting;

  const badgeLabel = (() => {
    if (isPlaying) return 'LIVE';
    if (isReconnecting) {
      const attempt = reconnectAttempt ?? 0;
      return `Po rilidhet... (${attempt}/15)`;
    }
    if (isBuffering) return 'Po buferon';
    if (playbackState === PlayerState.connecting) return 'Po lidhet';
    if (playbackState === PlayerState.error) return 'Gabim — Po riprovohet';
    if (playbackState === PlayerState.paused || playbackState === PlayerState.none) return 'Pauzuar';
    return 'NDAL';
  })();

  const badgeVariant = ((): 'playing' | 'error' | 'loading' | 'default' => {
    if (isPlaying) return 'playing';
    if (playbackState === PlayerState.error && !isReconnecting) return 'error';
    if (isReconnecting || isBuffering || playbackState === PlayerState.connecting) return 'loading';
    return 'default';
  })();

  // ── Loading dots animation index ──────────────────────────────
  const [loadingDotsIndex, setLoadingDotsIndex] = useState(0);
  useEffect(() => {
    if (badgeVariant !== 'loading') {
      setLoadingDotsIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingDotsIndex((prev) => prev + 1);
    }, 400);
    return () => clearInterval(interval);
  }, [badgeVariant]);

  const headerHeight = insets.top + 66;

  return (
    <View style={styles.screen}>
      {/* ── Top bar ──────────────────────────────────────────── */}
      <View style={[styles.headerShell, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Image
            source={
              isDark
                ? require('../../assets/images/logo-white-transparent.png')
                : require('../../assets/images/logo-blue-transparent.png')
            }
            contentFit="contain"
            style={styles.headerLogo}
          />
          <View style={styles.headerSpacer} />
          <HamburgerButton />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Content zone ──────────────────────────────────────── */}
        <View style={[styles.contentZone, { paddingTop: headerHeight + s(20) }]}>
          {/* 1. Top spacer */}
          <View style={styles.topSpacer} />

          {/* 2. Premium circle visual */}
          <PremiumCircle
            playing={isPlaying}
            buffering={isBufferingOrReconnecting}
            isDark={isDark}
            colors={colors}
          />

          {/* 3. Status badge */}
          <PremiumBadge
            variant={badgeVariant}
            badgeLabel={badgeLabel}
            loadingDotsIndex={loadingDotsIndex}
            colors={colors}
          />

          {/* 4. Now playing metadata */}
          <NowPlayingMetadata colors={colors} />

          {/* 5. Play button with ring */}
          <PremiumPlayButton
            isPlaying={isPlaying}
            isLoading={isLoading}
            showRetry={showRetry}
            onToggle={toggle}
            onRetry={() => void play()}
            colors={colors}
          />

          {/* 6. Equalizer (moved up) */}
          <View style={styles.eqContainer}>
            <PremiumEqualizer playing={isPlaying} />
          </View>

          {/* 7. Sleep timer */}
          <Pressable
            onPress={() => {
              if (sleepSecondsLeft !== null) {
                cancelSleepTimer();
              } else {
                setShowSleepModal(true);
              }
            }}
            hitSlop={12}
            style={({ pressed }) => [
              styles.sleepBtn,
              pressed && styles.sleepBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Timer i gjumit"
          >
            <Moon
              size={s(14)}
              color={sleepSecondsLeft !== null ? colors.primary : colors.textMuted}
              strokeWidth={1.5}
            />
            <Text
              style={[
                styles.sleepBtnText,
                sleepSecondsLeft !== null && styles.sleepBtnTextActive,
              ]}
            >
              {sleepSecondsLeft !== null
                ? `Fike pas ${formatCountdown(sleepSecondsLeft)}`
                : 'Sleep Timer'}
            </Text>
          </Pressable>
        </View>

        {/* ── Bottom zone: stat cards ───────────────────────────── */}
        <View style={[styles.bottomZone, { paddingBottom: insets.bottom + s(14) }]}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Clock size={s(22)} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={styles.statVal}>{formatElapsed(elapsedSeconds)}</Text>
              <Text style={styles.statLbl}>Duke dëgjuar</Text>
            </View>
            <View style={styles.statCard}>
              <Wifi size={s(22)} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={styles.statVal}>FM</Text>
              <Text style={styles.statLbl}>98.8</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Sleep timer modal ───────────────────────────────── */}
      <Modal
        animationType="fade"
        transparent
        visible={showSleepModal}
        onRequestClose={() => setShowSleepModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowSleepModal(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Zgjidh kohën</Text>
            {SLEEP_OPTIONS.map((opt) => (
              <Pressable
                key={opt.minutes}
                onPress={() => startSleepTimer(opt.minutes)}
                style={({ pressed }) => [
                  styles.modalOption,
                  pressed && styles.modalOptionPressed,
                ]}
              >
                <Text style={styles.modalOptionText}>{opt.label}</Text>
                <ChevronRight
                  size={s(18)}
                  color={colors.textMuted}
                  strokeWidth={1.5}
                />
              </Pressable>
            ))}
            <Pressable
              onPress={() => setShowSleepModal(false)}
              style={({ pressed }) => [
                styles.modalCancel,
                pressed && styles.modalCancelPressed,
              ]}
            >
              <Text style={styles.modalCancelText}>Anulo</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bgScreen,
    },
    contentZone: {
      alignItems: 'center',
      paddingBottom: s(8),
    },
    topSpacer: {
      height: s(8),
    },
    bottomZone: {
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      width: '100%',
      paddingTop: s(12),
    },
    eqContainer: {
      marginBottom: s(12),
    },
    headerShell: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 40,
      backgroundColor: colors.surface,
      shadowColor: colors.navy,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    headerRow: {
      height: 66,
      paddingHorizontal: 14,
      paddingTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    headerLogo: {
      width: 60,
      height: 60,
    },
    headerSpacer: {
      flex: 1,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: s(18),
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: s(14),
      gap: s(4),
    },
    statVal: {
      color: colors.text,
      fontFamily: fonts.uiBold,
      fontSize: ms(20),
      letterSpacing: -0.3,
    },
    statLbl: {
      color: colors.textMuted,
      fontFamily: fonts.uiBold,
      fontSize: ms(9),
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    sleepBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(6),
      paddingHorizontal: s(14),
      paddingVertical: s(8),
      borderRadius: 999,
      backgroundColor: colors.surface,
      marginBottom: s(10),
    },
    sleepBtnPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.96 }],
    },
    sleepBtnText: {
      color: colors.textMuted,
      fontFamily: fonts.uiBold,
      fontSize: ms(11.5),
      letterSpacing: 0.4,
    },
    sleepBtnTextActive: {
      color: colors.primary,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: s(32),
    },
    modalCard: {
      width: '100%',
      maxWidth: s(340),
      backgroundColor: colors.surfaceElevated,
      borderRadius: s(20),
      paddingTop: s(20),
      paddingBottom: s(8),
      paddingHorizontal: s(8),
      shadowColor: colors.navy,
      shadowOpacity: 0.2,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    modalTitle: {
      color: colors.text,
      fontFamily: fonts.uiBold,
      fontSize: ms(17),
      textAlign: 'center',
      marginBottom: s(12),
    },
    modalOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: s(16),
      paddingVertical: s(14),
      borderRadius: s(12),
      backgroundColor: colors.surfaceSubtle,
      marginBottom: s(6),
    },
    modalOptionPressed: {
      opacity: 0.75,
    },
    modalOptionText: {
      color: colors.text,
      fontFamily: fonts.uiRegular,
      fontSize: ms(15),
    },
    modalCancel: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: s(14),
      marginTop: s(4),
      borderRadius: s(12),
    },
    modalCancelPressed: {
      opacity: 0.7,
    },
    modalCancelText: {
      color: colors.textMuted,
      fontFamily: fonts.uiBold,
      fontSize: ms(15),
    },
  });
