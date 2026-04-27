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
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDrawer } from '../context/DrawerContext';

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
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  const [isInteractive, setIsInteractive] = useState(false);
  const [lajmeExpanded, setLajmeExpanded] = useState(false);

  const progress = useSharedValue(0);
  const panelWidthSV = useSharedValue(0);

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


  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.5,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [panelWidthSV.value, 0]) }],
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

      {/* Panel — outer: elevation only; inner: all-corners clipping */}
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
            {/* ── HEADER ─────────────────────────────────────────── */}
            <View style={S.header}>
              <View style={S.headerBody}>
                <View style={S.logoWrap}>
                  <Image source={appIdentity.logo} contentFit="cover" style={S.logoImg} />
                </View>
                <Text style={S.headerName}>{appIdentity.name}</Text>
                <Text style={S.headerFreq}>{appIdentity.frequency} · {appIdentity.location}</Text>
              </View>
            </View>

            {/* ── MENUJA ─────────────────────────────────────────── */}
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
                iconBg="#fee2e2"
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
                <View style={[S.iconChip, { backgroundColor: isNewsActive ? '#fee2e2' : '#FFFBEB' }]}>
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

              {/* Category accordion — conditional render, LayoutAnimation drives expansion */}
              {lajmeExpanded && (
                <View style={S.accordion}>
                  {LAJME_CATEGORIES.map((cat, i) => (
                    <View key={cat.slug}>
                      <Pressable
                        onPress={() => navigate('/(tabs)/news')}
                        style={({ pressed }) => [S.catRow, pressed && S.catRowPressed]}
                      >
                        <View style={[S.catDot, { backgroundColor: CAT_COLORS[i % CAT_COLORS.length].text }]} />
                        <Text style={S.catLabel}>{cat.label}</Text>
                      </Pressable>
                      {i < LAJME_CATEGORIES.length - 1 && <View style={S.catSep} />}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* ── TJETËR ─────────────────────────────────────────── */}
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

            {/* ── SOCIAL ─────────────────────────────────────────── */}
            <View style={[S.navCard, S.navCardSpaced, S.navCardWhite]}>
              <Text style={[S.sectionLabel, S.sectionLabelDark]}>NA NDIQNI</Text>
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

            {/* ── CONTACT ─────────────────────────────────────────── */}
            <View style={[S.navCard, S.navCardSpaced, S.navCardWhite]}>
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
  // Outer: elevation/shadow — NO overflow:hidden (Android blanks children)
  panelOuter: {
    position: 'absolute',
    backgroundColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: -4, height: 0 },
    elevation: 16,
    overflow: 'hidden',
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  // Inner: flex fill — panelOuter handles clipping
  panelInner: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // ── Header — pure white ─────────────────────────────────────────────────────
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 20,
    paddingTop: 16,
  },
  headerBody: {
    paddingHorizontal: 20,
    alignItems: 'flex-start',
  },
  logoWrap: {
    width: 58,
    height: 58,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  logoImg: {
    width: '100%',
    height: '100%',
  },
  headerName: {
    color: '#111827',
    fontFamily: fonts.uiBold,
    fontSize: 17,
    letterSpacing: -0.4,
    lineHeight: 23,
  },
  headerFreq: {
    color: '#9CA3AF',
    fontFamily: fonts.uiMedium,
    fontSize: 12,
    marginTop: 3,
  },

  // ── Nav cards ───────────────────────────────────────────────────────────────
  // MENUJA + TJETËR: warm red-tinted #fef2f2 — intentional, pairs with red accents
  navCard: {
    marginHorizontal: 10,
    marginTop: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 16,
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 6,
    shadowColor: '#dc2626',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  navCardSpaced: {
    marginTop: 8,
  },
  // Override for social/contact cards: clean white
  navCardWhite: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.04,
  },
  // Section label on #fef2f2 background — warm pinkish-muted
  sectionLabel: {
    paddingHorizontal: 10,
    paddingBottom: 2,
    color: '#C8A0A0',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 2.0,
    textTransform: 'uppercase',
  },
  // Override for white-bg cards
  sectionLabelDark: {
    color: '#B0B4BC',
  },

  // ── Nav items ───────────────────────────────────────────────────────────────
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  navItemActive: {
    backgroundColor: 'rgba(220,38,38,0.10)',
  },
  navItemPressed: {
    backgroundColor: 'rgba(220,38,38,0.06)',
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
    width: 34,
    height: 34,
    borderRadius: 10,
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
    marginRight: 8,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  catRowPressed: {
    backgroundColor: 'rgba(220,38,38,0.06)',
  },
  catDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  catLabel: {
    color: '#374151',
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  catSep: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginHorizontal: 12,
  },

  // ── Social grid ─────────────────────────────────────────────────────────────
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 6,
  },
  socialBtn: {
    flex: 1,
    minWidth: '43%',
    flexBasis: '43%',
    height: 54,
    borderRadius: 13,
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
    paddingVertical: 10,
    borderRadius: 10,
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
    marginHorizontal: 10,
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

