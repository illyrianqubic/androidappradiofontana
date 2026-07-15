import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { setAppIcon, getSavedAppIcon } from '../../services/app-icon';
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
import {
  Check,
  ChevronDown,
  ChevronUp,
  Home,
  Info,
  Moon,
  Newspaper,
  Phone,
  Radio,
  Sun,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDrawer } from '../../providers/DrawerProvider';
import { useTheme } from '../../providers/ThemeProvider';
import type { ThemeColors } from '../../providers/ThemeProvider';
import { fonts, radius, spacing } from '../../constants/tokens';
import { setPendingDrawerCategory } from '../../lib/drawerCategory';

const DrawerStylesContext = createContext<{ S: ReturnType<typeof getS>; colors: ThemeColors } | null>(null);

function useDrawerStyles() {
  const ctx = useContext(DrawerStylesContext);
  if (!ctx) throw new Error('useDrawerStyles must be used inside HamburgerDrawerInner');
  return ctx;
}

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
  { label: 'Instagram', url: 'https://www.instagram.com/rtvfontana' },
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
  const { colors, isDark, toggleTheme } = useTheme();
  const S = useMemo(() => getS(colors), [colors]);
  const { isOpen, close, progress } = useDrawer();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  const [isInteractive, setIsInteractive] = useState(false);
  const [lajmeExpanded, setLajmeExpanded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const [appIcon, setAppIconState] = useState<'light' | 'dark'>(() => {
    const saved = getSavedAppIcon();
    return saved;
  });

  const selectAppIcon = useCallback(async (value: 'light' | 'dark') => {
    // Dynamic icon switching is unsupported on iOS (see services/app-icon) —
    // no-op silently instead of showing a restart prompt for a feature that
    // cannot actually apply on this platform.
    if (Platform.OS !== 'android') return;
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Ndërrimi i Ikonës',
        'A dëshiron të ndërrosh ikonën e aplikacionit?',
        [
          { text: 'Anulo', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Vazhdo', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
    if (!confirmed) return;
    // AUDIT FIX (iOS): setAppIcon() can silently fail (e.g. iOS before the
    // CFBundleAlternateIcons EAS rebuild lands, or a native error) — check
    // its return value and revert the optimistic UI state instead of
    // showing a confirmed checkmark for an icon change that never happened.
    const previous = appIcon;
    setAppIconState(value);
    const succeeded = await setAppIcon(value);
    if (!succeeded) {
      setAppIconState(previous);
      Alert.alert('Gabim', 'Ndërrimi i ikonës dështoi. Provo përsëri.');
    }
  }, [appIcon]);

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

  // BUG FIX: category selection from the drawer while already on the news
  // screen should update params without a slide animation.  `router.push`
  // always pushes a new screen instance → slide-from-right.  Instead, if
  // we're already on a news route we use `router.setParams` (instant) and
  // only fall back to `router.navigate` (tab switch, no push) when coming
  // from a different tab.
  //
  // BUG FIX (cross-tab first tap): navigating from Home/Live to the news tab
  // by passing the category in the path string ('/news?category=...') can drop
  // the param on the first mount. We instead use the typed object form of
  // `router.navigate({ pathname: '/news', params: { category: slug } })` and
  // also write the intended slug to an in-memory fallback that news/index.tsx
  // reads on its initial mount.
  const navigateToCategory = useCallback((path: string) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setLajmeExpanded(false);
    close();
    if (pendingNavTimerRef.current) clearTimeout(pendingNavTimerRef.current);
    pendingNavTimerRef.current = setTimeout(() => {
      pendingNavTimerRef.current = null;
      const slugMatch = path.match(/\?category=([^&]+)/);
      const slug = slugMatch ? slugMatch[1] : '';
      const onNews = pathname === '/news' || pathname.startsWith('/news/') || pathname.startsWith('/(tabs)/news');
      if (onNews) {
        router.setParams(slug ? { category: slug } : { category: undefined });
      } else {
        setPendingDrawerCategory(slug);
        if (slug) {
          router.navigate({ pathname: '/news', params: { category: slug } } as never);
        } else {
          router.navigate('/news' as never);
        }
      }
      setTimeout(() => { isNavigatingRef.current = false; }, 200);
    }, CLOSE_DURATION + 40);
  }, [close, pathname, router]);

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

  return (
    <DrawerStylesContext.Provider value={{ S, colors }}>
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
                  icon={Home}
                  label="Kryefaqja"
                  detail="Pamja kryesore"
                  path="/(tabs)"
                  active={isHomeActive}
                  onNavigate={navigate}
                />
                <NavItem
                  icon={Radio}
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
                    <Newspaper size={18} color={isNewsActive ? colors.primary : colors.textMuted} strokeWidth={1.5} />
                  </View>
                  <View style={S.navTextWrap}>
                    <Text style={[S.navLabel, isNewsActive && S.navLabelActive]}>Lajme</Text>
                    <Text style={S.navDetail}>Kategoritë kryesore</Text>
                  </View>
                  {lajmeExpanded ? (
                    <ChevronUp size={14} color={isNewsActive ? colors.primary : colors.textTertiary} strokeWidth={1.5} />
                  ) : (
                    <ChevronDown size={14} color={isNewsActive ? colors.primary : colors.textTertiary} strokeWidth={1.5} />
                  )}
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
                      <CategoryAllButton onNavigate={navigateToCategory} />
                    </View>
                    <View style={S.categoryGrid}>
                      {LAJME_CATEGORIES.map((cat) => (
                        <CategoryRow key={cat.slug} slug={cat.slug} label={cat.label} onNavigate={navigateToCategory} />
                      ))}
                    </View>
                  </Animated.View>
                ) : null}
              </View>

              <View style={S.sectionCard}>
                <Text style={S.sectionLabel}>Stacioni</Text>
                <NavItem
                  icon={Info}
                  label="Rreth Nesh"
                  detail="Profili i radios"
                  path="/rreth-nesh"
                  active={isAboutActive}
                  onNavigate={navigate}
                />
                <NavItem
                  icon={Phone}
                  label="Na Kontakto"
                  detail="Telefon, email, rrjete"
                  path="/na-kontakto"
                  active={isContactActive}
                  onNavigate={navigate}
                />

                <View style={S.softDivider} />

                <ActionRow label="+383 44 150 027" action="Telefono" url="tel:+38344150027" />
                <View style={S.softDivider} />
                <ActionRow label="rtvfontana@gmail.com" action="Email" url="mailto:rtvfontana@gmail.com" />

                <View style={S.softDivider} />

                <View style={S.socialRow}>
                  {SOCIAL_LINKS.map((link) => (
                    <SocialIconButton key={link.label} label={link.label} url={link.url} />
                  ))}
                </View>
              </View>

              <View style={S.sectionCard}>
                <Text style={S.sectionLabel}>Cilësimet</Text>
                <Pressable
                  onPress={toggleTheme}
                  style={({ pressed }: { pressed: boolean }) => [
                    S.navRow,
                    pressed && S.rowPressed,
                  ]}
                >
                  <View style={S.navIconBox}>
                    {isDark ? (
                      <Moon size={18} color={colors.textMuted} strokeWidth={1.5} />
                    ) : (
                      <Sun size={18} color={colors.textMuted} strokeWidth={1.5} />
                    )}
                  </View>
                  <View style={S.navTextWrap}>
                    <Text style={S.navLabel}>{isDark ? 'Tema e Errët' : 'Tema e Çelur'}</Text>
                  </View>
                  <Switch
                    value={isDark}
                    onValueChange={toggleTheme}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={Platform.OS === 'ios' ? undefined : isDark ? colors.primary : colors.surface}
                  />
                </Pressable>

                <View style={S.softDivider} />

                <View style={S.iconPickerRow}>
                  <Pressable
                    onPress={() => selectAppIcon('light')}
                    style={({ pressed }) => [S.iconPickerBox, { backgroundColor: '#FFFFFF' }, appIcon === 'light' && { borderColor: colors.primary }, pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] }]}
                  >
                    <Image source={require('../../assets/images/logo-blue-transparent.png')} style={S.iconPickerImage} contentFit="contain" />
                    {appIcon === 'light' ? (
                      <View style={[S.iconPickerCheck, { backgroundColor: colors.primary }]}>
                        <Check size={12} color={colors.surface} strokeWidth={1.5} />
                      </View>
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={() => selectAppIcon('dark')}
                    style={({ pressed }) => [S.iconPickerBox, { backgroundColor: '#0B1220' }, appIcon === 'dark' && { borderColor: colors.primary }, pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] }]}
                  >
                    <Image source={require('../../assets/images/logo-white-transparent.png')} style={S.iconPickerImage} contentFit="contain" />
                    {appIcon === 'dark' ? (
                      <View style={[S.iconPickerCheck, { backgroundColor: colors.primary }]}>
                        <Check size={12} color={colors.surface} strokeWidth={1.5} />
                      </View>
                    ) : null}
                  </Pressable>
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
    </DrawerStylesContext.Provider>
  );
}

const openLink = async (url: string) => {
  try {
    // Open HTTPS links directly. canOpenURL requires extra Android
    // permissions and often returns false for valid https URLs, so we
    // skip the check and let the system handle the URL.
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      'Gabim',
      'Nuk mund të hapet kjo lidhje. Mund ta kopjosh manualisht:\n\n' + url,
      [{ text: 'OK' }],
      { cancelable: true },
    );
  }
};

const NavItem = memo(function NavItem({
  icon: Icon,
  label,
  detail,
  path,
  active = false,
  onNavigate,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  path: string;
  active?: boolean;
  onNavigate: (path: string) => void;
}) {
  const { S, colors } = useDrawerStyles();
  const handlePress = useCallback(() => onNavigate(path), [onNavigate, path]);
  const pressableStyle = useMemo(() => ({ pressed }: { pressed: boolean }) => [
    S.navRow,
    active && S.navRowActive,
    pressed && !active && S.rowPressed,
  ], [S, active]);
  return (
    <Pressable onPress={handlePress} style={pressableStyle}>
      {active ? <View style={S.activeRail} /> : null}
      <View style={[S.navIconBox, active && S.navIconBoxActive]}>
        <Icon size={18} color={active ? colors.primary : colors.textMuted} strokeWidth={1.5} />
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
  const { S } = useDrawerStyles();
  const handlePress = useCallback(() => openLink(url), [url]);
  return (
    <Pressable onPress={handlePress} style={({ pressed }: { pressed: boolean }) => [S.actionRow, pressed && S.rowPressed]}>
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
  const { S } = useDrawerStyles();
  const handlePress = useCallback(() => onNavigate('/(tabs)/news'), [onNavigate]);
  return (
    <Pressable onPress={handlePress} style={({ pressed }: { pressed: boolean }) => [S.categoryAllButton, pressed && S.categoryAllButtonPressed]}>
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
  const { S } = useDrawerStyles();
  const handlePress = useCallback(() => onNavigate(`/(tabs)/news?category=${slug}`), [onNavigate, slug]);
  return (
    <Pressable onPress={handlePress} style={({ pressed }: { pressed: boolean }) => [S.categoryRow, pressed && S.categoryRowPressed]}>
      <View style={S.categoryAccent} />
      <Text style={S.categoryLabel}>{label}</Text>
    </Pressable>
  );
});

const SocialIconButton = memo(function SocialIconButton({ label, url }: { label: string; url: string }) {
  const { S, colors } = useDrawerStyles();
  const handlePress = useCallback(() => openLink(url), [url]);
  const iconName = useMemo(() => {
    switch (label) {
      case 'Facebook': return 'logo-facebook' as const;
      case 'Instagram': return 'logo-instagram' as const;
      case 'YouTube': return 'logo-youtube' as const;
      case 'TikTok': return 'logo-tiktok' as const;
      default: return 'globe-outline' as const;
    }
  }, [label]);
  return (
    <Pressable onPress={handlePress} hitSlop={8} style={({ pressed }: { pressed: boolean }) => [
      S.socialIconBtn,
      pressed && S.socialIconBtnPressed,
    ]}>
      <View style={S.socialIconCircle}>
        <Ionicons name={iconName} size={18} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
});

const LegalLink = memo(function LegalLink({ label, url }: { label: string; url: string }) {
  const { S } = useDrawerStyles();
  const handlePress = useCallback(() => openLink(url), [url]);
  return (
    <Pressable onPress={handlePress} style={({ pressed }: { pressed: boolean }) => [S.legalLink, pressed && S.legalLinkPressed]}>
      <Text style={S.legalLinkText}>{label}</Text>
    </Pressable>
  );
});

const getS = (colors: ThemeColors) => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: `${colors.navyFixed}6B`,
  },
  panelOuter: {
    position: 'absolute',
    backgroundColor: colors.surfaceSubtle,
    // FIX: drawer panel shadow/elevation was casting a visible vertical line
    // on the right edge of the screen when the drawer was closed. Removing
    // the shadow keeps the panel clean and eliminates the bleed-through.
    overflow: 'hidden',
  },
  panelInner: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
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
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.navy,
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
    marginVertical: spacing.xs,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  socialIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialIconBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  socialIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
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
  iconPickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  iconPickerBox: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconPickerImage: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
  },
  iconPickerCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
