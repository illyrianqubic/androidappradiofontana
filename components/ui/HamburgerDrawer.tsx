import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  cancelAnimation,
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useDrawer } from '../../providers/DrawerProvider';
import { colors, fonts, radius, spacing } from '../../constants/tokens';

const LAJME_CATEGORIES = [
  { label: 'Politikë', slug: 'politike' },
  { label: 'Sport', slug: 'sport' },
  { label: 'Teknologji', slug: 'teknologji' },
  { label: 'Showbiz', slug: 'showbiz' },
  { label: 'Shëndetësi', slug: 'shendetesi' },
  { label: 'Biznes', slug: 'biznes' },
  { label: 'Nga Bota', slug: 'nga-bota' },
] as const;

const SOCIAL_LINKS = [
  { label: 'Facebook', url: 'https://www.facebook.com/rtvfontanalive' },
  { label: 'Instagram', url: 'https://www.instagram.com/rtvfontana/' },
  { label: 'YouTube', url: 'https://www.youtube.com/@RTVFontana' },
  { label: 'TikTok', url: 'https://www.tiktok.com/@rtvfontanalive' },
] as const;

const PANEL_MAX_W = 360;
const OPEN_EASING = Easing.out(Easing.poly(4));
const CLOSE_EASING = Easing.in(Easing.cubic);
const OPEN_DURATION = 220;
const CLOSE_DURATION = 160;

export function HamburgerDrawer() {
  const { isOpen } = useDrawer();
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (isOpen && !hasOpened) setHasOpened(true);
  }, [isOpen, hasOpened]);

  if (!hasOpened) return null;
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
  const panelWidth = Math.min(Math.round(windowWidth * 0.86), PANEL_MAX_W);

  // Bug fix 2: Guarantee the off-screen offset is never 0. A zero panelWidthSv
  // makes interpolate(0,[0,1],[0,0])=0, rendering the panel at translateX:0
  // (fully visible) whenever progress===0 — i.e. every time the drawer is closed.
  const panelWidthSv = useSharedValue(panelWidth > 0 ? panelWidth : PANEL_MAX_W);
  useEffect(() => {
    if (panelWidth > 0) panelWidthSv.value = panelWidth;
  }, [panelWidth, panelWidthSv]);

  const isOpenRef = useRef(isOpen);
  useLayoutEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // Activate the backdrop synchronously before paint so the closing tap-target
  // exists from the very first animation frame.
  useLayoutEffect(() => {
    if (isOpen) setIsInteractive(true);
  }, [isOpen]);

  // handleCloseComplete guards against the critical timing race:
  // When the close animation completes naturally (finished=true), its
  // runOnJS callback is queued on the UI thread and delivered to the JS
  // thread asynchronously. If the user re-opens before that message is
  // processed, useLayoutEffect already set isInteractive=true — but the
  // queued setIsInteractive(false) would then fire AFTER, leaving an
  // invisible full-screen Pressable blocking every touch ("menu appears
  // on its own"). Checking isOpenRef.current at call-time prevents the
  // stale false-write.
  const handleCloseComplete = useCallback(() => {
    if (!isOpenRef.current) {
      setIsInteractive(false);
      setLajmeExpanded(false);
    }
  }, []);

  // Slide animation.
  // setLajmeExpanded(false) is deferred to the close callback so a
  // LinearTransition never runs concurrently with the panel slide-out
  // on slow devices (Samsung Galaxy A-series).
  // The `finished` guard prevents handleCloseComplete from firing when
  // the close animation is cancelled mid-way (finished=false) — e.g.
  // when the user rapidly toggles the drawer.
  useEffect(() => {
    if (isOpen) {
      cancelAnimation(progress);
      progress.value = withTiming(1, { duration: OPEN_DURATION, easing: OPEN_EASING });
    } else {
      cancelAnimation(progress);
      progress.value = withTiming(0, { duration: CLOSE_DURATION, easing: CLOSE_EASING }, (finished) => {
        'worklet';
        if (finished) runOnJS(handleCloseComplete)();
      });
    }
    return () => { cancelAnimation(progress); };
    // progress and handleCloseComplete are stable refs; only isOpen should re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Belt-and-suspenders: explicit cancelAnimation suppresses the withTiming
  // callback entirely (Reanimated 3 design). If the user rapidly toggles the
  // drawer, the cleanup cancelAnimation may swallow handleCloseComplete, leaving
  // isInteractive stuck at true (invisible full-screen Pressable blocks touches).
  // This timeout guarantees reset CLOSE_DURATION+100ms after every close.
  useEffect(() => {
    if (isOpen) return undefined;
    const id = setTimeout(() => {
      if (!isOpenRef.current) {
        setIsInteractive(false);
        setLajmeExpanded(false);
      }
    }, CLOSE_DURATION + 100);
    return () => clearTimeout(id);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setShowScrollHint(true);
    scrollHintOpacity.value = withTiming(1, { duration: 260 });
  }, [isOpen, scrollHintOpacity]);

  const onScrollBeginDrag = () => {
    if (!showScrollHint) return;
    setShowScrollHint(false);
    scrollHintOpacity.value = withTiming(0, { duration: 220 });
  };

  const scrollHintStyle = useAnimatedStyle(() => ({
    opacity: scrollHintOpacity.value,
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [panelWidthSv.value, 0]) }],
  }));

  const navigate = (path: string) => {
    // Skip the slide-out: the page fade is the only motion the user sees.
    cancelAnimation(progress);
    progress.value = 0;
    setIsInteractive(false);
    close();
    router.push(path as never);
  };

  const isHomeActive = pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/';
  const isLiveActive = pathname.includes('/live');
  const isNewsActive = pathname.includes('/news');
  const isAboutActive = pathname.includes('/rreth-nesh');
  const isContactActive = pathname.includes('/na-kontakto');

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={isInteractive ? 'auto' : 'none'}>
      {/* Full-screen tap-to-close. Only mounted while the drawer is interactive
          so it can never become an invisible touch blocker when isInteractive
          is stuck in a half-open/half-closed state. */}
      {isInteractive ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessible={false}
        />
      ) : null}

      <Animated.View
        style={[S.backdrop, { top: insets.top, bottom: insets.bottom, left: 0, right: 0 }, backdropStyle]}
        pointerEvents="none"
      />

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
            contentContainerStyle={S.scrollContent}
            onScrollBeginDrag={onScrollBeginDrag}
          >
            <Animated.View style={S.sectionCard} layout={LinearTransition.duration(220)}>
              <Text style={S.sectionLabel}>Navigimi</Text>
              <NavItem
                icon="home-outline"
                label="Kryefaqja"
                detail="Pamja kryesore"
                active={isHomeActive}
                onPress={() => navigate('/(tabs)')}
              />
              <NavItem
                icon="radio-outline"
                label="Drejtpërdrejt"
                detail="Radio live"
                active={isLiveActive}
                onPress={() => navigate('/(tabs)/live')}
              />

              <Pressable
                onPress={() => setLajmeExpanded((v) => !v)}
                style={({ pressed }) => [
                  S.navRow,
                  isNewsActive && S.navRowActive,
                  pressed && !isNewsActive && S.rowPressed,
                ]}
              >
                {isNewsActive ? <View style={S.activeRail} /> : null}
                <View style={[S.navIconBox, isNewsActive && S.navIconBoxActive]}>
                  <Ionicons name="newspaper-outline" size={18} color={isNewsActive ? colors.primary : colors.textMuted} />
                </View>
                <View style={S.navTextWrap}>
                  <Text style={[S.navLabel, isNewsActive && S.navLabelActive]}>Lajme</Text>
                  <Text style={S.navDetail}>Kategoritë kryesore</Text>
                </View>
                <Ionicons
                  name={lajmeExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={isNewsActive ? colors.primary : colors.textTertiary}
                />
              </Pressable>

              {lajmeExpanded ? (
                <Animated.View
                  style={S.categoryPanel}
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(150)}
                  layout={LinearTransition.duration(220)}
                >
                  <View style={S.categoryHeader}>
                    <Text style={S.categoryHeaderLabel}>Zgjidh rubrikën</Text>
                    <Pressable
                      onPress={() => navigate('/(tabs)/news')}
                      style={({ pressed }) => [S.categoryAllButton, pressed && S.categoryAllButtonPressed]}
                    >
                      <Text style={S.categoryAllText}>Të gjitha</Text>
                    </Pressable>
                  </View>
                  <View style={S.categoryGrid}>
                    {LAJME_CATEGORIES.map((cat) => (
                      <Pressable
                        key={cat.slug}
                        onPress={() => navigate(`/(tabs)/news?category=${cat.slug}`)}
                        style={({ pressed }) => [S.categoryRow, pressed && S.categoryRowPressed]}
                      >
                        <View style={S.categoryAccent} />
                        <Text style={S.categoryLabel}>{cat.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </Animated.View>
              ) : null}
            </Animated.View>

            <View style={S.sectionCard}>
              <Text style={S.sectionLabel}>Stacioni</Text>
              <NavItem
                icon="information-circle-outline"
                label="Rreth Nesh"
                detail="Profili i radios"
                active={isAboutActive}
                onPress={() => navigate('/rreth-nesh')}
              />
              <NavItem
                icon="call-outline"
                label="Na Kontakto"
                detail="Telefon, email, rrjete"
                active={isContactActive}
                onPress={() => navigate('/na-kontakto')}
              />
            </View>

            <View style={S.contactCard}>
              <Text style={S.sectionLabel}>Studio</Text>
              <ActionRow
                label="+383 44 150 027"
                action="Telefono"
                onPress={() => Linking.openURL('tel:+38344150027').catch(() => undefined)}
              />
              <View style={S.softDivider} />
              <ActionRow
                label="rtvfontana@gmail.com"
                action="Email"
                onPress={() => Linking.openURL('mailto:rtvfontana@gmail.com').catch(() => undefined)}
              />
              <View style={S.softDivider} />
              <View style={S.statusRow}>
                <Text style={S.statusText}>08:00 - 20:00</Text>
                <Text style={S.statusBadge}>AKTIV</Text>
              </View>
            </View>

            <View style={S.socialCard}>
              <View style={S.socialHeader}>
                <Text style={S.sectionLabel}>Kanale zyrtare</Text>
                <Text style={S.socialHint}>4 rrjete</Text>
              </View>
              <View style={S.socialGrid}>
                {SOCIAL_LINKS.map((link) => (
                  <Pressable
                    key={link.label}
                    onPress={() => Linking.openURL(link.url).catch(() => undefined)}
                    style={({ pressed }) => [S.socialChip, pressed && S.socialChipPressed]}
                  >
                    <Text style={S.socialLabel}>{link.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={S.legalLinks}>
              <Pressable
                onPress={() => Linking.openURL('https://radiofontana.org/privacy').catch(() => undefined)}
                style={({ pressed }) => [S.legalLink, pressed && S.legalLinkPressed]}
              >
                <Text style={S.legalLinkText}>Privatësia</Text>
              </Pressable>
              <Text style={S.legalDot}>·</Text>
              <Pressable
                onPress={() => Linking.openURL('https://radiofontana.org/terms').catch(() => undefined)}
                style={({ pressed }) => [S.legalLink, pressed && S.legalLinkPressed]}
              >
                <Text style={S.legalLinkText}>Kushtet</Text>
              </Pressable>
            </View>
          </ScrollView>

          <Animated.View style={[S.scrollHint, scrollHintStyle]} pointerEvents="box-none">
            <Pressable
              style={({ pressed }) => [S.scrollHintBtn, pressed && S.scrollHintBtnPressed]}
              onPress={() => scrollRef.current?.scrollTo({ y: 320, animated: true })}
              hitSlop={12}
            >
              <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

function NavItem({
  icon,
  label,
  detail,
  active = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        S.navRow,
        active && S.navRowActive,
        pressed && !active && S.rowPressed,
      ]}
    >
      {active ? <View style={S.activeRail} /> : null}
      <View style={[S.navIconBox, active && S.navIconBoxActive]}>
        <Ionicons name={icon} size={18} color={active ? colors.primary : colors.textMuted} />
      </View>
      <View style={S.navTextWrap}>
        <Text style={[S.navLabel, active && S.navLabelActive]}>{label}</Text>
        <Text style={S.navDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function ActionRow({
  label,
  action,
  onPress,
}: {
  label: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [S.actionRow, pressed && S.rowPressed]}>
      <Text numberOfLines={1} style={S.actionLabel}>{label}</Text>
      <Text style={S.actionText}>{action}</Text>
    </Pressable>
  );
}

const S = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.42)',
  },
  panelOuter: {
    position: 'absolute',
    backgroundColor: '#F6F7F9',
    shadowColor: colors.navy,
    shadowOpacity: 0.20,
    shadowRadius: 24,
    shadowOffset: { width: -8, height: 0 },
    elevation: 20,
    overflow: 'hidden',
  },
  panelInner: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },
  scrollContent: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sectionCard: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  navRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: 17,
    position: 'relative',
    overflow: 'hidden',
  },
  navRowActive: {
    backgroundColor: colors.redTint,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  activeRail: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  navIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  navIconBoxActive: {
    backgroundColor: colors.surface,
    borderColor: colors.redBorder,
  },
  navTextWrap: {
    flex: 1,
  },
  navLabel: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 14,
    lineHeight: 19,
  },
  navLabelActive: {
    color: colors.primary,
  },
  navDetail: {
    marginTop: 1,
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 11,
    lineHeight: 16,
  },
  categoryPanel: {
    marginTop: spacing.sm,
    marginLeft: spacing.sm,
    marginRight: spacing.xs,
    padding: spacing.sm,
    borderRadius: 20,
    backgroundColor: '#FBFCFE',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  categoryHeaderLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  categoryAllButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.redTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.redBorder,
  },
  categoryAllButtonPressed: {
    opacity: 0.72,
  },
  categoryAllText: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 11,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryRow: {
    minWidth: '47%',
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  categoryRowPressed: {
    backgroundColor: colors.redTint,
    borderColor: colors.redBorder,
  },
  categoryAccent: {
    width: 4,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    opacity: 0.72,
  },
  categoryLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 12,
    lineHeight: 18,
  },
  contactCard: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: 15,
  },
  actionLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.uiMedium,
    fontSize: 13,
  },
  actionText: {
    minWidth: 62,
    textAlign: 'right',
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 12,
  },
  softDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  statusRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  statusText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 13,
  },
  statusBadge: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: 0.7,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.redTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.redBorder,
  },
  socialCard: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  socialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  socialHint: {
    color: colors.textTertiary,
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    paddingRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  socialChip: {
    flex: 1,
    minWidth: '46%',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  socialChipPressed: {
    backgroundColor: colors.redTint,
  },
  socialLabel: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 12,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
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
    color: colors.textTertiary,
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: colors.textFaint,
    fontFamily: fonts.uiRegular,
    fontSize: 11,
  },
  copyright: {
    color: colors.textFaint,
    fontFamily: fonts.uiRegular,
    fontSize: 10,
    letterSpacing: 0.2,
    marginTop: spacing.md,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scrollHintBtnPressed: {
    backgroundColor: colors.surfaceSubtle,
    transform: [{ scale: 0.94 }],
  },
});
