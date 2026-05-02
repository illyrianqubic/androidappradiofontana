import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { appIdentity, colors, fonts } from '../../constants/tokens';
import { ms, s } from '../../lib/responsive';
import { useAudioActions, useAudioState } from '../../services/audio';

const RED = '#dc2626';
const RED_DEEP = '#b91c1c';
const RED_TINT = 'rgba(220,38,38,0.07)';
const SURFACE = '#F3F4F6';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#6B7280';
const TEXT_MUTED = '#9CA3AF';

// ── Animated equalizer bar ─────────────────────────────────────────────────────
const BAR_HEIGHTS = [18, 32, 44, 28, 48, 36, 22, 42, 30, 20, 38, 26, 46].map((h) => s(h));
const BAR_OFFSETS = [0, 0.18, 0.09, 0.31, 0.06, 0.24, 0.12, 0.37, 0.15, 0.27, 0.04, 0.21, 0.10];

function EqBar({
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
  return <Animated.View style={[styles.eqBar, style]} />;
}

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
    <View style={styles.eqRow}>
      {BAR_HEIGHTS.map((h, i) => (
        <EqBar key={i} maxH={h} offset={BAR_OFFSETS[i]} phase={phase} />
      ))}
    </View>
  );
}

export default function LiveScreen() {
  const insets = useSafeAreaInsets();
  const { isPlaying, isReconnecting, isBuffering } = useAudioState();
  const { toggle } = useAudioActions();

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
          <Image source={appIdentity.logo} contentFit="cover" style={styles.headerLogo} />
          <View style={styles.headerSpacer} />
          <HamburgerButton />
        </View>
      </View>

      {/* ── Top zone: icon → play button ─────────────────────── */}
      <View style={[styles.topZone, { paddingTop: headerHeight + 24 }]}>
        <View style={[styles.topSpacer, !isPlaying && { flex: 1.6 }]} />

        {/* Radio icon box */}
        <View style={[styles.iconBox, isPlaying && styles.iconBoxPlaying]}>
          <Ionicons
            name="radio-outline"
            size={s(28)}
            color={isPlaying ? RED : TEXT_MUTED}
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

        <Equalizer playing={isPlaying} />
      </View>

      {/* ── Bottom zone: stat cards ───────────────────────────── */}
      <View style={[styles.bottomZone, { paddingBottom: insets.bottom + s(14) }]}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="time-outline" size={s(22)} color={TEXT_MUTED} />
            <Text style={styles.statVal}>24/7</Text>
            <Text style={styles.statLbl}>LIVE</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="volume-medium-outline" size={s(22)} color={TEXT_MUTED} />
            <Text style={styles.statVal}>HQ</Text>
            <Text style={styles.statLbl}>320KBPS</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="wifi-outline" size={s(22)} color={TEXT_MUTED} />
            <Text style={styles.statVal}>FM</Text>
            <Text style={styles.statLbl}>98.8</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
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
    width: s(46),
    height: s(46),
    borderRadius: s(11),
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
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: s(12),
  },
  iconBoxPlaying: {
    backgroundColor: RED_TINT,
  },

  // ── Status badge ────────────────────────────────────────────
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    backgroundColor: SURFACE,
    paddingHorizontal: s(16),
    paddingVertical: s(7),
    borderRadius: 999,
    marginBottom: s(20),
  },
  badgePlaying: {
    backgroundColor: RED,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: TEXT_MUTED,
  },
  badgeDotPlaying: {
    backgroundColor: '#FFFFFF',
  },
  badgeText: {
    color: TEXT_SECONDARY,
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
    color: TEXT_PRIMARY,
    fontFamily: fonts.uiBold,
    fontSize: ms(26),
    letterSpacing: -0.8,
    textAlign: 'center',
    lineHeight: ms(34),
  },
  freq: {
    color: TEXT_SECONDARY,
    fontFamily: fonts.uiRegular,
    fontSize: ms(14),
    textAlign: 'center',
  },
  desc: {
    color: TEXT_MUTED,
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
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: s(16),
    marginTop: s(10),
    shadowColor: RED,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  playBtnPlaying: {
    backgroundColor: RED_DEEP,
  },
  playBtnPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.94 }],
  },
  playIconNudge: {
    marginLeft: 5,
  },

  // ── Equalizer ───────────────────────────────────────────────
  eqRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: s(4),
    height: s(44),
    marginTop: 0,
  },
  eqBar: {
    width: s(4),
    borderRadius: s(2),
    backgroundColor: RED,
  },

  // ── Stat cards ──────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  statCard: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: s(18),
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: s(14),
    gap: s(4),
  },
  statVal: {
    color: TEXT_PRIMARY,
    fontFamily: fonts.uiBold,
    fontSize: ms(20),
    letterSpacing: -0.3,
  },
  statLbl: {
    color: TEXT_MUTED,
    fontFamily: fonts.uiBold,
    fontSize: ms(9),
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
});
