import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useRouter } from 'expo-router';
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
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { HamburgerButton } from '../../components/ui/HamburgerButton';
import { RelativeTime } from '../../components/ui/RelativeTime';
import { RefreshStatusBanner } from '../../components/ui/RefreshStatusBanner';
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
    const t = setTimeout(() => setCanFetchWeather(true), 900);
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
function headlinesEqual(
  prev: { headlines: string[] },
  next: { headlines: string[] },
): boolean {
  const a = prev.headlines;
  const b = next.headlines;
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const BreakingTicker = memo(function BreakingTicker({ headlines }: { headlines: string[] }) {
  // Early-return when there are no headlines: skip mounting the inner ticker
  // entirely so the infinite marquee + dot worklets never run on cold home.
  if (headlines.length === 0) {
    return null;
  }
  return <BreakingTickerInner headlines={headlines} />;
}, headlinesEqual);

function BreakingTickerInner({ headlines }: { headlines: string[] }) {
  const marqueeText = useMemo(() => headlines.join('   •   '), [headlines]);

  const [segmentWidth, setSegmentWidth] = useState(0);
  const translateX = useSharedValue(0);
  const dotOpacity = useSharedValue(1);
  // AUDIT FIX P3.11 + P8.28: pause when Home tab is not focused, and respect
  // prefers-reduced-motion. Without these, both worklets ran 60 fps for the
  // entire app session even on Library/Live/Article screens.
  const isFocused = useIsFocused();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!segmentWidth || !isFocused || reducedMotion) {
      cancelAnimation(translateX);
      translateX.value = 0;
      return;
    }
    cancelAnimation(translateX);
    translateX.value = 0;
    const duration = Math.max(18000, segmentWidth * 30);
    translateX.value = withRepeat(
      withTiming(-segmentWidth, { duration, easing: Easing.linear }),
      -1,
      false,
    );
    return () => { cancelAnimation(translateX); };
  }, [segmentWidth, marqueeText, translateX, isFocused, reducedMotion]);

  useEffect(() => {
    if (!isFocused || reducedMotion) {
      cancelAnimation(dotOpacity);
      dotOpacity.value = 1;
      return;
    }
    dotOpacity.value = withRepeat(
      withTiming(0.18, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => { cancelAnimation(dotOpacity); };
  }, [dotOpacity, isFocused, reducedMotion]);

  const tickerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  const onMeasure = useCallback((e: LayoutChangeEvent) => {
    setSegmentWidth(e.nativeEvent.layout.width);
  }, []);

  return (
    <View style={styles.breakingStrip}>
      <View style={styles.breakingLabel}>
        <Animated.View style={[styles.breakingDot, dotStyle]} />
        <Text style={styles.breakingLabelText}>LAJM I FUNDIT</Text>
      </View>
      <View style={styles.breakingViewport}>
        <Animated.View style={[styles.breakingTrack, tickerStyle]}>
          <Text onLayout={onMeasure} numberOfLines={1} style={styles.breakingTickerText}>
            {`  ${marqueeText}     `}
          </Text>
          <Text numberOfLines={1} style={styles.breakingTickerText}>
            {`  ${marqueeText}     `}
          </Text>
        </Animated.View>
      </View>
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
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const cat = hero.categories?.[0] ?? 'Lajme';
  const initial = ((hero.author ?? 'Redaksia Fontana').trim().charAt(0) || 'R').toUpperCase();
  const readingMin = (() => {
    const text = `${hero.title ?? ''} ${hero.excerpt ?? ''}`.trim();
    if (!text) return 3;
    return Math.max(2, Math.ceil((text.split(/\s+/).length * 4) / 220));
  })();

  return (
    <Animated.View style={[styles.heroOuter, scaleStyle]}>
      <Pressable
        onPress={() => onPress(hero)}
        onPressIn={() => { scale.value = withSpring(0.985, { damping: 24, stiffness: 460 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 20, stiffness: 300 }); }}
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

        {/* White editorial content */}
        <View style={styles.heroContent}>
          {hero.breaking ? (
            <View style={styles.heroBreakingRow}>
              <View style={styles.heroBreakingPulse} />
              <Text style={styles.heroBreakingText}>LAJM I FUNDIT</Text>
            </View>
          ) : null}

          <View style={styles.heroKickerRow}>
            <View style={styles.heroKickerDot} />
            <Text style={styles.heroKicker} numberOfLines={1}>{cat.toUpperCase()}</Text>
          </View>

          <Text numberOfLines={3} style={styles.heroHeadline}>{hero.title}</Text>

          {hero.excerpt ? (
            <Text numberOfLines={2} style={styles.heroDeck}>{hero.excerpt}</Text>
          ) : null}

          <View style={styles.heroBylineRule} />

          <View style={styles.heroByline}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>{initial}</Text>
            </View>
            <View style={styles.heroBylineCol}>
              <Text numberOfLines={1} style={styles.heroAuthor}>
                {hero.author ?? 'Redaksia Fontana'}
              </Text>
              <View style={styles.heroMetaRow}>
                <Text style={styles.heroMetaText}>{readingMin} min lexim</Text>
                <View style={styles.heroMetaDot} />
                <RelativeTime timestamp={hero.publishedAt} style={styles.heroMetaText} />
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}, (prev, next) =>
  prev.onPress === next.onPress &&
  prev.heroImageUri === next.heroImageUri &&
  samePreviewPost(prev.hero, next.hero),
);

// ── LocalCard (compact overlay card for horizontal rail) ──────────────────────
const LocalCard = memo(function LocalCard({ post, onPress }: { post: Post; onPress: (p: Post) => void }) {
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const imageUri = useMemo(
    () => buildSanityImageUrl(post.mainImageUrl, sanityImageWidths.feedThumb),
    [post.mainImageUrl],
  );

  return (
    <Animated.View style={[styles.localOuter, scaleStyle]}>
      <Pressable
        onPress={() => onPress(post)}
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 22, stiffness: 460 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 20, stiffness: 300 }); }}
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
          <View style={styles.localKickerRow}>
            <View style={styles.localKickerDot} />
            <Text style={styles.localCatText} numberOfLines={1}>
              {(post.categories?.[0] ?? 'Lajme').toUpperCase()}
            </Text>
          </View>
          <Text numberOfLines={3} style={styles.localTitle}>{post.title}</Text>
          <View style={styles.localRule} />
          <RelativeTime timestamp={post.publishedAt} style={styles.localTime} />
        </View>
      </Pressable>
    </Animated.View>
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
        {count > 0 ? (
          <View style={styles.latestCountChip}>
            <Text style={styles.latestCountText}>{count}</Text>
          </View>
        ) : null}
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
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const initial = ((item.author ?? 'Redaksia Fontana').trim().charAt(0) || 'R').toUpperCase();
  // "Fresh" indicator if published within the last 60 minutes — surfaces the
  // editorial heartbeat without an extra network call.
  const isFresh = useMemo(() => {
    if (!item.publishedAt) return false;
    const ageMin = (Date.now() - new Date(item.publishedAt).getTime()) / 60000;
    return ageMin >= 0 && ageMin < 60;
  }, [item.publishedAt]);
  return (
    <View style={[styles.gridColumn, isLeft ? styles.gridColLeft : styles.gridColRight]}>
      <Animated.View style={animStyle}>
        <Pressable
          onPress={() => onPress(item)}
          onPressIn={() => { scale.value = withSpring(0.97, { damping: 22, stiffness: 460 }); }}
          onPressOut={() => { scale.value = withSpring(1, { damping: 20, stiffness: 300 }); }}
          style={styles.gridCard}
        >
          {/* Editorial accent on the top edge */}
          <View style={styles.gridAccentBar} />
          <View style={styles.gridImgWrap}>
            <Image
              source={imageUri ? { uri: imageUri } : undefined}
              placeholder={{ thumbhash: item.thumbhash || defaultThumbhash }}
              recyclingKey={item._id}
              contentFit="cover"
              transition={0}
              style={styles.gridImg}
            />
            {item.breaking ? (
              <View style={styles.gridBreakingPin}>
                <View style={styles.gridBreakingPinPulse} />
                <Text style={styles.gridBreakingPinText}>LAJM</Text>
              </View>
            ) : null}
            <View style={styles.gridImageDivider} />
          </View>
          <View style={styles.gridBody}>
            <View style={styles.gridKickerRow}>
              <View style={styles.gridKickerDot} />
              <Text numberOfLines={1} style={styles.gridCatText}>
                {(item.categories?.[0] ?? 'Lajme').toUpperCase()}
              </Text>
              {isFresh ? (
                <>
                  <View style={styles.gridKickerSpacer} />
                  <View style={styles.gridFreshDot} />
                  <Text style={styles.gridFreshText}>I RI</Text>
                </>
              ) : null}
            </View>
            <Text numberOfLines={3} style={styles.gridTitle}>{item.title}</Text>
            {item.excerpt ? (
              <Text numberOfLines={2} style={styles.gridExcerpt}>{item.excerpt}</Text>
            ) : null}
            <View style={styles.gridRule} />
            <View style={styles.gridByline}>
              <View style={styles.gridAvatar}>
                <Text style={styles.gridAvatarText}>{initial}</Text>
              </View>
              <View style={styles.gridBylineCol}>
                <Text numberOfLines={1} style={styles.gridAuthor}>
                  {item.author ?? 'Redaksia Fontana'}
                </Text>
                <RelativeTime timestamp={item.publishedAt} style={styles.gridTime} />
              </View>
            </View>
          </View>
        </Pressable>
      </Animated.View>
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
  // M26: shared-value driven press feedback (no per-press style array allocation).
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={styles.searchResultCard}
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 22, stiffness: 440 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 20, stiffness: 300 }); }}
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
    </Animated.View>
  );
}, (prev, next) =>
  prev.onPress === next.onPress &&
  samePreviewPost(prev.item, next.item),
);

// ── RadioLiveBanner ────────────────────────────────────────────────────────────
const RadioLiveBanner = memo(function RadioLiveBanner({ onPress }: { onPress: () => void }) {
  const isFocused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const cardScale = useSharedValue(1);
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.7);

  useEffect(() => {
    if (!isFocused || reducedMotion) {
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
      ringScale.value = 1;
      ringOpacity.value = 0.7;
      return;
    }
    ringScale.value = withRepeat(
      withTiming(2.4, { duration: 1500, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    ringOpacity.value = withRepeat(
      withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
    };
  }, [isFocused, reducedMotion, ringScale, ringOpacity]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  return (
    <Animated.View style={[styles.radioCard, cardStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          cardScale.value = withSpring(0.98, { damping: 22, stiffness: 460 });
        }}
        onPressOut={() => {
          cardScale.value = withSpring(1, { damping: 20, stiffness: 300 });
        }}
        style={styles.radioCardInner}
      >
        {/* Red accent border on the left edge */}
        <View style={styles.radioAccentBar} />

        {/* Pulsing live dot */}
        <View style={styles.radioDotWrap}>
          <Animated.View style={[styles.radioPulseRing, ringStyle]} />
          <View style={styles.radioDot} />
        </View>

        {/* Text */}
        <View style={styles.radioTextWrap}>
          <Text style={styles.radioTitle}>🎙 RTV Fontana 98.8 FM — Live 24/7</Text>
          <Text style={styles.radioSubtitle}>Dëgjo radion live tani</Text>
        </View>

        {/* Chevron */}
        <View style={styles.radioChevronWrap}>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </View>
      </Pressable>
    </Animated.View>
  );
});

// ── HomeScreen ─────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
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
  const topInsetOffset = headerHeight + BREAKING_H + 14;
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
    // PROFILING FIX (round 2): see hero comment.
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

  // Stable headlines array — recomputed only when breakingData changes, so the
  // memoized BreakingTicker doesn't bust on every parent re-render.
  const breakingHeadlines = useMemo(
    () => breakingData.map((p) => p.title),
    [breakingData],
  );
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
      router.push({ pathname: '/news/[slug]' as never, params: { slug: post.slug } as never });
    },
    [router, queryClient],
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
  const onPullToRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
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
      if (item.breaking) return item.excerpt ? 'post-breaking-excerpt' : 'post-breaking';
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
          visible={isRefreshing}
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
    [hero, heroImageUri, heroQuery.isLoading, isRefreshing, onPressPost, onHeaderSearch, onPressLive, latestData.length],
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

      {/* Breaking band */}
      {!isSearchActive && (
        <View style={[styles.breakingBand, { top: headerHeight }]}>
          <BreakingTicker headlines={breakingHeadlines} />
        </View>
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
    gap: 8,
    backgroundColor: '#DC2626',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.18)',
  },
  breakingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
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
  breakingTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakingTickerText: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    lineHeight: BREAKING_H,
  },

  // ── Radio Live Banner ───────────────────────────────────────────────────────
  radioCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: s(16),
    backgroundColor: '#FFFFFF',
    shadowColor: '#dc2626',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: 'hidden',
  },
  radioCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: s(15),
    paddingRight: s(16),
  },
  radioAccentBar: {
    width: s(4),
    alignSelf: 'stretch',
    backgroundColor: '#dc2626',
    marginRight: s(14),
  },
  radioDotWrap: {
    width: s(20),
    height: s(20),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: s(12),
  },
  radioPulseRing: {
    position: 'absolute',
    width: s(20),
    height: s(20),
    borderRadius: s(10),
    backgroundColor: '#dc2626',
  },
  radioDot: {
    width: s(10),
    height: s(10),
    borderRadius: s(5),
    backgroundColor: '#dc2626',
  },
  radioTextWrap: {
    flex: 1,
    gap: s(3),
  },
  radioTitle: {
    fontFamily: fonts.uiBold,
    fontSize: ms(14.5),
    color: '#111827',
    letterSpacing: -0.2,
  },
  radioSubtitle: {
    fontFamily: fonts.uiRegular,
    fontSize: ms(12),
    color: '#6B7280',
  },
  radioChevronWrap: {
    marginLeft: s(6),
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
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: 6,
  },
  latestTitle: {
    color: '#0A0F1C',
    fontFamily: fonts.articleBold, // AUDIT FIX P6.22: Black weight no longer loaded
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -1.2,
    flexShrink: 1,
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
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0A0F1C',
    shadowOpacity: 0.10,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  heroCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  heroImageWrap: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: '#E6E8EE',
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
    backgroundColor: 'rgba(10,15,28,0.06)',
  },
  heroSkeleton: {
    borderRadius: 22,
  },
  heroContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
  },
  heroBreakingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: '#DC2626',
    borderRadius: 4,
    marginBottom: 11,
  },
  heroBreakingPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  heroBreakingText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9.5,
    letterSpacing: 1.6,
  },
  heroKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 11,
  },
  heroKickerDot: {
    width: 5,
    height: 5,
    borderRadius: 1,
    backgroundColor: '#DC2626',
  },
  heroKicker: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 10.5,
    letterSpacing: 2.2,
  },
  heroHeadline: {
    color: '#0A0F1C',
    fontFamily: fonts.articleBold,
    fontSize: 22,
    lineHeight: 29,
    letterSpacing: -0.5,
  },
  heroDeck: {
    color: '#3C4358',
    fontFamily: fonts.uiRegular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 9,
  },
  heroBylineRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EEF0F4',
    marginTop: 14,
    marginBottom: 12,
  },
  heroByline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  heroAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroAvatarText: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 13.5,
    letterSpacing: -0.2,
  },
  heroBylineCol: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
  },
  heroAuthor: {
    color: '#0A0F1C',
    fontFamily: fonts.uiBold,
    fontSize: 12.5,
    letterSpacing: -0.1,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  heroMetaText: {
    color: '#7A8294',
    fontFamily: fonts.uiRegular,
    fontSize: 11.5,
  },
  heroMetaDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#B5BAC8',
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
    height: s(230),
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
    width: s(160),
    borderRadius: 14,
    marginRight: 12,
  },
  localOuter: {
    width: s(168),
    borderRadius: 16,
    marginRight: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0A0F1C',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  localCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  localImageWrap: {
    width: '100%',
    aspectRatio: 4 / 3,
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
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11,
  },
  localKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  localKickerDot: {
    width: 4,
    height: 4,
    borderRadius: 1,
    backgroundColor: '#DC2626',
  },
  localCatText: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.8,
  },
  localTitle: {
    color: '#0A0F1C',
    fontFamily: fonts.articleBold,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  localRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EEF0F4',
    marginTop: 10,
    marginBottom: 8,
  },
  localTime: {
    color: '#7A8294',
    fontFamily: fonts.uiRegular,
    fontSize: 10.5,
  },

  // ── Latest grid ──────────────────────────────────────────────────────────────
  gridColumn: {
    flex: 1,
    marginBottom: 12,
  },
  gridColLeft: {
    paddingRight: 6,
  },
  gridColRight: {
    paddingLeft: 6,
  },
  gridSkeleton: {
    borderRadius: 14,
  },
  gridCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#0A0F1C',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  gridAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#DC2626',
    zIndex: 2,
  },
  gridImgWrap: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#E6E8EE',
  },
  gridImg: {
    width: '100%',
    height: '100%',
  },
  gridImageDivider: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(10,15,28,0.06)',
  },
  gridBreakingPin: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: '#DC2626',
    borderRadius: 4,
  },
  gridBreakingPinPulse: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFFFFF',
  },
  gridBreakingPinText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 8.5,
    letterSpacing: 1.4,
  },
  gridBody: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 132,
  },
  gridKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  gridKickerDot: {
    width: 4,
    height: 4,
    borderRadius: 1,
    backgroundColor: '#DC2626',
  },
  gridKickerSpacer: {
    flex: 1,
  },
  gridFreshDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#16A34A',
  },
  gridFreshText: {
    color: '#16A34A',
    fontFamily: fonts.uiBold,
    fontSize: 8.5,
    letterSpacing: 1.6,
  },
  gridCatText: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.8,
  },
  gridTitle: {
    color: '#0A0F1C',
    fontFamily: fonts.articleBold,
    fontSize: 14.5,
    lineHeight: 19.5,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  gridExcerpt: {
    color: '#5C6478',
    fontFamily: fonts.uiRegular,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 6,
  },
  gridRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EEF0F4',
    marginTop: 11,
    marginBottom: 9,
  },
  gridByline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gridAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gridAvatarText: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: -0.2,
  },
  gridBylineCol: {
    flex: 1,
    flexShrink: 1,
  },
  gridAuthor: {
    color: '#0A0F1C',
    fontFamily: fonts.uiBold,
    fontSize: 10.5,
    letterSpacing: -0.1,
  },
  gridTime: {
    color: '#7A8294',
    fontFamily: fonts.uiRegular,
    fontSize: 10,
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
