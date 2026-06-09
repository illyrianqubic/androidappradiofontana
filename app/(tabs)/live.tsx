import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { HamburgerButton } from '../../components/ui/HamburgerButton';
import { appIdentity, fonts } from '../../constants/tokens';
import { useTheme } from '../../providers/ThemeProvider';
import type { ThemeColors } from '../../providers/ThemeProvider';
import { ms, s } from '../../lib/responsive';
import { useAudioActions, useAudioState } from '../../services/audio';



const eqBarStyle = { width: s(4), borderRadius: s(2), backgroundColor: '#dc2626' };
const eqRowStyle = { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: s(4), height: s(44), marginTop: 0 };

// ── Animated equalizer bar ─────────────────────────────────────────────────────
const BAR_HEIGHTS = [18, 32, 44, 28, 48, 36, 22, 42, 30, 20, 38, 26, 46].map((h) => s(h));
const BAR_OFFSETS = [0, 0.18, 0.09, 0.31, 0.06, 0.24, 0.12, 0.37, 0.15, 0.27, 0.04, 0.21, 0.10];

const EqBar = memo(function EqBar({
  maxH,
  offset,
  phase,
}: {
  maxH: number;
  offset: number;
  phase: SharedValue<number>;
}) {
  const h = useDerivedValue(() => {
    'worklet';
    const sv = (Math.sin((phase.value + offset) * Math.PI * 2) + 1) * 0.5;
    return 6 + (maxH - 6) * sv;
  }, [maxH, offset]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[eqBarStyle, style]} />;
});

function Equalizer({ playing }: { playing: boolean }) {
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
    <View style={eqRowStyle}>
      {BAR_HEIGHTS.map((h, i) => (
        <EqBar key={i} maxH={h} offset={BAR_OFFSETS[i]} phase={phase} />
      ))}
    </View>
  );
}

export default function LiveScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { isPlaying, isReconnecting, isBuffering } = useAudioState();
  const { toggle, play, pause } = useAudioActions();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // ── Sleep timer ───────────────────────────────────────────────
  const [sleepSecondsLeft, setSleepSecondsLeft] = useState<number | null>(null);
  const [showSleepModal, setShowSleepModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
      setSleepSecondsLeft(prev => {
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    pause();
    await play();
    setTimeout(() => setRefreshing(false), 2000);
  }, [pause, play]);

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

  const isBufferingOrReconnecting = isBuffering || isReconnecting;

  const badgeLabel = isPlaying
    ? 'DUKE TRANSMETUAR LIVE'
    : isBufferingOrReconnecting
    ? 'PO LIDHET...'
    : 'NDAL';

  const playIconName: 'pause' | 'play' | 'ellipsis-horizontal' = isPlaying
    ? 'pause'
    : isBufferingOrReconnecting
    ? 'ellipsis-horizontal'
    : 'play';

  const headerHeight = insets.top + 66;

  return (
    <View style={styles.screen}>
      {/* ── Top bar ──────────────────────────────────────────── */}
      <View style={[styles.headerShell, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Image source={isDark ? require('../../assets/images/darklogortvfontana.png') : require('../../assets/images/applogortvfontana.png')} contentFit="cover" style={styles.headerLogo} />
          <View style={styles.headerSpacer} />
          <HamburgerButton />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Top zone: icon → play button ─────────────────────── */}
        <View style={[styles.topZone, { paddingTop: headerHeight + 24 }]}>
          <View style={[styles.topSpacer, !isPlaying && { flex: 1.6 }]} />

          {/* Radio icon box */}
          <View style={[styles.iconBox, isPlaying && styles.iconBoxPlaying]}>
            <Ionicons
              name="radio-outline"
              size={s(28)}
              color={isPlaying ? colors.primary : colors.textMuted}
            />
          </View>

          {/* Status badge */}
          <View style={[styles.badge, isPlaying && styles.badgePlaying]}>
            <View style={[styles.badgeDot, isPlaying && styles.badgeDotPlaying]} />
            <Text style={[styles.badgeText, isPlaying && styles.badgeTextPlaying]}>{badgeLabel}</Text>
          </View>

          {/* Station info */}
          <View style={styles.infoGroup}>
            <Text style={styles.name}>RTV Fontana 98.8 FM</Text>
            <Text style={styles.freq}>Istog, Kosovë</Text>
            <Text style={styles.desc}>Transmetim 24/7 me cilësi të lartë</Text>
          </View>

          {/* Play / Pause button */}
          <Pressable
            onPress={toggle}
            hitSlop={16}
            style={({ pressed }) => [
              styles.playBtn,
              isPlaying && styles.playBtnPlaying,
              pressed && styles.playBtnPressed,
            ]}
          >
            <Ionicons
              name={playIconName}
              size={s(36)}
              color="#FFFFFF"
              style={playIconName === 'play' ? styles.playIconNudge : undefined}
            />
          </Pressable>

          {/* Sleep timer */}
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
          >
            <Ionicons
              name={sleepSecondsLeft !== null ? 'moon' : 'moon-outline'}
              size={s(14)}
              color={sleepSecondsLeft !== null ? colors.primary : colors.textMuted}
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

          <Equalizer playing={isPlaying} />

          {refreshing && (
            <Text style={styles.refreshText}>Duke u rilidh...</Text>
          )}
        </View>

        {/* ── Bottom zone: stat cards ───────────────────────────── */}
        <View style={[styles.bottomZone, { paddingBottom: insets.bottom + s(14) }]}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="time-outline" size={s(22)} color={colors.textMuted} />
              <Text style={styles.statVal}>24/7</Text>
              <Text style={styles.statLbl}>LIVE</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="wifi-outline" size={s(22)} color={colors.textMuted} />
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
                <Ionicons
                  name="chevron-forward"
                  size={s(18)}
                  color={colors.textMuted}
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

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgScreen,
  },
  topZone: {
    flex: 1.35,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  topSpacer: {
    flex: 1,
  },
  bottomZone: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    width: '100%',
  },

  // ── Top bar ─────────────────────────────────────────────────
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
    width: 46,
    height: 46,
    borderRadius: 11,
    backgroundColor: colors.surfaceSubtle,
  },
  headerSpacer: {
    flex: 1,
  },

  // ── Radio icon box ──────────────────────────────────────────
  iconBox: {
    width: s(68),
    height: s(68),
    borderRadius: s(17),
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: s(12),
  },
  iconBoxPlaying: {
    backgroundColor: colors.redTint,
  },

  // ── Status badge ────────────────────────────────────────────
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: s(16),
    paddingVertical: s(7),
    borderRadius: 999,
    marginBottom: s(20),
  },
  badgePlaying: {
    backgroundColor: colors.primary,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.textMuted,
  },
  badgeDotPlaying: {
    backgroundColor: '#FFFFFF',
  },
  badgeText: {
    color: colors.textSecondary,
    fontFamily: fonts.uiBold,
    fontSize: ms(12),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  badgeTextPlaying: {
    color: '#FFFFFF',
  },

  // ── Station info ────────────────────────────────────────────
  infoGroup: {
    alignItems: 'center',
    gap: s(4),
    paddingHorizontal: s(24),
    marginBottom: s(24),
  },
  name: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: ms(26),
    letterSpacing: -0.8,
    textAlign: 'center',
    lineHeight: ms(34),
  },
  freq: {
    color: colors.textSecondary,
    fontFamily: fonts.uiRegular,
    fontSize: ms(14),
    textAlign: 'center',
  },
  desc: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: ms(12.5),
    textAlign: 'center',
    marginTop: 2,
  },

  // ── Play button ─────────────────────────────────────────────
  playBtn: {
    width: s(78),
    height: s(78),
    borderRadius: s(39),
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: s(16),
    marginTop: s(10),
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  playBtnPlaying: {
    backgroundColor: colors.primaryDeep,
  },
  playBtnPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.94 }],
  },
  playIconNudge: {
    marginLeft: 5,
  },

  // ── Stat cards ──────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
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

  // ── Sleep timer button ──────────────────────────────────────
  sleepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    paddingHorizontal: s(14),
    paddingVertical: s(8),
    borderRadius: 999,
    backgroundColor: colors.surfaceSubtle,
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

  // ── Sleep timer modal ───────────────────────────────────────
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

  // ── Pull-to-refresh text ────────────────────────────────────
  refreshText: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: ms(12.5),
    letterSpacing: 0.4,
    marginTop: s(8),
  },
});
