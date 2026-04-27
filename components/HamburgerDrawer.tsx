import { useEffect, useState } from 'react';
import {
  BackHandler,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  useWindowDimensions,
} from 'react-native';

// LayoutAnimation on Android (needed for older architecture; harmless on New Arch)
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDrawer } from '../context/DrawerContext';
import { useAudio } from '../services/audio';
import { EqualizerBars } from './EqualizerBars';
import { appIdentity, colors, fonts } from '../design-tokens';

// ── TikTok SVG logo (simple-icons) ──────────────────────────────────────────
function TikTokIcon({ size = 22, color = '#010101' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </Svg>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────────
const LAJME_CATEGORIES = [
  { label: 'Politikë',   slug: 'politike' },
  { label: 'Sport',      slug: 'sport' },
  { label: 'Teknologji', slug: 'teknologji' },
  { label: 'Showbiz',    slug: 'showbiz' },
  { label: 'Shëndetësi', slug: 'shendetesi' },
  { label: 'Nga Bota',   slug: 'nga-bota' },
  { label: 'Biznes',     slug: 'biznes' },
];
const CAT_H = 36;

// Height of the StickyTopBar content below the status bar.
// Matches topInsetOffset = insets.top + 72 used in every tab screen, minus 5px
// so the panel starts slightly higher (just overlaps the bar shadow, not the content).
const TOP_BAR_H = 58;

// Tab bar height from (tabs)/_layout.tsx: `height: 72 + insets.bottom`.
// Setting this to 72 places the panel's bottom edge flush at the tab bar's
// top edge — the panel visually "touches" the bottom bar.
const TAB_BAR_H = 72;

// Max panel width on large screens.
const PANEL_MAX_W = 300;

type SocialLink = { icon: string | null; label: string; color: string; url: string };
const SOCIAL_LINKS: SocialLink[] = [
  { icon: 'facebook',  label: 'Facebook',  color: '#1877F2', url: 'https://www.facebook.com/rtvfontanalive' },
  { icon: 'instagram', label: 'Instagram', color: '#E4405F', url: 'https://www.instagram.com/rtvfontana/' },
  { icon: 'youtube',   label: 'YouTube',   color: '#FF0000', url: 'https://www.youtube.com/@RTVFontana' },
  { icon: null,        label: 'TikTok',    color: '#010101', url: 'https://www.tiktok.com/@rtvfontanalive' },
];

// Spring config — snappy, premium feel
const SPRING = { damping: 22, stiffness: 400, mass: 0.7 } as const;

// Per-category tag color palette
const CAT_COLORS = [
  { bg: '#EEF2FF', text: '#4338CA' },
  { bg: '#FEF9C3', text: '#854D0E' },
  { bg: '#E0F2FE', text: '#0369A1' },
  { bg: '#F0FDF4', text: '#166534' },
  { bg: '#F5F3FF', text: '#5B21B6' },
  { bg: '#FFF7ED', text: '#9A3412' },
  { bg: '#FDF2F8', text: '#86198F' },
] as const;

export function HamburgerDrawer() {
  const { isOpen, close } = useDrawer();
  const { isPlaying } = useAudio();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  const [isInteractive, setIsInteractive] = useState(false);
  const [lajmeExpanded, setLajmeExpanded] = useState(false);

  const progress = useSharedValue(0);
  const panelWidthSV = useSharedValue(0);
  const glowAnim = useSharedValue(1);

  useEffect(() => {
    if (isOpen) {
      setIsInteractive(true);
      progress.value = withSpring(1, SPRING);
    } else {
      // Collapse accordion immediately (hidden by drawer animation)
      setLajmeExpanded(false);
      progress.value = withSpring(0, SPRING, (finished) => {
        if (finished) runOnJS(setIsInteractive)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [isOpen, close]);

  useEffect(() => {
    if (isPlaying) {
      glowAnim.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 950, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 950, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(glowAnim);
      glowAnim.value = withTiming(1, { duration: 300 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.5,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [panelWidthSV.value, 0]) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowAnim.value }],
    opacity: interpolate(glowAnim.value, [1, 1.4], [0.45, 0]),
  }));

  const backdropGesture = Gesture.Race(
    Gesture.Tap().onEnd(() => runOnJS(close)()),
    Gesture.Pan().onEnd((e) => {
      if (e.translationX > 30 || e.velocityX > 300) runOnJS(close)();
    }),
  );

  const navigate = (path: string) => { close(); router.push(path as never); };

  const toggleLajme = () => {
    const next = !lajmeExpanded;
    // LayoutAnimation runs on JS thread → parent navCard layout updates properly
    LayoutAnimation.configureNext({
      duration: 240,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
    setLajmeExpanded(next);
  };

  const isHomeActive = pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/';
  const isLiveActive = pathname.includes('/live');
  const isNewsActive = pathname.includes('/news');

  const topBarBottom = insets.top + TOP_BAR_H;
  const panelBottom = TAB_BAR_H + insets.bottom;
  const panelWidth = Math.round(windowWidth * 0.78);
  panelWidthSV.value = panelWidth;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={isInteractive ? 'box-none' : 'none'}
    >
      {/* Backdrop */}
      <Animated.View
        style={[S.backdrop, { top: topBarBottom, bottom: panelBottom, right: panelWidth }, backdropStyle]}
        pointerEvents={isInteractive ? 'auto' : 'none'}
      >
        <GestureDetector gesture={backdropGesture}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>
      </Animated.View>

      {/* Panel — outer: elevation only; inner: clipping */}
      <Animated.View
        style={[S.panelOuter, { top: topBarBottom, bottom: panelBottom, right: 0, width: panelWidth }, panelStyle]}
        pointerEvents={isInteractive ? 'auto' : 'none'}
      >
        <View style={S.panelInner}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={S.scrollContent}
          >
            {/* ════════════════════════════════════════════════════ */}
            {/* HERO                                                 */}
            {/* ════════════════════════════════════════════════════ */}
            <LinearGradient
              colors={['#3b0000', '#7f1d1d', '#dc2626']}
              start={{ x: 0.0, y: 0.0 }}
              end={{ x: 1.1, y: 1.1 }}
              style={S.hero}
            >
              {/* Decorative SVG geometry */}
              <Svg
                style={StyleSheet.absoluteFill}
                viewBox="0 0 260 180"
                preserveAspectRatio="xMaxYMin slice"
              >
                <Circle cx="230" cy="-20" r="100" fill="rgba(255,255,255,0.04)" />
                <Circle cx="260" cy="130" r="70"  fill="rgba(255,255,255,0.03)" />
                <Circle cx="-20" cy="170" r="90"  fill="rgba(0,0,0,0.12)" />
                <Circle cx="110" cy="20"  r="35"  fill="rgba(255,255,255,0.025)" />
              </Svg>

              {/* Close button */}
              <View style={S.heroTopRow}>
                <Pressable onPress={close} style={S.closeBtn} hitSlop={14}>
                  <Ionicons name="close" size={16} color="rgba(255,255,255,0.85)" />
                </Pressable>
              </View>

              {/* Logo + pulsing glow */}
              <View style={S.heroBody}>
                <View style={S.logoStack}>
                  <Animated.View style={[S.glowRing, glowStyle]} />
                  <View style={S.logoRing}>
                    <Image source={appIdentity.logo} contentFit="cover" style={S.logoImg} />
                  </View>
                </View>

                <Text style={S.heroName}>{appIdentity.name}</Text>

                <View style={S.freqBadge}>
                  <Text style={S.freqText}>{appIdentity.frequency}</Text>
                  <View style={S.freqDot} />
                  <Text style={S.freqText}>{appIdentity.location}</Text>
                </View>

                {/* Live status pill */}
                <View style={S.livePill}>
                  {isPlaying ? (
                    <EqualizerBars playing bars={3} variant="mini" color="#FFFFFF" height={10} />
                  ) : (
                    <View style={S.liveDot} />
                  )}
                  <Text style={S.livePillText}>
                    {isPlaying ? 'DUKE LUAJTUR' : 'LIVE 24/7'}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            {/* ════════════════════════════════════════════════════ */}
            {/* PRIMARY NAV CARD  (lifts over hero)                 */}
            {/* ════════════════════════════════════════════════════ */}
            <View style={S.navCard}>
              <Text style={S.sectionLabel}>MENUJA</Text>

              <NavItem
                icon="home-outline"
                label="Kryefaqja"
                active={isHomeActive}
                iconColor="#4F46E5"
                iconBg="#EEF2FF"
                onPress={() => navigate('/(tabs)')}
              />
              <NavItem
                icon="radio-outline"
                label="Drejtpërdrejt"
                active={isLiveActive}
                iconColor={colors.primary}
                iconBg={colors.redTint}
                onPress={() => navigate('/(tabs)/live')}
              />

              {/* Lajme with accordion */}
              <Pressable
                onPress={toggleLajme}
                style={({ pressed }) => [
                  S.navItem,
                  isNewsActive && S.navItemActive,
                  pressed && !isNewsActive && S.navItemPressed,
                ]}
              >
                {isNewsActive && <View style={S.activeBar} />}
                <View style={[S.iconChip, { backgroundColor: isNewsActive ? colors.redTint : '#FFFBEB' }]}>
                  <Ionicons
                    name="newspaper-outline"
                    size={17}
                    color={isNewsActive ? colors.primary : '#B45309'}
                  />
                </View>
                <Text style={[S.navLabel, isNewsActive && S.navLabelActive, { flex: 1 }]}>
                  Lajme
                </Text>
                <Ionicons
                  name={lajmeExpanded ? 'chevron-up' : 'chevron-down'}
                  size={13}
                  color={isNewsActive ? colors.primary : '#9CA3AF'}
                />
              </Pressable>

              {/* Category accordion — conditional render keeps navCard layout accurate */}
              {lajmeExpanded && (
                <View style={S.accordion}>
                  {LAJME_CATEGORIES.map((cat, i) => (
                    <Pressable
                      key={cat.slug}
                      onPress={() => navigate('/(tabs)/news')}
                      style={({ pressed }) => [S.catItem, pressed && S.catItemPressed]}
                    >
                      <View style={[S.catTag, { backgroundColor: CAT_COLORS[i % CAT_COLORS.length].bg }]}>
                        <Text style={[S.catTagText, { color: CAT_COLORS[i % CAT_COLORS.length].text }]}>
                          {cat.label}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* ════════════════════════════════════════════════════ */}
            {/* SECONDARY NAV CARD                                  */}
            {/* ════════════════════════════════════════════════════ */}
            <View style={[S.navCard, S.navCardSpaced]}>
              <Text style={S.sectionLabel}>TJETËR</Text>
              <NavItem
                icon="calendar-outline"
                label="Programi"
                iconColor="#15803D"
                iconBg="#F0FDF4"
                onPress={() => navigate('/programi')}
              />
              <NavItem
                icon="information-circle-outline"
                label="Rreth Nesh"
                iconColor="#6D28D9"
                iconBg="#F5F3FF"
                onPress={() => navigate('/rreth-nesh')}
              />
              <NavItem
                icon="call-outline"
                label="Na Kontakto"
                iconColor="#C2410C"
                iconBg="#FFF7ED"
                onPress={() => navigate('/na-kontakto')}
              />
            </View>

            {/* ════════════════════════════════════════════════════ */}
            {/* SOCIAL CARD                                         */}
            {/* ════════════════════════════════════════════════════ */}
            <View style={[S.navCard, S.navCardSpaced]}>
              <Text style={S.sectionLabel}>NA NDIQNI</Text>
              <View style={S.socialGrid}>
                {SOCIAL_LINKS.map((link) => (
                  <Pressable
                    key={link.label}
                    onPress={() => Linking.openURL(link.url).catch(() => undefined)}
                    style={({ pressed }) => [
                      S.socialBtn,
                      { backgroundColor: link.color },
                      pressed && S.socialBtnPressed,
                    ]}
                    hitSlop={2}
                  >
                    {link.icon ? (
                      <MaterialCommunityIcons name={link.icon as 'facebook'} size={21} color="#FFFFFF" />
                    ) : (
                      <TikTokIcon size={21} color="#FFFFFF" />
                    )}
                    <Text style={S.socialBtnLabel}>{link.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ════════════════════════════════════════════════════ */}
            {/* CONTACT CARD                                        */}
            {/* ════════════════════════════════════════════════════ */}
            <View style={[S.navCard, S.navCardSpaced]}>
              <Pressable
                onPress={() => Linking.openURL('tel:+38344150027').catch(() => undefined)}
                style={({ pressed }) => [S.infoRow, pressed && S.infoRowPressed]}
              >
                <View style={[S.infoIcon, { backgroundColor: colors.redTint }]}>
                  <Ionicons name="call-outline" size={14} color={colors.primary} />
                </View>
                <Text style={S.infoText}>+383 44 150 027</Text>
                <Ionicons name="chevron-forward" size={12} color="#D1D5DB" />
              </Pressable>
              <View style={S.infoSep} />
              <Pressable
                onPress={() => Linking.openURL('mailto:rtvfontana@gmail.com').catch(() => undefined)}
                style={({ pressed }) => [S.infoRow, pressed && S.infoRowPressed]}
              >
                <View style={[S.infoIcon, { backgroundColor: colors.redTint }]}>
                  <Ionicons name="mail-outline" size={14} color={colors.primary} />
                </View>
                <Text style={S.infoText}>rtvfontana@gmail.com</Text>
                <Ionicons name="chevron-forward" size={12} color="#D1D5DB" />
              </Pressable>
              <View style={S.infoSep} />
              <View style={S.infoRow}>
                <View style={[S.infoIcon, { backgroundColor: '#F3F4F6' }]}>
                  <Ionicons name="time-outline" size={14} color="#9CA3AF" />
                </View>
                <Text style={[S.infoText, { color: '#9CA3AF' }]}>08:00 – 20:00</Text>
                <View style={S.openBadge}>
                  <Text style={S.openBadgeText}>HAPUR</Text>
                </View>
              </View>
            </View>

            <Text style={S.copyright}>© 2026 Radio Fontana · Të gjitha të drejtat e rezervuara</Text>
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

// ── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({
  icon,
  label,
  active = false,
  onPress,
  iconColor = '#6B7280',
  iconBg = '#F3F4F6',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        S.navItem,
        active && S.navItemActive,
        pressed && !active && S.navItemPressed,
      ]}
    >
      {active && <View style={S.activeBar} />}
      <View style={[S.iconChip, { backgroundColor: active ? colors.redTint : iconBg }]}>
        <Ionicons
          name={icon}
          size={17}
          color={active ? colors.primary : iconColor}
        />
      </View>
      <Text style={[S.navLabel, active && S.navLabelActive]}>{label}</Text>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // ── Shell ───────────────────────────────────────────────────────────────────
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,1)',
  },
  panelOuter: {
    position: 'absolute',
    backgroundColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 36,
    shadowOffset: { width: -10, height: 0 },
    elevation: 32,
  },
  panelInner: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#F2F3F5',
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // ── Hero ────────────────────────────────────────────────────────────────────
  hero: {
    minHeight: 172,
    paddingBottom: 28,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 12,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: {
    paddingHorizontal: 20,
    alignItems: 'flex-start',
  },
  logoStack: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  glowRing: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  logoRing: {
    width: 66,
    height: 66,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.45)',
    overflow: 'hidden',
  },
  logoImg: {
    width: '100%',
    height: '100%',
  },
  heroName: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 20,
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  freqBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
    marginBottom: 16,
  },
  freqText: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  freqDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  livePillText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.4,
  },

  // ── Nav cards ───────────────────────────────────────────────────────────────
  navCard: {
    marginHorizontal: 10,
    marginTop: -22,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 14,
    paddingBottom: 8,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  navCardSpaced: {
    marginTop: 8,
  },
  sectionLabel: {
    paddingHorizontal: 10,
    paddingBottom: 4,
    color: '#B0B4BC',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 2.0,
    textTransform: 'uppercase',
  },

  // ── Nav items ───────────────────────────────────────────────────────────────
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 13,
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  navItemActive: {
    backgroundColor: '#FFF1F1',
  },
  navItemPressed: {
    backgroundColor: '#F7F8FA',
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    color: '#1C2230',
    fontFamily: fonts.uiMedium,
    fontSize: 14,
    letterSpacing: -0.15,
    flexShrink: 1,
  },
  navLabelActive: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
  },

  // ── Category accordion ──────────────────────────────────────────────────────
  accordion: {
    marginLeft: 58,
    marginRight: 6,
    paddingTop: 4,
    paddingBottom: 6,
  },
  catItem: {
    height: CAT_H,
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 2,
  },
  catItemPressed: {
    opacity: 0.55,
  },
  catTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
  },
  catTagText: {
    fontFamily: fonts.uiMedium,
    fontSize: 12,
    lineHeight: 16,
  },

  // ── Social grid ─────────────────────────────────────────────────────────────
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 6,
  },
  socialBtn: {
    flex: 1,
    minWidth: '43%',
    flexBasis: '43%',
    height: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  socialBtnPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.95 }],
  },
  socialBtnLabel: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 0.7,
  },

  // ── Contact info ────────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 12,
  },
  infoRowPressed: {
    backgroundColor: '#F7F8FA',
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    color: '#374151',
    fontFamily: fonts.uiMedium,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  infoSep: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginHorizontal: 12,
  },
  openBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
  },
  openBadgeText: {
    color: '#059669',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 0.9,
  },

  // ── Copyright ───────────────────────────────────────────────────────────────
  copyright: {
    color: '#C8CBD0',
    fontFamily: fonts.uiRegular,
    fontSize: 10,
    letterSpacing: 0.2,
    marginTop: 18,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});

