import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  FadeIn,
  FadeOut,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
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
const CLOSE_DURATION = 160;

export function HamburgerDrawer() {
  // Bug fix: previously this component deferred mounting the drawer tree
  // via InteractionManager.runAfterInteractions and unblocked it lazily on
  // first tap. On a busy home screen (FlashList grid, breaking ticker,
  // equalizer bars, weather query) the JS thread never reaches idle, so
  // runAfterInteractions never fires. The first hamburger tap then had to
  // (1) mount the entire drawer tree (~200 Pressables, Ionicons, multiple
  // Animated.Views) and (2) start the 220 ms slide-in animation in the
  // same frame. Fabric painted the first slide frame, the JS thread
  // stalled on the mount commit for several seconds, then Reanimated's
  // worklet caught up and jumped the panel to fully open — exactly the
  // "opens just a bit, then 5–6 s later opens all the way" symptom.
  //
  // The panel is invisible when closed (translateX = panelWidth,
  // pointerEvents="none"), so eager-mounting costs nothing visually but
  // turns the first tap into pure animation work.
  return <HamburgerDrawerInner />;
}

function HamburgerDrawerInner() {
  const { isOpen, close, progress } = useDrawer();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  const [isInteractive, setIsInteractive] = useState(false);
  const [lajmeExpanded, setLajmeExpanded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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

  // The slide animation itself is driven by DrawerProvider's open()/close()/
  // toggle() — those write to `progress` synchronously inside the press
  // handler, so the animation starts on the UI thread the same frame as the
  // tap, not after a React render commit. This effect only handles the
  // post-close cleanup (deactivating the touch overlay, collapsing submenu).
  useEffect(() => {
    if (isOpen) return undefined;
    const id = setTimeout(handleCloseComplete, CLOSE_DURATION + 60);
    return () => clearTimeout(id);
  }, [isOpen, handleCloseComplete]);

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
  }, [isOpen]);

  // Pending router.push timer from navigate(). Tracked so we can cancel it
  // on unmount (prevents stray push to a now-detached navigator).
  const pendingNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNavigatingRef = useRef(false);
  useEffect(() => () => {
    if (pendingNavTimerRef.current) {
      clearTimeout(pendingNavTimerRef.current);
      pendingNavTimerRef.current = null;
    }
  }, []);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [panelWidthSv.value, 0]) }],
  }));

  // Re-show the drawer once the pathname change has committed OR after a
  // short safety timeout (covers same-route navigations like tapping the
  // current page in the menu, where pathname never changes). By the time
  // this effect runs, the destination screen is mounted and isHidden flipping
  // back to false will not paint the (now-fully-closed, progress=0) panel on
  // top of it.

  const navigate = useCallback((path: string) => {
    // Reentry guard: rapid double-taps on a NavItem could otherwise queue
    // multiple router.push timers and stack the same screen twice.
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    // Play the full close slide-out FIRST, then navigate. The user sees the
    // menu close cleanly and only after that does the destination screen
    // appear — no overlap, no animation glitch on top of the new page.
    setLajmeExpanded(false);
    close();
    if (pendingNavTimerRef.current) clearTimeout(pendingNavTimerRef.current);
    pendingNavTimerRef.current = setTimeout(() => {
      pendingNavTimerRef.current = null;
      router.push(path as never);
      setTimeout(() => { isNavigatingRef.current = false; }, 200);
    }, CLOSE_DURATION + 40);
  }, [close, router]);

  const toggleLajme = useCallback(() => setLajmeExpanded((v) => !v), []);

  // Active-state derivation runs only when pathname actually changes, not on
  // every drawer re-render (e.g. open/close, isInteractive flips).
  const activeStates = useMemo(() => {
    const matchesSegment = (segment: string) =>
      pathname === segment || pathname.startsWith(`${segment}/`) || pathname.startsWith(`${segment}?`);
    return {
      isHomeActive: pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/',
      isLiveActive: matchesSegment('/live') || matchesSegment('/(tabs)/live'),
      isNewsActive: matchesSegment('/news') || matchesSegment('/(tabs)/news'),
      isAboutActive: matchesSegment('/rreth-nesh'),
      isContactActive: matchesSegment('/na-kontakto'),
    };
  }, [pathname]);
  const { isHomeActive, isLiveActive, isNewsActive, isAboutActive, isContactActive } = activeStates;

  // While navigating, the entire drawer subtree is unmounted so the UI thread
  // has nothing to draw — prevents the closing animation from being painted
  // on top of the destination screen.
  // (no longer hard-hidden; navigate() now waits for the close animation,
  //  so by the time router.push runs the panel is already off-screen)

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
          >
            <View style={S.sectionCard}>
              <Text style={S.sectionLabel}>Navigimi</Text>
              <NavItem
                icon="home-outline"
                label="Kryefaqja"
                detail="Pamja kryesore"
                path="/(tabs)"
                active={isHomeActive}
                onNavigate={navigate}
              />
              <NavItem
                icon="radio-outline"
                label="Drejtpërdrejt"
                detail="Radio live"
                path="/(tabs)/live"
                active={isLiveActive}
                onNavigate={navigate}
              />

              <Pressable
                onPress={toggleLajme}
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
                    <CategoryAllButton onNavigate={navigate} />
                  </View>
                  <View style={S.categoryGrid}>
                    {LAJME_CATEGORIES.map((cat) => (
                      <CategoryRow key={cat.slug} slug={cat.slug} label={cat.label} onNavigate={navigate} />
                    ))}
                  </View>
                </Animated.View>
              ) : null}
            </View>

            <View style={S.sectionCard}>
              <Text style={S.sectionLabel}>Stacioni</Text>
              <NavItem
                icon="information-circle-outline"
                label="Rreth Nesh"
                detail="Profili i radios"
                path="/rreth-nesh"
                active={isAboutActive}
                onNavigate={navigate}
              />
              <NavItem
                icon="call-outline"
                label="Na Kontakto"
                detail="Telefon, email, rrjete"
                path="/na-kontakto"
                active={isContactActive}
                onNavigate={navigate}
              />
            </View>

            <View style={S.contactCard}>
              <Text style={S.sectionLabel}>Studio</Text>
              <ActionRow label="+383 44 150 027" action="Telefono" url="tel:+38344150027" />
              <View style={S.softDivider} />
              <ActionRow label="rtvfontana@gmail.com" action="Email" url="mailto:rtvfontana@gmail.com" />
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
                  <SocialChip key={link.label} label={link.label} url={link.url} />
                ))}
              </View>
            </View>

            <View style={S.legalLinks}>
              <LegalLink label="Privatësia" url="https://radiofontana.org/privacy" />
              <Text style={S.legalDot}>·</Text>
              <LegalLink label="Kushtet" url="https://radiofontana.org/terms" />
            </View>
          </ScrollView>

        </View>
      </Animated.View>
    </View>
  );
}

// Stable Pressable style fns (defined once at module level so they aren't
// reallocated per render — React.memo on each row component then has a chance
// to actually skip re-renders when its props haven't changed).
const navRowStyleFor = (active: boolean) =>
  ({ pressed }: { pressed: boolean }) => [
    S.navRow,
    active && S.navRowActive,
    pressed && !active && S.rowPressed,
  ];
const actionRowStyle = ({ pressed }: { pressed: boolean }) => [S.actionRow, pressed && S.rowPressed];
const categoryAllStyle = ({ pressed }: { pressed: boolean }) => [S.categoryAllButton, pressed && S.categoryAllButtonPressed];
const categoryRowStyle = ({ pressed }: { pressed: boolean }) => [S.categoryRow, pressed && S.categoryRowPressed];
const socialChipStyle = ({ pressed }: { pressed: boolean }) => [S.socialChip, pressed && S.socialChipPressed];
const legalLinkStyle = ({ pressed }: { pressed: boolean }) => [S.legalLink, pressed && S.legalLinkPressed];

const openLink = (url: string) => Linking.openURL(url).catch(() => undefined);

const NavItem = memo(function NavItem({
  icon,
  label,
  detail,
  path,
  active = false,
  onNavigate,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  path: string;
  active?: boolean;
  onNavigate: (path: string) => void;
}) {
  const handlePress = useCallback(() => onNavigate(path), [onNavigate, path]);
  const pressableStyle = useMemo(() => navRowStyleFor(active), [active]);
  return (
    <Pressable onPress={handlePress} style={pressableStyle}>
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
});

const ActionRow = memo(function ActionRow({
  label,
  action,
  url,
}: {
  label: string;
  action: string;
  url: string;
}) {
  const handlePress = useCallback(() => openLink(url), [url]);
  return (
    <Pressable onPress={handlePress} style={actionRowStyle}>
      <Text numberOfLines={1} style={S.actionLabel}>{label}</Text>
      <Text style={S.actionText}>{action}</Text>
    </Pressable>
  );
});

const CategoryAllButton = memo(function CategoryAllButton({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  const handlePress = useCallback(() => onNavigate('/(tabs)/news'), [onNavigate]);
  return (
    <Pressable onPress={handlePress} style={categoryAllStyle}>
      <Text style={S.categoryAllText}>Të gjitha</Text>
    </Pressable>
  );
});

const CategoryRow = memo(function CategoryRow({
  slug,
  label,
  onNavigate,
}: {
  slug: string;
  label: string;
  onNavigate: (path: string) => void;
}) {
  const handlePress = useCallback(() => onNavigate(`/(tabs)/news?category=${slug}`), [onNavigate, slug]);
  return (
    <Pressable onPress={handlePress} style={categoryRowStyle}>
      <View style={S.categoryAccent} />
      <Text style={S.categoryLabel}>{label}</Text>
    </Pressable>
  );
});

const SocialChip = memo(function SocialChip({ label, url }: { label: string; url: string }) {
  const handlePress = useCallback(() => openLink(url), [url]);
  return (
    <Pressable onPress={handlePress} style={socialChipStyle}>
      <Text style={S.socialLabel}>{label}</Text>
    </Pressable>
  );
});

const LegalLink = memo(function LegalLink({ label, url }: { label: string; url: string }) {
  const handlePress = useCallback(() => openLink(url), [url]);
  return (
    <Pressable onPress={handlePress} style={legalLinkStyle}>
      <Text style={S.legalLinkText}>{label}</Text>
    </Pressable>
  );
});

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
});
