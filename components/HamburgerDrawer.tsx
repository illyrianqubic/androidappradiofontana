import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
// A-3: deep imports skip loading the full glyph maps for every icon set.
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useDrawer } from '../context/DrawerContext';

import { colors, fonts } from '../design-tokens';

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

// Max panel width on large screens.
const PANEL_MAX_W = 300;

type SocialLink = { icon: string | null; label: string; color: string; url: string };
const SOCIAL_LINKS: SocialLink[] = [
  { icon: 'facebook',  label: 'Facebook',  color: '#1877F2', url: 'https://www.facebook.com/rtvfontanalive' },
  { icon: 'instagram', label: 'Instagram', color: '#E4405F', url: 'https://www.instagram.com/rtvfontana/' },
  { icon: 'youtube',   label: 'YouTube',   color: '#FF0000', url: 'https://www.youtube.com/@RTVFontana' },
  { icon: null,        label: 'TikTok',    color: '#010101', url: 'https://www.tiktok.com/@rtvfontanalive' },
];

// Open/close easing — silky premium feel
const OPEN_EASING  = Easing.out(Easing.poly(4));
const CLOSE_EASING = Easing.in(Easing.cubic);
const OPEN_DURATION  = 200;
const CLOSE_DURATION = 150;

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

// Public component — always keeps the inner subtree mounted so there is zero
// cold-mount lag when the drawer opens. Visibility is controlled by the
// translateX animation (panel fully off-screen = invisible at no GPU cost).
export function HamburgerDrawer() {
  return <HamburgerDrawerInner />;
}

function HamburgerDrawerInner() {
  const { isOpen, close } = useDrawer();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  const [isInteractive, setIsInteractive] = useState(false);
  const [lajmeExpanded, setLajmeExpanded] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(true);
  const scrollHintOpacity = useSharedValue(1);
  const scrollRef = useRef<ScrollView>(null);

  const progress = useSharedValue(0);
  // panelWidth computed early so we can use it in animated styles
  const { width: windowWidthForPanel } = useWindowDimensions();
  const panelWidthForAnim = Math.min(Math.round(windowWidthForPanel * 0.75), PANEL_MAX_W);

  useEffect(() => {
    if (isOpen) {
      setIsInteractive(true);
      progress.value = withTiming(1, { duration: OPEN_DURATION, easing: OPEN_EASING });
    } else {
      // Collapse accordion immediately (hidden by drawer animation)
      setLajmeExpanded(false);
      progress.value = withTiming(0, { duration: CLOSE_DURATION, easing: CLOSE_EASING }, (finished) => {
        if (finished) runOnJS(setIsInteractive)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // H-B6: stable BackHandler effect. R-14: removed the closeRef indirection
  // \u2014 `close` from useDrawer() is now stable (memoized in the provider), so
  // we can depend on it directly without re-subscribing the JNI listener on
  // every parent render. The effect still only re-runs when isOpen flips
  // OR if `close` ever changes identity (it shouldn't).
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [isOpen, close]);


  // Reset scroll hint whenever drawer opens
  useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      setShowScrollHint(true);
      scrollHintOpacity.value = withTiming(1, { duration: 300 });
    }
  }, [isOpen, scrollHintOpacity]);

  // H-B7: scrollEventThrottle:100 still fired ~10 onScroll callbacks every
  // second of scrolling for a one-shot hint dismiss. onScrollBeginDrag fires
  // exactly once per gesture and is all this needs.
  const onScrollBeginDrag = () => {
    if (showScrollHint) {
      setShowScrollHint(false);
      scrollHintOpacity.value = withTiming(0, { duration: 220 });
    }
  };

  const scrollHintStyle = useAnimatedStyle(() => ({
    opacity: scrollHintOpacity.value,
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  // translateX: slide in from the right edge. Pure GPU compositing on Android
  // — no layout pass per frame, so it starts immediately.
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [panelWidthForAnim, 0]) }],
  }));

  const navigate = (path: string) => { close(); router.push(path as never); };

  const toggleLajme = () => {
    setLajmeExpanded((v) => !v);
  };

  const isHomeActive = pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/';
  const isLiveActive = pathname.includes('/live');
  const isNewsActive = pathname.includes('/news');

  const panelWidth = Math.min(Math.round(windowWidth * 0.75), PANEL_MAX_W);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={isInteractive ? 'auto' : 'none'}
    >
      {/* Full-screen touch blocker — captures ALL touches when drawer is open,
          preventing underlying tab content from receiving any events.
          Rendered first (lowest z-index among siblings) so the panel, which
          is rendered last, sits on top and handles its own touches normally. */}
      {isInteractive && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
        />
      )}

      {/* Animated dark overlay — covers the visible area between status bar
          and navigation bar. Visual only. */}
      <Animated.View
        style={[S.backdrop, { top: insets.top, bottom: insets.bottom, left: 0, right: 0 }, backdropStyle]}
        pointerEvents="none"
      />

      {/* Panel — sits below the status bar and above the navigation bar,
          75% width from the right edge. */}
      <Animated.View
        style={[S.panelOuter, { top: insets.top, bottom: insets.bottom, right: 0, width: panelWidth }, panelStyle]}
        pointerEvents={isInteractive ? 'auto' : 'none'}
      >
        <View style={S.panelInner}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[S.scrollContent, { paddingBottom: 16 }]}
            onScrollBeginDrag={onScrollBeginDrag}            // R-8: removed `removeClippedSubviews`. It breaks Reanimated's
            // LinearTransition layout animations on Android \u2014 nodes that
            // get clipped during the animation lose their shared-element
            // identity and the animation snaps. The drawer content is small
            // enough (one screenful) that clipping savings are negligible.
          >
            {/* ── MENUJA ─────────────────────────────────────────── */}
            <Animated.View style={S.navCard} layout={LinearTransition.duration(220)}>
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

              {/* Category accordion — Reanimated entering/exiting drives expansion (UI thread) */}
              {lajmeExpanded && (
                <Animated.View
                  style={S.accordion}
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(160)}
                  layout={LinearTransition.duration(220)}
                >
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
                </Animated.View>
              )}
            </Animated.View>

            {/* ── TJETËR ─────────────────────────────────────────── */}
            <View style={[S.navCard, S.navCardSpaced]}>
              <Text style={S.sectionLabel}>TJETËR</Text>
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

            <View style={S.legalLinks}>
              <Pressable
                onPress={() => Linking.openURL('https://radiofontana.org/privacy').catch(() => undefined)}
                style={({ pressed }) => [S.legalLink, pressed && S.legalLinkPressed]}
              >
                <Text style={S.legalLinkText}>Politika e Privatësisë</Text>
              </Pressable>
              <Text style={S.legalDot}>·</Text>
              <Pressable
                onPress={() => Linking.openURL('https://radiofontana.org/terms').catch(() => undefined)}
                style={({ pressed }) => [S.legalLink, pressed && S.legalLinkPressed]}
              >
                <Text style={S.legalLinkText}>Kushtet e Shërbimit</Text>
              </Pressable>
            </View>
            <Text style={S.copyright}>© 2026 Radio Fontana · Të gjitha të drejtat e rezervuara</Text>
          </ScrollView>
        </View>
          {/* Scroll hint — fades away after first scroll */}
          <Animated.View style={[S.scrollHint, { bottom: 12 }, scrollHintStyle]} pointerEvents="box-none">
            <Pressable
              style={({ pressed }) => [S.scrollHintBtn, pressed && S.scrollHintBtnPressed]}
              onPress={() => scrollRef.current?.scrollTo({ y: 300, animated: true })}
              hitSlop={12}
            >
              <Ionicons name="chevron-down" size={18} color="#374151" />
            </Pressable>
          </Animated.View>
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  // Outer: elevation/shadow — NO overflow:hidden (Android blanks children)
  panelOuter: {
    position: 'absolute',
    backgroundColor: colors.surface,
    shadowColor: colors.navy,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: -6, height: 0 },
    elevation: 18,
    overflow: 'hidden',
    // No border radius — the panel fills edge-to-edge vertically so rounded
    // corners at the top/bottom would leave gaps at screen edges.
  },
  // Inner: flex fill — panelOuter handles clipping
  panelInner: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    // paddingTop / paddingBottom are applied dynamically using insets so
    // content clears the status bar and navigation bar.
  },

  // ── Nav cards ───────────────────────────────────────────────────────────────
  // MENUJA + TJETËR: warm red-tinted #fef2f2 — intentional, pairs with red accents
  navCard: {
    marginHorizontal: 10,
    marginTop: 10,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 14,
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  navCardSpaced: {
    marginTop: 8,
  },
  navCardWhite: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  sectionLabel: {
    paddingHorizontal: 10,
    paddingBottom: 4,
    color: colors.textTertiary,
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  sectionLabelDark: {
    color: colors.textTertiary,
  },

  // ── Nav items ───────────────────────────────────────────────────────────────
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  navItemActive: {
    backgroundColor: colors.redTint,
  },
  navItemPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 2.5,
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
    color: colors.text,
    fontFamily: fonts.uiMedium,
    fontSize: 14,
    letterSpacing: -0.2,
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
    height: 52,
    borderRadius: 12,
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

  scrollHint: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollHintBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  scrollHintBtnPressed: {
    backgroundColor: '#F3F4F6',
    transform: [{ scale: 0.92 }],
  },

  // ── Legal links ─────────────────────────────────────────────────────────────
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  legalLink: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  legalLinkPressed: {
    opacity: 0.55,
  },
  legalLinkText: {
    color: '#9CA3AF',
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    letterSpacing: 0.1,
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: '#D1D5DB',
    fontFamily: fonts.uiRegular,
    fontSize: 11,
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

