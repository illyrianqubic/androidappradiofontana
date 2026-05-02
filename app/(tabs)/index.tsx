import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  InteractionManager,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { HamburgerButton } from '../../components/ui/HamburgerButton';
import { RelativeTime } from '../../components/ui/RelativeTime';
import { RefreshStatusBanner } from '../../components/ui/RefreshStatusBanner';
import { isBreakingBadgeVisible } from '../../lib/breakingBadge';
import { SkeletonCard } from '../../components/news/SkeletonCard';

// AUDIT FIX P8.32: module-level constants — not reallocated per render.
// Hoisted to the top of the module so every closure that references them
// (LatestNewsHeader's useMemo, etc.) sees the binding regardless of where
// the consuming component is declared in the file.
const ALBANIAN_DAYS = ['e diel', 'e hënë', 'e martë', 'e mërkurë', 'e enjte', 'e premte', 'e shtunë'];
const ALBANIAN_MONTHS = ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'];
import { appIdentity, colors, fonts } from '../../constants/tokens';
import { ms, s } from '../../lib/responsive';
import { queueImagePrefetch } from '../../lib/prefetchQueue';
import {
  buildSanityImageUrl,
  defaultThumbhash,
  fetchBreakingPosts,
  fetchHeroPost,
  fetchLatestPosts,
  fetchLocalPosts,
  fetchPostBySlug,
  sanityImageWidths,
  type Post,
} from '../../services/api';

const BREAKING_H = 44;
const CURRENT_YEAR = new Date().getFullYear();
const DISABLE_MAINTAIN_VISIBLE_CONTENT_POSITION = { disabled: true } as const;

type LatestGridItem = Post | { _skeleton: string };
function isSkeletonItem(item: LatestGridItem): item is { _skeleton: string } {
  return '_skeleton' in item;
}

// ── Weather ────────────────────────────────────────────────────────────────────
type WeatherResponse = {
  current: { temperature_2m: number; weathercode: number; windspeed_10m: number };
};

function wInfo(code: number): { label: string; icon: keyof typeof Ionicons.glyphMap } {
  if (code === 0)  return { label: 'E kthjellët',      icon: 'sunny-outline'        };
  if (code <= 3)   return { label: 'Me re të lehta',   icon: 'partly-sunny-outline' };
  if (code <= 48)  return { label: 'Mjegull',           icon: 'cloud-outline'        };
  if (code <= 57)  return { label: 'Vesë e lehtë',      icon: 'rainy-outline'        };
  if (code <= 67)  return { label: 'Shi',               icon: 'rainy-outline'        };
  if (code <= 77)  return { label: 'Borë',              icon: 'snow-outline'         };
  if (code <= 82)  return { label: 'Rrebeshe shi',      icon: 'thunderstorm-outline' };
  return                  { label: 'Stuhi',             icon: 'thunderstorm-outline' };
}

async function fetchWeatherIstog(signal?: AbortSignal): Promise<WeatherResponse> {
  const res = await fetch(
    'https://api.open-meteo.com/v1/forecast?latitude=42.78&longitude=20.48&current=temperature_2m,weathercode,windspeed_10m&timezone=Europe%2FBelgrade',
    { signal },
  );
  if (!res.ok) throw new Error('weather');
  return res.json() as Promise<WeatherResponse>;
}

// ── WeatherWidget ──────────────────────────────────────────────────────────────
const WeatherWidget = memo(function WeatherWidget() {
  // M30: pause weather polling when the app is backgrounded so the 15-min
  // timer doesn't wake the JS thread (and trigger a persisted-cache write)
  // while the user is in another app.
  const [isAppForeground, setIsAppForeground] = useState(
    AppState.currentState === 'active',
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setIsAppForeground(next === 'active');
    });
    return () => sub.remove();
  }, []);
  const [canFetchWeather, setCanFetchWeather] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCanFetchWeather(true), 300);
    return () => clearTimeout(t);
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['weather-istog'],
    queryFn: ({ signal }) => fetchWeatherIstog(signal),
    enabled: isAppForeground && canFetchWeather,
    staleTime: 30 * 60 * 1000,
    // Auto-refresh every 15 minutes so users coming back to a stale home tab
    // see fresh conditions without needing a pull-to-refresh.
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const reveal = useSharedValue(0);
  useEffect(() => {
    if (data) reveal.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) });
  }, [data, reveal]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * 10 }],
  }));

  if (isError) return null;

  const info = data ? wInfo(data.current.weathercode) : null;

  return (
    <View style={styles.weatherCard}>
      <View style={styles.weatherInner}>
        {/* Decorative depth circles */}
        <View style={styles.weatherCircle} />
        <View style={styles.weatherCircle2} />

        {/* Header: location + live pill */}
        <View style={styles.weatherTopRow}>
          <View>
            <Text style={styles.weatherCity}>Istog, Kosovë</Text>
            <View style={styles.weatherLivePill}>
              <View style={styles.weatherLiveDot} />
              <Text style={styles.weatherSub}>Mësoni moti tani</Text>
            </View>
          </View>
          {isLoading || !data ? (
            <View style={styles.weatherIconPlaceholder} />
          ) : (
            <Ionicons name={info!.icon} size={36} color="#1a1a1a" />
          )}
        </View>

        {/* Data row */}
        {isLoading || !data ? (
          <View style={styles.weatherDataSkeleton} />
        ) : (
          <Animated.View style={[styles.weatherDataRow, revealStyle]}>
            <Text style={styles.weatherTemp}>{Math.round(data.current.temperature_2m)}°</Text>
            <View style={styles.weatherDivider} />
            <View style={styles.weatherRight}>
              <Text style={styles.weatherCondition}>{info?.label}</Text>
              <View style={styles.weatherWindRow}>
                <Ionicons name="flag-outline" size={12} color="#9ca3af" />
                <Text style={styles.weatherWind}>
                  {Math.round(data.current.windspeed_10m)} km/h erë
                </Text>
              </View>
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
});

// ── BreakingTicker ─────────────────────────────────────────────────────────────
// PROFILING FIX (round 2): a custom equality comparator on the memo wrapper
// stops re-renders when the breaking-posts query refetches and returns a NEW
// array reference but with the same titles. Without this, every refetch
// (focus / interval / pull-to-refresh) busted memo and re-mounted the
// marquee worklets even though nothing visible changed.
type BreakingItem = { title: string; slug: string };

function headlinesEqual(
  prev: { headlines: BreakingItem[] },
  next: { headlines: BreakingItem[] },
): boolean {
  const a = prev.headlines;
  const b = next.headlines;
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].title !== b[i].title || a[i].slug !== b[i].slug) return false;
  }
  return true;
}

const BreakingTicker = memo(function BreakingTicker({ headlines }: { headlines: BreakingItem[] }) {
  // Early-return when there are no headlines: skip mounting the inner ticker
  // entirely so the infinite marquee worklets never run on cold home.
  if (headlines.length === 0) {
    return null;
  }
  return <BreakingTickerInner headlines={headlines} />;
}, headlinesEqual);

function BreakingTickerInner({ headlines }: { headlines: BreakingItem[] }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const reducedMotion = useReducedMotion();

  const isFocusedRef = useRef(isFocused);
  const reducedMotionRef = useRef(reducedMotion);
  useLayoutEffect(() => { isFocusedRef.current = isFocused; }, [isFocused]);
  useLayoutEffect(() => { reducedMotionRef.current = reducedMotion; }, [reducedMotion]);

  // currentIndex: which headline is currently scrolling.
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const headlinesRef = useRef(headlines);
  headlinesRef.current = headlines;

  const translateX = useSharedValue(0);
  const viewportWidthRef = useRef(0);
  const textWidthRef = useRef(0);

  // Reset to index 0 when the breaking-headlines set changes (e.g. after a refresh).
  const prevHeadlineIdsRef = useRef('');
  useEffect(() => {
    const ids = headlines.map((h) => h.slug).join(',');
    if (ids === prevHeadlineIdsRef.current) return;
    prevHeadlineIdsRef.current = ids;
    currentIndexRef.current = 0;
    setCurrentIndex(0);
  }, [headlines]);

  const currentHeadline = headlines[Math.min(currentIndex, headlines.length - 1)];

  const onPressTicker = useCallback(() => {
    const slug = currentHeadline?.slug;
    if (!slug) return;
    (navigation as never as { navigate: (s: string, p: object) => void })
      .navigate('news', { screen: '[slug]', params: { slug } });
  }, [navigation, currentHeadline]);

  // Forward-declare startAnim ref so advanceToNext can call it for the single-headline loop.
  const startAnimRef = useRef<() => void>(() => undefined);

  const advanceToNext = useCallback(() => {
    const count = headlinesRef.current.length;
    if (count === 0) return;
    const current = Math.min(currentIndexRef.current, count - 1);
    const next = (current + 1) % count;
    currentIndexRef.current = next;
    if (next === current) {
      // Only one headline — restart animation directly without a state change
      // (setCurrentIndex(same) would be a no-op and the effect would not re-run).
      startAnimRef.current();
    } else {
      setCurrentIndex(next);
    }
  }, []);

  const startAnim = useCallback(() => {
    const vw = viewportWidthRef.current;
    const tw = textWidthRef.current;
    if (!vw || !tw || !isFocusedRef.current || reducedMotionRef.current) return;
    cancelAnimation(translateX);
    translateX.value = vw;
    const duration = ((vw + tw) / 50) * 1000;
    translateX.value = withTiming(-tw, { duration, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(advanceToNext)();
    });
  }, [translateX, advanceToNext]);

  // Keep the ref in sync so advanceToNext can always call the latest startAnim.
  startAnimRef.current = startAnim;

  // When the displayed headline changes: park text off-screen right and restart.
  // Do NOT reset textWidthRef — if width is already known start immediately;
  // onTextLayout will fire and correct it if the new headline has a different width.
  useEffect(() => {
    cancelAnimation(translateX);
    if (viewportWidthRef.current) {
      translateX.value = viewportWidthRef.current;
      if (textWidthRef.current) startAnim();
    }
  }, [currentIndex, translateX, startAnim]);

  // Pause / resume on tab-focus or reduced-motion changes.
  useEffect(() => {
    if (!isFocused || reducedMotion) {
      cancelAnimation(translateX);
      return;
    }
    if (viewportWidthRef.current && textWidthRef.current) startAnim();
  }, [isFocused, reducedMotion, translateX, startAnim]);

  const onViewportLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w === viewportWidthRef.current) return;
    viewportWidthRef.current = w;
    if (textWidthRef.current) {
      startAnim();
    } else {
      // Park text off-screen right while waiting for text measurement.
      translateX.value = w;
    }
  }, [startAnim, translateX]);

  // Measured directly on the animated Text so the width is always consistent
  // with the element being translated — no separate off-screen clone needed.
  const onTextLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w === textWidthRef.current) return;
    textWidthRef.current = w;
    if (viewportWidthRef.current) startAnim();
  }, [startAnim]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!currentHeadline) return null;

  return (
    <View style={styles.breakingStrip}>
      <View style={styles.breakingLabel}>
        <Text style={styles.breakingLabelText}>LAJM I FUNDIT</Text>
      </View>
      <Pressable
        onPress={onPressTicker}
        hitSlop={4}
        style={styles.breakingViewport}
        onLayout={onViewportLayout}
      >
        {/* Single headline — width measured here directly so animation uses the exact same value */}
        <Animated.View style={[styles.breakingTickerRow, animStyle]}>
          <Text onLayout={onTextLayout} style={styles.breakingTickerText}>
            {currentHeadline.title}
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

function samePreviewPost(a: Post, b: Post): boolean {
  return (
    a._id === b._id &&
    a.slug === b.slug &&
    a.title === b.title &&
    a.excerpt === b.excerpt &&
    a.publishedAt === b.publishedAt &&
    a.breaking === b.breaking &&
    a.mainImageUrl === b.mainImageUrl &&
    a.thumbhash === b.thumbhash &&
    a.author === b.author &&
    (a.categories?.[0] ?? 'Lajme') === (b.categories?.[0] ?? 'Lajme')
  );
}

// ── HeroCard ───────────────────────────────────────────────────────────────────
const HeroCard = memo(function HeroCard({
  hero,
  heroImageUri,
  onPress,
}: {
  hero: Post;
  heroImageUri: string | null;
  onPress: (post: Post) => void;
}) {
  const cat = hero.categories?.[0] ?? 'Lajme';

  return (
    <View style={styles.heroOuter}>
      <Pressable
        onPress={() => onPress(hero)}
        style={styles.heroCard}
      >
        {/* Image — cinematic 16:10, no overlays */}
        <View style={styles.heroImageWrap}>
          <Image
            source={heroImageUri ? { uri: heroImageUri } : undefined}
            placeholder={{ thumbhash: hero.thumbhash || defaultThumbhash }}
            // AUDIT FIX P4.14: hero is the LCP element on home — fetch first.
            priority="high"
            recyclingKey={hero._id}
            contentFit="cover"
            transition={0}
            style={styles.heroImage}
          />
          <View style={styles.heroImageDivider} />
        </View>

        {/* White editorial content — red left border is the premium signature */}
        <View style={styles.heroContent}>
          {isBreakingBadgeVisible(hero.breaking, hero.publishedAt) ? (
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>LAJM I FUNDIT</Text>
            </View>
          ) : null}
          <Text style={styles.heroKicker} numberOfLines={1}>{cat.toUpperCase()}</Text>
          <Text numberOfLines={3} style={styles.heroHeadline}>{hero.title}</Text>
          {hero.excerpt ? (
            <Text numberOfLines={2} style={styles.heroDeck}>{hero.excerpt}</Text>
          ) : null}
          <View style={styles.heroMetaRow}>
            <RelativeTime timestamp={hero.publishedAt} style={styles.heroMetaText} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}, (prev, next) =>
  prev.onPress === next.onPress &&
  prev.heroImageUri === next.heroImageUri &&
  samePreviewPost(prev.hero, next.hero),
);

// ── LocalCard (compact overlay card for horizontal rail) ──────────────────────
const LocalCard = memo(function LocalCard({ post, onPress }: { post: Post; onPress: (p: Post) => void }) {
  const imageUri = useMemo(
    () => buildSanityImageUrl(post.mainImageUrl, sanityImageWidths.feedThumb),
    [post.mainImageUrl],
  );

  return (
    <View style={styles.localOuter}>
      <Pressable
        onPress={() => onPress(post)}
        style={styles.localCard}
      >
        <View style={styles.localImageWrap}>
          <Image
            source={imageUri ? { uri: imageUri } : undefined}
            placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
            recyclingKey={post._id}
            contentFit="cover"
            transition={0}
            style={styles.localImage}
          />
          <View style={styles.localImageDivider} />
        </View>
        <View style={styles.localBody}>
          <Text style={styles.localCatText} numberOfLines={1}>
            {(post.categories?.[0] ?? 'Lajme').toUpperCase()}
          </Text>
          <Text numberOfLines={3} style={styles.localTitle}>{post.title}</Text>
          <RelativeTime timestamp={post.publishedAt} style={styles.localTime} />
        </View>
      </Pressable>
    </View>
  );
}, (prev, next) =>
  prev.onPress === next.onPress &&
  samePreviewPost(prev.post, next.post),
);

// ── SectionHeader (reusable inside header/footer) ─────────────────────────────
const SectionHeader = memo(function SectionHeader({
  title,
  onSeeAll,
}: {
  title: string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <View style={styles.sectionAccent} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={styles.seeAll}>Shiko të gjitha →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}, (prev, next) =>
  prev.title === next.title &&
  prev.onSeeAll === next.onSeeAll,
);

// ── LatestNewsHeader — bespoke editorial masthead for the main feed ──────────
// Why a separate component (not the generic SectionHeader): the "Lajmet e
// Fundit" grid IS the home feed. It deserves a true editorial banner: a
// kicker, a serif title, a live "lapsi nën dorë" pulse, an article counter
// and today's date — the kind of treatment a print masthead earns above the
// fold. The pulse uses the existing reanimated import; opacity-only worklets
// stay on the UI thread and cost ~0.05 ms/frame on Cortex-A53.
const LatestNewsHeader = memo(function LatestNewsHeader({
  count,
  onSeeAll,
}: {
  count: number;
  onSeeAll?: () => void;
}) {
  const pulse = useSharedValue(0.4);
  // AUDIT FIX P3.10 + P8.28: cancel the pulse worklet on unmount or when
  // the Home tab loses focus, and respect prefers-reduced-motion.
  // Previously withRepeat ran for the entire app lifetime.
  const isFocused = useIsFocused();
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!isFocused || reducedMotion) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100 }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, isFocused, reducedMotion]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // Albanian short date: "e martë, 28 prill" — built once per render.
  const dateLabel = useMemo(() => {
    const d = new Date();
    return `${ALBANIAN_DAYS[d.getDay()]}, ${d.getDate()} ${ALBANIAN_MONTHS[d.getMonth()]}`;
  }, []);

  return (
    <View style={styles.latestHeader}>
      {/* Top: kicker + live pulse + date */}
      <View style={styles.latestTopRow}>
        <View style={styles.latestKickerGroup}>
          <Animated.View style={[styles.latestPulse, pulseStyle]} />
          <Text style={styles.latestKicker}>NË VAZHDIM</Text>
        </View>
        <Text style={styles.latestDate}>{dateLabel}</Text>
      </View>

      {/* Title + serif underline rule */}
      <View style={styles.latestTitleRow}>
        <Text style={styles.latestTitle}>Lajmet e Fundit</Text>
      </View>

      {/* Subhead with see-all on the same line */}
      <View style={styles.latestSubRow}>
        <Text style={styles.latestSubhead}>
          Përditësimet më të reja editoriale nga RTV Fontana
        </Text>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={10} style={styles.latestSeeAll}>
            <Text style={styles.latestSeeAllText}>Të gjitha</Text>
            <Ionicons name="arrow-forward" size={13} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      {/* Editorial divider — heavy line over hairline (newsprint masthead) */}
      <View style={styles.latestRuleHeavy} />
      <View style={styles.latestRuleHair} />
    </View>
  );
}, (prev, next) =>
  prev.count === next.count &&
  prev.onSeeAll === next.onSeeAll,
);

// ── GridItem (memoized) ──────────────────────────────────────────────────────
const GridItem = memo(function GridItem({
  item,
  isLeft,
  onPress,
}: {
  item: Post;
  isLeft: boolean;
  onPress: (p: Post) => void;
}) {
  const imageUri = useMemo(
    () => buildSanityImageUrl(item.mainImageUrl, sanityImageWidths.feedCard),
    [item.mainImageUrl],
  );
  const isFresh = useMemo(() => {
    if (!item.publishedAt) return false;
    const ageMin = (Date.now() - new Date(item.publishedAt).getTime()) / 60000;
    return ageMin >= 0 && ageMin < 60;
  }, [item.publishedAt]);
  return (
    <View style={[styles.gridColumn, isLeft ? styles.gridColLeft : styles.gridColRight]}>
      <Pressable
        onPress={() => onPress(item)}
        style={styles.gridCard}
      >
          {/* 16:9 image — text never overlaid */}
          <View style={styles.gridImgWrap}>
            <Image
              source={imageUri ? { uri: imageUri } : undefined}
              placeholder={{ thumbhash: item.thumbhash || defaultThumbhash }}
              recyclingKey={item._id}
              contentFit="cover"
              transition={0}
              style={styles.gridImg}
            />
          </View>
          <View style={styles.gridBody}>
            {isBreakingBadgeVisible(item.breaking, item.publishedAt) ? (
              <View style={styles.gridBadge}>
                <Text style={styles.gridBadgeText}>LAJM I FUNDIT</Text>
              </View>
            ) : null}
            <View style={styles.gridCatRow}>
              <Text numberOfLines={1} style={styles.gridCatText}>
                {(item.categories?.[0] ?? 'Lajme').toUpperCase()}
              </Text>
              {isFresh ? <Text style={styles.gridFreshText}>I RI</Text> : null}
            </View>
            <Text numberOfLines={3} style={styles.gridTitle}>{item.title}</Text>
            <RelativeTime timestamp={item.publishedAt} style={styles.gridTime} />
          </View>
        </Pressable>
    </View>
  );
}, (prev, next) =>
  prev.isLeft === next.isLeft &&
  prev.onPress === next.onPress &&
  samePreviewPost(prev.item, next.item),
);

// ── SearchResultCard (memoized) — used by virtualized search overlay ─────────
const SearchResultCard = memo(function SearchResultCard({
  item,
  onPress,
}: {
  item: Post;
  onPress: (p: Post) => void;
}) {
  // M27: thumbnails standardized at 480px wide.
  const imageUri = useMemo(
    () => (item.mainImageUrl ? buildSanityImageUrl(item.mainImageUrl, sanityImageWidths.feedThumb) : undefined),
    [item.mainImageUrl],
  );
  return (
    <Pressable
      style={styles.searchResultCard}
      onPress={() => onPress(item)}
    >
      <Image
        source={imageUri ? { uri: imageUri } : undefined}
        placeholder={{ thumbhash: item.thumbhash || defaultThumbhash }}
        recyclingKey={item._id}
        contentFit="cover"
        transition={0}
        style={styles.searchResultImg}
      />
      <View style={styles.searchResultBody}>
        <Text numberOfLines={1} style={styles.searchResultCat}>
          {item.categories?.[0] ?? 'Lajme'}
        </Text>
        <Text numberOfLines={2} style={styles.searchResultTitle}>{item.title}</Text>
        {item.excerpt ? (
          <Text numberOfLines={2} style={styles.searchResultExcerpt}>
            {item.excerpt}
          </Text>
        ) : null}
      </View>
      </Pressable>
  );
}, (prev, next) =>
  prev.onPress === next.onPress &&
  samePreviewPost(prev.item, next.item),
);

// ── RadioLiveBanner ────────────────────────────────────────────────────────────
const RadioLiveBanner = memo(function RadioLiveBanner({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.radioCard, pressed && styles.radioCardPressed]}
    >
      {/* Left red accent bar */}
      <View style={styles.radioAccentBar} />

      {/* Text stack */}
      <View style={styles.radioBody}>
        <Text style={styles.radioEyebrow}>RADIO LIVE</Text>

        <View style={styles.radioStationRow}>
          <View style={styles.radioStationText}>
            <Text style={styles.radioName}>RTV Fontana</Text>
            <Text style={styles.radioMeta}>98.8 FM · Istog, Kosovë</Text>
          </View>

          {/* Icon block */}
          <View style={styles.radioIconBlock}>
            <Ionicons name="radio-outline" size={s(28)} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.radioRule} />

        <View style={styles.radioCtaRow}>
          <Text style={styles.radioCta}>Dëgjo radion live tani</Text>
          <Ionicons name="arrow-forward" size={s(13)} color="#dc2626" />
        </View>
      </View>
    </Pressable>
  );
});

// ── HomeScreen ─────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // µ-2: 300 ms debounce for the search input. Without it, every keystroke
  // re-runs filteredData.filter() over the full latest list AND triggers
  // FlashList to re-measure + recycle. On Cortex-A53 a 12-item filter is
  // ~4 ms but the FlashList recycle pass adds 8\u201316 ms \u2014 enough that fast
  // typists drop frames. Mirrors the news-feed search debounce.
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const next = searchQuery.trim().toLowerCase();
    const t = setTimeout(() => {
      setDebouncedSearchQuery((prev) => (prev === next ? prev : next));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const searchInputRef = useRef<TextInput>(null);

  const headerHeight = insets.top + 66;
  const bottomInsetOffset = insets.bottom + 208;

  const latestSkeleton = useMemo(
    () => Array.from({ length: 6 }, (_, i) => ({ _skeleton: `sk-${i}` })),
    [],
  );

  // R-3 + R-2 + X-1 + X-4: split the home payload back into 5 separate
  // queries with staggered enable flags. Single-bundle (M-C8) was net
  // negative on Cortex-A53 because Hermes JSON.parse on the combined ~94 KB
  // body blocked the JS thread for 35–50 ms in a single tick — the staggered
  // version spreads the same parse cost over 600 ms across small frames.
  // Hero gets its OWN query so it can be persisted to MMKV and hydrated
  // instantly on cold start (R-2 / X-4); the secondary rails are excluded
  // from persistence (see SKIP_PERSIST_KEYS in app/_layout.tsx).
  // X-1: hero refetches on window focus so a freshly-published breaking
  // story appears the moment the user returns to the app.
  const heroQuery = useQuery({
    queryKey: ['home-hero'],
    queryFn: ({ signal }) => fetchHeroPost(signal),
    refetchOnWindowFocus: true,
    // PROFILING FIX (round 2): hero/breaking previously had no staleTime, so
    // every focus + every cold-start cache-hydration immediately fired a
    // background refetch that took ~1.1 s on Sanity (visible in profiler
    // logs). 5 min freshness keeps content recent without thrashing.
    staleTime: 5 * 60 * 1000,
  });

  // C6: Staggered enable flags. Don't fire all secondary queries in the
  // same RAF tick — simultaneous JSON.parses on Cortex-A53 cost 30–50 ms
  // blocking. Stagger: breaking immediately after first interaction, latest
  // +100 ms, local +500 ms.
  const [enableBreaking, setEnableBreaking] = useState(false);
  const [enableLatest, setEnableLatest] = useState(false);
  const [enableLocal, setEnableLocal] = useState(false);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setEnableBreaking(true);
    });
    const t1 = setTimeout(() => setEnableLatest(true), 100);
    const t3 = setTimeout(() => setEnableLocal(true), 500);
    return () => {
      handle.cancel();
      clearTimeout(t1);
      clearTimeout(t3);
    };
  }, []);

  // X-1: breaking ALSO refetches on focus (it's persisted, so this only
  // hits the network when stale).
  const breakingQuery = useQuery({
    queryKey: ['home-breaking'],
    queryFn: ({ signal }) => fetchBreakingPosts(signal),
    enabled: enableBreaking,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    staleTime: 5 * 60 * 1000,
  });
  const latestQuery   = useQuery({ queryKey: ['home-latest'],   queryFn: ({ signal }) => fetchLatestPosts('', '', 18, signal), enabled: enableLatest, staleTime: 2 * 60 * 1000 });
  const localQuery    = useQuery({ queryKey: ['home-local'],    queryFn: ({ signal }) => fetchLocalPosts(12, signal), enabled: enableLocal, staleTime: 5 * 60 * 1000 });
  const refetchHero = heroQuery.refetch;
  const refetchBreaking = breakingQuery.refetch;
  const refetchLatest = latestQuery.refetch;
  const refetchLocal = localQuery.refetch;

  const hero         = heroQuery.data ?? null;
  // X-8: with R-3 splitting the home payload back into 5 staggered queries,
  // data arrival is already naturally serialised (hero -> breaking +InteractionManager
  // -> latest +100 ms -> popular +300 ms -> local +500 ms). The previous M-C8
  // bundle made all 5 useMemos below recompute in the SAME RAF tick; with
  // R-3 each useMemo fires in its own tick. No additional gate needed \u2014 the
  // ?? [] fallback ensures empty rails render skeletons until each query lands.
  // C-A7: hero rendered at 480 px (was 900). Even on full-width devices the
  // hero card paints at < 380 px wide. 900 px allocated ~6 MB of GPU texture
  // for an image that never displays at that resolution.
  const heroImageUri = useMemo(
    () => buildSanityImageUrl(hero?.mainImageUrl, sanityImageWidths.feedThumb) ?? null,
    [hero?.mainImageUrl],
  );
  const latestData   = useMemo(() => latestQuery.data ?? [], [latestQuery.data]);
  const breakingData = useMemo(() => breakingQuery.data ?? [], [breakingQuery.data]);
  const localData    = useMemo(() => localQuery.data ?? [], [localQuery.data]);

  const showLatestSkeleton = latestQuery.isLoading && latestData.length === 0;
  const gridData: LatestGridItem[] = showLatestSkeleton ? latestSkeleton : latestData;

  const filteredData = useMemo(() => {
    const q = debouncedSearchQuery;
    if (!q) return latestData;
    return latestData.filter(
      (p) => p.title.toLowerCase().includes(q) || (p.excerpt ?? '').toLowerCase().includes(q),
    );
  }, [debouncedSearchQuery, latestData]);

  // Stable headlines array — only posts published within 24h. Recomputed only
  // when breakingData changes so memoized BreakingTicker doesn't re-render.
  const breakingHeadlines = useMemo(
    () => breakingData
      .filter((p) => isBreakingBadgeVisible(true, p.publishedAt))
      .map((p) => ({ title: p.title, slug: p.slug })),
    [breakingData],
  );
  const hasBreaking = breakingHeadlines.length > 0;
  const topInsetOffset = headerHeight + (hasBreaking ? BREAKING_H : 0) + 14;

  // Slide the breaking band in/out. 0 = hidden (above header), 1 = visible.
  const bandVisible = useSharedValue(0);
  useEffect(() => {
    bandVisible.value = withTiming(hasBreaking ? 1 : 0, {
      duration: 340,
      easing: hasBreaking ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [hasBreaking, bandVisible]);
  const bandAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(bandVisible.value, [0, 1], [-BREAKING_H, 0]) }],
  }));
  const onPressPost = useCallback(
    (post: Post) => {
      // Prefetch the same URL the article hero will request so the image bind
      // hits expo-image cache after navigation instead of downloading a
      // second, larger Sanity variant.
      // M-C3: routed through queueImagePrefetch so rapid taps cap at 3 in-flight.
      queueImagePrefetch(buildSanityImageUrl(post.mainImageUrl, sanityImageWidths.articleHero));
      // AUDIT FIX P2.5: warm both the route module bundle AND the
      // post-detail query so the article can render the moment the slide
      // animation completes. Saves ~400–700 ms perceived per article open.
      // We use the real fetchPostBySlug (not Promise.resolve(post)) because
      // the listing object lacks `body[]` — seeding it would let
      // useQuery treat the cached value as fresh and skip the body fetch.
      router.prefetch(`/news/${post.slug}` as never);
      // PROFILING FIX (round 2): staleTime Infinity makes a second prefetch
      // for the same slug a no-op while data exists or a fetch is in-flight,
      // and lets useQuery on the article screen treat the result as fresh
      // forever (combined with `refetchOnMount: false` there).
      queryClient.prefetchQuery({
        queryKey: ['post-detail', post.slug],
        queryFn: ({ signal }) => fetchPostBySlug(post.slug, signal),
        staleTime: Infinity,
      });
      // Navigate to the news tab with [slug] as the active screen.
      // React Navigation initialises the news stack with news/index as the base
      // route (per initialRouteName) so back from the article lands on Lajme,
      // not home. Using navigate() instead of push() avoids the flash of
      // news/index that push() causes when the tab switches.
      (navigation as never as { navigate: (name: string, params: object) => void })
        .navigate('news', { screen: '[slug]', params: { slug: post.slug } });
    },
    [navigation, router, queryClient],
  );

  // AUDIT FIX P2.6: after the home screen has been idle for 2 s, warm up
  // the article route + post-detail query for the first 3 visible posts.
  // PERF FIX: wrap the work in InteractionManager so it never fires while
  // the user is still actively scrolling/animating — prevents the prefetch
  // burst from competing with frame production.
  useEffect(() => {
    if (latestData.length === 0) return;
    const slugs = latestData.slice(0, 3).map((p) => p.slug).filter(Boolean);
    if (slugs.length === 0) return;
    let interactionHandle: { cancel: () => void } | null = null;
    const t = setTimeout(() => {
      interactionHandle = InteractionManager.runAfterInteractions(() => {
        for (const slug of slugs) {
          router.prefetch(`/news/${slug}` as never);
          queryClient.prefetchQuery({
            queryKey: ['post-detail', slug],
            queryFn: ({ signal }) => fetchPostBySlug(slug, signal),
            // PROFILING FIX (round 2): see same comment in onPressPost.
            staleTime: Infinity,
          });
        }
      });
    }, 2000);
    return () => {
      clearTimeout(t);
      interactionHandle?.cancel();
    };
  }, [latestData, router, queryClient]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const lastRefreshRef = useRef<number>(0);
  const onPullToRefresh = useCallback(async () => {
    const now = Date.now();
    const throttled = now - lastRefreshRef.current < 10_000;
    if (!throttled) lastRefreshRef.current = now;
    // Always cycle isRefreshing true→false so the native SwipeRefreshLayout /
    // UIRefreshControl receives the proper dismiss signal. Returning early without
    // doing this leaves the control stuck and unable to trigger onRefresh again.
    setIsRefreshing(true);
    if (!throttled) setBannerVisible(true);
    try {
      if (throttled) {
        // 50 ms macrotask gap ensures React flushes isRefreshing=true before
        // the finally block sets it back to false (React 18 batches same-tick updates).
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        return;
      }
      await Promise.allSettled([
        refetchHero(),
        refetchBreaking(),
        refetchLatest(),
        refetchLocal(),
        queryClient.invalidateQueries({ queryKey: ['weather-istog'] }),
        new Promise<void>((resolve) => setTimeout(resolve, 1100)),
      ]);
    } finally {
      setIsRefreshing(false);
      setBannerVisible(false);
    }
  }, [queryClient, refetchBreaking, refetchHero, refetchLatest, refetchLocal]);

  const onHeaderSearch = useCallback(() => {
    setIsSearchActive(true);
    searchInputRef.current?.focus();
  }, []);

  const exitSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery('');
    searchInputRef.current?.blur();
  }, []);

  const onPressLive = useCallback(() => {
    router.navigate('/(tabs)/live' as never);
  }, [router]);

  // ── Render helpers ──────────────────────────────────────────────────────────
  const renderGridItem = useCallback(
    ({ item, index }: ListRenderItemInfo<LatestGridItem>) => {
      const isLeft = index % 2 === 0;
      if (isSkeletonItem(item)) {
        return (
          <View style={[styles.gridColumn, isLeft ? styles.gridColLeft : styles.gridColRight]}>
            <SkeletonCard height={228} style={styles.gridSkeleton} />
          </View>
        );
      }
      return <GridItem item={item} isLeft={isLeft} onPress={onPressPost} />;
    },
    [onPressPost],
  );

  // FlashList item-type discriminator — keeps the recycler from reusing a
  // skeleton view as a real post (and vice versa) on first paint. Split post
  // types by visible height drivers so FlashList v2's recycler does not reuse
  // tall breaking/excerpt cards as short cards during fast scroll.
  const getGridItemType = useCallback(
    (item: LatestGridItem) => {
      if (isSkeletonItem(item)) return 'skeleton';
      if (isBreakingBadgeVisible(item.breaking, item.publishedAt)) return item.excerpt ? 'post-breaking-excerpt' : 'post-breaking';
      return item.excerpt ? 'post-excerpt' : 'post';
    },
    [],
  );

  // PERF: removed `renderLocalItem` / `keyExtractLocal` — the local rail now
  // uses a plain ScrollView+map, so these callbacks were dead code and only
  // added to footer-memo dep churn.

  // ── List header: Hero → Weather → section header for grid ──────────────────
  const listHeader = useMemo(
    () => {
      return (
      <View>
        <RefreshStatusBanner
          visible={bannerVisible}
          title="Duke përditësuar kryefaqen"
          subtitle="Po rifreskohen lajmet, moti dhe postimet kryesore."
        />

        {/* ── RADIO LIVE BANNER ─────────────────────────────── */}
        <RadioLiveBanner onPress={onPressLive} />

        {/* ── HERO — only rendered when a featured or breaking post exists ── */}
        {(heroQuery.isLoading || hero) && (
          <View style={styles.sectionBlock}>
            {hero ? (
              <HeroCard hero={hero} heroImageUri={heroImageUri} onPress={onPressPost} />
            ) : (
              <SkeletonCard height={248} style={styles.heroSkeleton} />
            )}
          </View>
        )}

        {/* ── WEATHER ─────────────────────────────────────── */}
        <View style={styles.sectionBlock}>
          <WeatherWidget />
        </View>

        {/* ── LAJMET E FUNDIT — bespoke editorial masthead ────── */}
        <LatestNewsHeader count={latestData.length} onSeeAll={onHeaderSearch} />
      </View>
      );
    },
    [hero, heroImageUri, heroQuery.isLoading, bannerVisible, onPressPost, onHeaderSearch, onPressLive, latestData.length],
  );

  // ── List footer: Lokale → Popular → Footer cards ──────────────────────────
  const listFooter = useMemo(
    () => {
      return (
      <View>
        {/* ── LAJMET E FUNDIT closer — editorial bookend for the grid ─── */}
        <View style={styles.latestCloser}>
          <View style={styles.latestCloserRule} />
          <Text style={styles.latestCloserLabel}>
            FUNDI I SEKSIONIT · LAJMET E FUNDIT
          </Text>
          <Pressable
            onPress={onHeaderSearch}
            style={({ pressed }) => [
              styles.latestCloserCta,
              pressed && styles.latestCloserCtaPressed,
            ]}
          >
            <Text style={styles.latestCloserCtaText}>Eksploro të gjitha lajmet</Text>
            <View style={styles.latestCloserCtaArrow}>
              <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
            </View>
          </Pressable>
          <Text style={styles.latestCloserSub}>
            Përditësohet automatikisht nga redaksia e RTV Fontana
          </Text>
        </View>

        {/* ── LAJMET LOKALE ─────────────────────────────── */}
        <View style={[styles.sectionBlock, { marginTop: 20 }]}>
          <SectionHeader title="Lajmet Lokale" onSeeAll={onHeaderSearch} />
          {localData.length > 0 ? (
            // AUDIT FIX P4.15: nested horizontal FlashList inside the parent
            // FlashList is the single biggest scroll-jank source on this
            // screen \u2014 the inner list re-runs measurement on every parent
            // scroll tick. Local rail is bounded (\u226412 items, all visible
            // within ~3 swipes) so a plain ScrollView is both faster AND\n            // more correct.
            <View style={styles.localRailContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                contentContainerStyle={styles.localRail}
                removeClippedSubviews
              >
                {localData.map((post) => (
                  <LocalCard key={post._id} post={post} onPress={onPressPost} />
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.localRailSkeleton}>
              <SkeletonCard height={200} style={styles.localSkeletonCard} />
              <SkeletonCard height={200} style={styles.localSkeletonCard} />
              <SkeletonCard height={200} style={styles.localSkeletonCard} />
            </View>
          )}
        </View>

        {/* ── FOOTER CARDS ──────────────────────────────── */}
        <View style={styles.footerWrap}>
          <View style={styles.footerRow}>
            <Pressable
              onPress={() => router.push('/na-kontakto' as never)}
              style={({ pressed }) => [styles.footerCardContact, pressed && styles.footerCardPressed]}
            >
              <LinearGradient
                colors={[colors.primary, '#7F1D1D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.footerCardGrad}
              >
                <View style={styles.footerCardCircle} />
                <Ionicons name="call-outline" size={26} color="#FFFFFF" />
                <Text style={styles.footerCardTitle}>Na Kontakto</Text>
                <Text style={styles.footerCardSub}>Istog, Kosovë</Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={() => router.push('/rreth-nesh' as never)}
              style={({ pressed }) => [styles.footerCardAbout, pressed && styles.footerCardPressed]}
            >
              <View style={styles.footerCardAboutInner}>
                <Image
                  source={appIdentity.logo}
                  contentFit="cover"
                  style={styles.footerLogo}
                />
                <Text style={styles.footerCardAboutTitle}>Radio Fontana</Text>
                <Text style={styles.footerCardAboutSub}>98.8 FM · Istog</Text>
                <View style={styles.footerCardAboutTag}>
                  <Text style={styles.footerCardAboutTagText}>Rreth nesh →</Text>
                </View>
              </View>
            </Pressable>
          </View>

          <Text style={styles.footerCopy}>
            © {CURRENT_YEAR} RTV Fontana · Istog, Kosovë
          </Text>
        </View>
      </View>
      );
    },
    // PERF: `renderLocalItem` and `keyExtractLocal` were left over from when
    // the local rail was a nested FlashList. The rail is now a plain
    // ScrollView+map, so those callbacks are unused here and only added
    // dependency churn that re-rendered the entire footer subtree.
    [localData, onPressPost, onHeaderSearch, router],
  );

  // H15: stable contentContainerStyle reference.
  const gridContentContainerStyle = useMemo(
    () => ({
      paddingTop: topInsetOffset,
      paddingBottom: bottomInsetOffset,
      paddingHorizontal: 16,
    }),
    [topInsetOffset, bottomInsetOffset],
  );

  // H19: virtualized search overlay helpers.
  const onPressSearchResult = useCallback(
    (p: Post) => {
      exitSearch();
      onPressPost(p);
    },
    [exitSearch, onPressPost],
  );
  const renderSearchResult = useCallback(
    ({ item }: ListRenderItemInfo<Post>) => (
      <SearchResultCard item={item} onPress={onPressSearchResult} />
    ),
    [onPressSearchResult],
  );
  const searchKeyExtractor = useCallback((item: Post) => item._id, []);
  const gridKeyExtractor = useCallback(
    (item: LatestGridItem) => (isSkeletonItem(item) ? item._skeleton : item._id),
    [],
  );
  const searchResultsHeader = useMemo(
    () => (
      <Text style={styles.searchCount}>
        {filteredData.length} rezultat{filteredData.length !== 1 ? 'e' : ''}
      </Text>
    ),
    [filteredData.length],
  );
  const searchOverlayContentStyle = useMemo(
    () => ({
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: bottomInsetOffset,
    }),
    [bottomInsetOffset],
  );
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isRefreshing}
        onRefresh={onPullToRefresh}
        tintColor="transparent"
        colors={['transparent']}
        progressBackgroundColor="transparent"
        progressViewOffset={0}
      />
    ),
    [isRefreshing, onPullToRefresh],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {/* Fixed top bar */}
      <View style={[styles.headerShell, { paddingTop: insets.top }]}>
        {isSearchActive ? (
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} style={{ marginLeft: 4 }} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Kërko artikuj..."
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              autoCorrect={false}
            />
            <Pressable onPress={exitSearch} style={styles.headerIconBtn} hitSlop={8}>
              <Ionicons name="close-outline" size={22} color={colors.text} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.headerRow}>
            <Image source={appIdentity.logo} contentFit="cover" priority="high" style={styles.headerLogo} />
            <View style={styles.headerSpacer} />
            <View style={styles.headerActions}>
              <Pressable onPress={onHeaderSearch} style={styles.headerIconBtn} hitSlop={8}>
                <Ionicons name="search-outline" size={20} color={colors.text} />
              </Pressable>
              <HamburgerButton />
            </View>
          </View>
        )}
      </View>

      {/* Breaking band — slides down from behind the header when breaking news arrives */}
      {!isSearchActive && (
        <Animated.View style={[styles.breakingBand, { top: headerHeight }, bandAnimStyle]}>
          <BreakingTicker headlines={breakingHeadlines} />
        </Animated.View>
      )}


      {/* Search overlay */}
      {isSearchActive && (
        searchQuery.trim() === '' ? (
          <ScrollView
            style={[styles.searchOverlay, { top: headerHeight }]}
            contentContainerStyle={searchOverlayContentStyle}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.searchHint}>Shkruaj emrin e artikullit për të kërkuar...</Text>
          </ScrollView>
        ) : filteredData.length === 0 ? (
          <ScrollView
            style={[styles.searchOverlay, { top: headerHeight }]}
            contentContainerStyle={searchOverlayContentStyle}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.searchEmpty}>
              <Ionicons name="search-outline" size={44} color="#D1D5DB" />
              <Text style={styles.searchEmptyTitle}>Asnjë rezultat</Text>
              <Text style={styles.searchEmptyText}>
                Nuk u gjet asnjë artikull për "{searchQuery}"
              </Text>
            </View>
          </ScrollView>
        ) : (
          // H19: virtualize the result list. Previously every keystroke that
          // matched ~10+ items re-rendered all matches as Pressable+Image,
          // costing 8\u201315ms JS per keystroke on Cortex-A53.
          <View style={[styles.searchOverlay, { top: headerHeight }]}>
            <FlashList
              data={filteredData}
              keyExtractor={searchKeyExtractor}
              renderItem={renderSearchResult}
              ListHeaderComponent={searchResultsHeader}
              contentContainerStyle={searchOverlayContentStyle}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              maintainVisibleContentPosition={DISABLE_MAINTAIN_VISIBLE_CONTENT_POSITION}
            />
          </View>
        )
      )}

      {/* Main content */}
      <FlashList
        data={gridData}
        numColumns={2}
        keyExtractor={gridKeyExtractor}
        drawDistance={500}
        showsVerticalScrollIndicator={false}
        scrollEnabled
        contentContainerStyle={gridContentContainerStyle}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        renderItem={renderGridItem}
        getItemType={getGridItemType}
        refreshControl={refreshControl}
        maintainVisibleContentPosition={DISABLE_MAINTAIN_VISIBLE_CONTENT_POSITION}
      />
    </View>
  );
}

// ── StyleSheet ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
  },
  flexFill: {
    flex: 1,
  },

  // ── Top bar ─────────────────────────────────────────────────────────────────
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  searchRow: {
    height: 66,
    paddingHorizontal: 12,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: '#F3F4F6',
    fontFamily: fonts.uiRegular,
    fontSize: 15,
    color: colors.text,
  },

  // ── Breaking band ───────────────────────────────────────────────────────────
  breakingBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 39,
    height: BREAKING_H,
  },
  breakingStrip: {
    flex: 1,
    backgroundColor: '#B91C1C',
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakingLabel: {
    paddingHorizontal: 14,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.18)',
  },
  breakingLabelText: {
    color: 'rgba(255,255,255,0.92)',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  breakingViewport: {
    flex: 1,
    overflow: 'hidden',
    height: '100%',
    justifyContent: 'center',
  },
  breakingTrackSingle: {
    position: 'absolute',
  },
  breakingTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickerSegment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakingMeasure: {
    position: 'absolute',
    left: -10000,
    top: 0,
    opacity: 0,
    width: 9999,
  },
  breakingMarqueeTrack: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    top: 0,
    bottom: 0,
    width: 9999,
  },
  breakingTickerRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },
  breakingTickerText: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    lineHeight: BREAKING_H,
    flexShrink: 0,
  },

  // ── Radio Live Banner ───────────────────────────────────────────────────────
  radioCard: {
    marginHorizontal: 12,
    marginBottom: 14,
    borderRadius: s(18),
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    shadowColor: '#0f172a',
    shadowOpacity: 0.13,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    overflow: 'hidden',
  },
  radioCardPressed: {
    opacity: 0.86,
  },
  radioAccentBar: {
    width: s(5),
    alignSelf: 'stretch',
    backgroundColor: '#dc2626',
  },
  radioBody: {
    flex: 1,
    paddingTop: s(18),
    paddingBottom: s(17),
    paddingHorizontal: s(16),
  },
  radioEyebrow: {
    fontFamily: fonts.uiBold,
    fontSize: ms(10),
    color: '#dc2626',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: s(10),
  },
  radioStationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: s(14),
  },
  radioStationText: {
    flex: 1,
    paddingRight: s(14),
  },
  radioName: {
    fontFamily: fonts.uiBold,
    fontSize: ms(25),
    color: colors.navy,
    letterSpacing: -0.8,
    lineHeight: ms(30),
  },
  radioMeta: {
    fontFamily: fonts.uiRegular,
    fontSize: ms(13),
    color: colors.textMuted,
    marginTop: s(4),
  },
  radioIconBlock: {
    width: s(60),
    height: s(60),
    borderRadius: s(15),
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: s(12),
  },
  radioCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
  },
  radioCta: {
    fontFamily: fonts.uiMedium,
    fontSize: ms(13),
    color: '#dc2626',
  },

  // ── Section layout ──────────────────────────────────────────────────────────
  sectionBlock: {
    marginBottom: 26,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionAccent: {
    width: 2,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 18,
    letterSpacing: -0.4,
  },
  seeAll: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 13,
  },

  // ── Latest news editorial masthead ─────────────────────────────────────────
  latestHeader: {
    marginBottom: 18,
  },
  latestTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  latestKickerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  latestPulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#DC2626',
  },
  latestKicker: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 10.5,
    letterSpacing: 2.4,
  },
  latestDate: {
    color: '#7A8294',
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  latestTitleRow: {
    marginBottom: 6,
  },
  latestTitle: {
    color: '#0A0F1C',
    fontFamily: fonts.articleBold,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -1.2,
  },
  latestCountChip: {
    minWidth: 28,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: '#0A0F1C',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  latestCountText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: -0.2,
  },
  latestSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  latestSubhead: {
    color: '#5C6478',
    fontFamily: fonts.articleItalic,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
    flexShrink: 1,
  },
  latestSeeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  latestSeeAllText: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 12.5,
    letterSpacing: -0.1,
  },
  latestRuleHeavy: {
    height: 2,
    backgroundColor: '#0A0F1C',
    marginBottom: 3,
  },
  latestRuleHair: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#0A0F1C',
    opacity: 0.6,
  },

  // ── Latest news section closer (editorial bookend) ─────────────────────────
  latestCloser: {
    marginTop: 24,
    marginBottom: 8,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  latestCloserRule: {
    width: 56,
    height: 2,
    backgroundColor: '#0A0F1C',
    marginBottom: 14,
  },
  latestCloserLabel: {
    color: '#7A8294',
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2.4,
    marginBottom: 18,
  },
  latestCloserCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 22,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: '#0A0F1C',
    borderRadius: 999,
    shadowColor: '#0A0F1C',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  latestCloserCtaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  latestCloserCtaText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 13.5,
    letterSpacing: -0.2,
  },
  latestCloserCtaArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  latestCloserSub: {
    color: '#7A8294',
    fontFamily: fonts.articleItalic,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 14,
  },

  // ── Hero card ───────────────────────────────────────────────────────────────
  heroOuter: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.10,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroCard: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  heroImageWrap: {
    width: '100%',
    aspectRatio: 3 / 2,
    backgroundColor: '#E2E8F0',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroImageDivider: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(10,15,28,0.07)',
  },
  heroSkeleton: {
    borderRadius: 18,
  },
  heroContent: {
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
    paddingLeft: 15,
    paddingRight: 14,
    paddingTop: 15,
    paddingBottom: 16,
    gap: 6,
  },
  heroBadge: {
    position: 'absolute',
    top: 10,
    right: 14,
    zIndex: 1,
    backgroundColor: '#DC2626',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  heroKicker: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 10.5,
    letterSpacing: 2.2,
  },
  heroHeadline: {
    color: '#0F172A',
    fontFamily: fonts.uiBold,
    fontSize: 23,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  heroDeck: {
    color: '#475569',
    fontFamily: fonts.uiRegular,
    fontSize: 14,
    lineHeight: 20,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  heroMetaText: {
    color: '#64748B',
    fontFamily: fonts.uiRegular,
    fontSize: 10.5,
  },

  // ── Weather card ────────────────────────────────────────────────────────────
  weatherCard: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  weatherInner: {
    backgroundColor: '#ffffff',
    padding: 20,
    minHeight: 126,
    position: 'relative',
    overflow: 'hidden',
  },
  weatherCircle: {
    position: 'absolute',
    right: -s(56),
    top: -s(56),
    width: s(190),
    height: s(190),
    borderRadius: s(95),
    backgroundColor: 'rgba(0,0,0,0.025)',
  },
  weatherCircle2: {
    position: 'absolute',
    left: -s(36),
    bottom: -s(56),
    width: s(140),
    height: s(140),
    borderRadius: s(70),
    backgroundColor: 'rgba(0,0,0,0.018)',
  },
  weatherTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  weatherLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  weatherLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#d1d5db',
  },
  weatherCity: {
    color: '#111111',
    fontFamily: fonts.uiBold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  weatherSub: {
    color: '#9ca3af',
    fontFamily: fonts.uiRegular,
    fontSize: 11,
    letterSpacing: 0.1,
  },
  weatherIconPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
  },
  weatherDataSkeleton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  weatherDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  weatherDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#e5e7eb',
  },
  weatherTemp: {
    color: '#111111',
    fontFamily: fonts.uiBold,
    fontSize: ms(50, 0.5),
    letterSpacing: -2,
    lineHeight: ms(56, 0.5),
  },
  weatherRight: {
    gap: 5,
  },
  weatherCondition: {
    color: '#374151',
    fontFamily: fonts.uiMedium,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  weatherWindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weatherWind: {
    color: '#9ca3af',
    fontFamily: fonts.uiRegular,
    fontSize: 12,
  },

  // ── Local cards (horizontal compact overlay) ────────────────────────────────
  // H13: FlashList horizontal needs an explicit height on its container (it
  // can't auto-measure horizontal layouts). Height covers the tallest card +
  // shadow extent.
  localRailContainer: {
    height: s(200),
  },
  localRail: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingBottom: 4,
  },
  localRailSkeleton: {
    flexDirection: 'row',
    gap: 12,
  },
  localSkeletonCard: {
    width: s(155),
    borderRadius: 10,
    marginRight: 10,
  },
  localOuter: {
    width: s(155),
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0A0F1C',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  localCard: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  localImageWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#E6E8EE',
  },
  localImage: {
    width: '100%',
    height: '100%',
  },
  localImageDivider: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(10,15,28,0.06)',
  },
  localBody: {
    paddingHorizontal: 9,
    paddingTop: 8,
    paddingBottom: 9,
    gap: 3,
  },
  localCatText: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 8,
    letterSpacing: 1.6,
  },
  localTitle: {
    color: '#0A0F1C',
    fontFamily: fonts.uiBold,
    fontSize: 12.5,
    lineHeight: 17,
    letterSpacing: -0.15,
  },
  localTime: {
    color: '#64748B',
    fontFamily: fonts.uiRegular,
    fontSize: 9,
    marginTop: 1,
  },

  // ── Latest grid ──────────────────────────────────────────────────────────────
  gridColumn: {
    flex: 1,
    marginBottom: 10,
  },
  gridColLeft: {
    paddingRight: 5,
  },
  gridColRight: {
    paddingLeft: 5,
  },
  gridSkeleton: {
    borderRadius: 12,
  },
  gridCard: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.065,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  gridImgWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#E2E8F0',
  },
  gridImg: {
    width: '100%',
    height: '100%',
  },
  gridBody: {
    borderLeftWidth: 2,
    borderLeftColor: '#DC2626',
    paddingLeft: 11,
    paddingRight: 10,
    paddingTop: 10,
    paddingBottom: 11,
    gap: 4,
  },
  gridBadge: {
    position: 'absolute',
    top: 8,
    right: 10,
    zIndex: 1,
    backgroundColor: '#DC2626',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  gridBadgeText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 8,
    letterSpacing: 1.3,
  },
  gridCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gridFreshText: {
    color: '#16A34A',
    fontFamily: fonts.uiBold,
    fontSize: 8,
    letterSpacing: 1.4,
  },
  gridCatText: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 8.5,
    letterSpacing: 1.8,
    flex: 1,
  },
  gridTitle: {
    color: '#0F172A',
    fontFamily: fonts.uiBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  gridTime: {
    color: '#64748B',
    fontFamily: fonts.uiRegular,
    fontSize: 9.5,
  },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footerWrap: {
    paddingTop: 20,
    paddingBottom: 8,
    gap: 14,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  footerCardContact: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  footerCardAbout: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    shadowColor: colors.navy,
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  footerCardPressed: {
    opacity: 0.88,
  },
  footerCardGrad: {
    padding: 18,
    minHeight: 128,
    gap: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  footerCardCircle: {
    position: 'absolute',
    right: -30,
    top: -30,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  footerCardTitle: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  footerCardSub: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: fonts.uiMedium,
    fontSize: 13,
  },
  footerCardAboutInner: {
    padding: 18,
    minHeight: 128,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 4,
  },
  footerLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    marginBottom: 6,
  },
  footerCardAboutTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  footerCardAboutSub: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 12,
  },
  footerCardAboutTag: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.redTint,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  footerCardAboutTagText: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 11,
  },
  footerCopy: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 4,
  },

  // ── Search ───────────────────────────────────────────────────────────────────
  searchOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 38,
    backgroundColor: colors.surfaceSubtle,
  },
  searchOverlayContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  searchHint: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  searchEmpty: {
    alignItems: 'center',
    marginTop: 60,
    gap: 12,
  },
  searchEmptyTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 18,
  },
  searchEmptyText: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 14,
    textAlign: 'center',
  },
  searchCount: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    marginBottom: 12,
  },
  searchResultCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: colors.navy,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  searchResultPressed: {
    backgroundColor: colors.redTint,
  },
  searchResultImg: {
    width: s(90),
    height: s(90),
    backgroundColor: colors.surfaceSubtle,
  },
  searchResultBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 4,
  },
  searchResultCat: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  searchResultTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 14,
    lineHeight: 19,
  },
  searchResultExcerpt: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    lineHeight: 17,
  },
});
