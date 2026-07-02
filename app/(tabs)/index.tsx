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
import { useRouter } from 'expo-router';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NavigationState } from '@react-navigation/native';
import {
  AlertCircle,
  ChevronRight,
  Cloud,
  CloudLightning,
  CloudOff,
  CloudRain,
  CloudSnow,
  CloudSun,
  Play,
  Search,
  Sun,
  Wind,
  X,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
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
  type SharedValue,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { HamburgerButton } from '../../components/ui/HamburgerButton';
import { RelativeTime } from '../../components/ui/RelativeTime';
import { RefreshStatusBanner } from '../../components/ui/RefreshStatusBanner';
import { isBreakingBadgeVisible } from '../../lib/breakingBadge';
import { SkeletonCard } from '../../components/news/SkeletonCard';

import { appIdentity, fonts, radius, elevation } from '../../constants/tokens';
import { useTheme } from '../../providers/ThemeProvider';
import type { ThemeColors } from '../../providers/ThemeProvider';
import { ms, s } from '../../lib/responsive';
import { queueImagePrefetch } from '../../lib/prefetchQueue';
import { getAndClearPendingDrawerCategory } from '../../lib/drawerCategory';
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
const DISABLE_MAINTAIN_VISIBLE_CONTENT_POSITION = { disabled: true } as const;
const REFRESH_MIN_VISIBLE_MS = 600;
const REFRESH_MAX_WAIT_MS = 3500;

type LatestGridItem = Post | { _skeleton: string };
function isSkeletonItem(item: LatestGridItem): item is { _skeleton: string } {
  return '_skeleton' in item;
}

// ── Weather ────────────────────────────────────────────────────────────────────
type WeatherResponse = {
  current: { temperature_2m: number; weathercode: number; windspeed_10m: number };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weathercode: number[];
  };
};

function wInfo(code: number): { label: string; icon: LucideIcon } {
  if (code === 0)  return { label: 'E kthjellët',      icon: Sun          };
  if (code <= 3)   return { label: 'Me re të lehta',   icon: CloudSun     };
  if (code <= 48)  return { label: 'Mjegull',           icon: Cloud        };
  if (code <= 57)  return { label: 'Vesë e lehtë',      icon: CloudRain    };
  if (code <= 67)  return { label: 'Shi',               icon: CloudRain    };
  if (code <= 77)  return { label: 'Borë',              icon: CloudSnow    };
  if (code <= 82)  return { label: 'Rrebeshe shi',      icon: CloudLightning };
  return                  { label: 'Stuhi',             icon: CloudLightning };
}

type ForecastDay = { label: string; max: number; min: number; code: number };

function getForecast(data: WeatherResponse | undefined): ForecastDay[] {
  if (!data?.daily) return [];
  const { time, temperature_2m_max, temperature_2m_min, weathercode } = data.daily;
  const labels = ['Sot', 'Nesër', 'Pasnesër'];
  const days: ForecastDay[] = [];
  for (let i = 0; i < Math.min(3, time.length); i++) {
    days.push({
      label: labels[i] ?? time[i] ?? '',
      max: Math.round(temperature_2m_max[i] ?? 0),
      min: Math.round(temperature_2m_min[i] ?? 0),
      code: weathercode[i] ?? 0,
    });
  }
  return days;
}

async function fetchWeatherIstog(signal?: AbortSignal): Promise<WeatherResponse> {
  const res = await fetch(
    'https://api.open-meteo.com/v1/forecast?latitude=42.78&longitude=20.48&current=temperature_2m,weathercode,windspeed_10m&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe%2FBelgrade',
    { signal },
  );
  if (!res.ok) throw new Error('weather');
  return res.json() as Promise<WeatherResponse>;
}

// ── WeatherWidget ──────────────────────────────────────────────────────────────
const WeatherWidget = memo(function WeatherWidget() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
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

  if (isError) {
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
          </View>

          {/* Error content */}
          <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 60 }}>
            <CloudOff size={20} color={colors.textFaint} strokeWidth={1.5} />
            <Text style={styles.weatherErrorText}>Moti nuk disponohet</Text>
          </View>
        </View>
      </View>
    );
  }

  const info = data ? wInfo(data.current.weathercode) : null;
  const WeatherIcon = info?.icon;
  const forecast = data ? getForecast(data) : [];

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
            WeatherIcon ? <WeatherIcon size={36} color={colors.inkDark} strokeWidth={1.5} /> : null
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
                <Wind size={12} color={colors.textMuted} strokeWidth={1.5} />
                <Text style={styles.weatherWind}>
                  {Math.round(data.current.windspeed_10m)} km/h erë
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* 3-day forecast row */}
        {!(isLoading || !data) && forecast.length > 0 ? (
          <Animated.View style={[styles.weatherForecastRow, revealStyle]}>
            {forecast.map((day) => {
              const DayIcon = wInfo(day.code).icon;
              return (
                <View key={day.label} style={styles.weatherForecastDay}>
                  <Text style={styles.weatherForecastLabel}>{day.label}</Text>
                  <DayIcon size={20} color={colors.textSecondary} strokeWidth={1.5} />
                  <Text style={styles.weatherForecastTemp}>{day.min}° / {day.max}°</Text>
                </View>
              );
            })}
          </Animated.View>
        ) : null}
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
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const router = useRouter();
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
  // AUDIT FIX: track measured text width in state so the visible Animated.View
  // can be sized exactly to the text. Without this, numberOfLines={1} inside a
  // flex-constrained parent can truncate with ellipsis, cutting off the title.
  const [textWidth, setTextWidth] = useState(0);

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
    router.push(`/(tabs)/news/${slug}`);
  }, [router, currentHeadline]);

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
    const rawDuration = ((vw + tw) / 50) * 1000;
    const duration = Math.max(3000, Math.min(10000, rawDuration));
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

  // Measure the FULL single-line text width via onTextLayout on a hidden
  // off-screen clone. The visible animated Text gets numberOfLines={1} to stay
  // single-line. Using onTextLayout (lines[0].width) gives the real content
  // width — onLayout only gives the element's box width which is clamped to
  // the flex parent when the text wraps. This fixes the "only half the title
  // visible" bug: previously the text wrapped inside the flex-constrained
  // Animated.View and only the first line (44px of the 44px-tall strip) showed.
  const onTextLayout = useCallback((e: { nativeEvent: { lines: { width: number }[] } }) => {
    const line = e.nativeEvent.lines[0];
    if (!line) return;
    const w = line.width;
    if (w === textWidthRef.current) return;
    textWidthRef.current = w;
    setTextWidth(w);
    if (viewportWidthRef.current) startAnim();
  }, [startAnim]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!currentHeadline) return null;

  return (
    <Pressable onPress={onPressTicker} hitSlop={4} style={({ pressed }) => [styles.breakingStrip, pressed && { opacity: 0.82 }]}>
      <View style={styles.breakingLabel}>
        <Text style={styles.breakingLabelText}>LAJM I FUNDIT</Text>
      </View>

      {/* Hidden measurement clone — sits inside breakingStrip but off-screen.
          A very large width ensures the text renders on a single line so that
          lines[0].width equals the true single-line content width. */}
      <View style={styles.breakingMeasureContainer} pointerEvents="none">
        <Text
          style={styles.breakingTickerText}
          onTextLayout={onTextLayout}
          numberOfLines={1}
          accessible={false}
        >
          {currentHeadline.title}
        </Text>
      </View>

      <View
        style={styles.breakingViewport}
        onLayout={onViewportLayout}
      >
        {/* Animated.View is sized to the measured text width plus a small buffer
            so the text never wraps or truncates. The viewport overflow hides any
            excess; the translateX animation scrolls the full title across. */}
        <Animated.View style={[styles.breakingTickerRow, animStyle, { width: textWidth + 8 }]}>
          <Text style={styles.breakingTickerText}>
            {currentHeadline.title}
          </Text>
        </Animated.View>
        <LinearGradient
          colors={['rgba(185,28,28,0)', colors.primaryDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.tickerFadeLeft}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[colors.primaryDeep, 'rgba(185,28,28,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.tickerFadeRight}
          pointerEvents="none"
        />
      </View>
    </Pressable>
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
  colors,
}: {
  hero: Post;
  heroImageUri: string | null;
  onPress: (post: Post) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  const cat = hero.categories?.[0] ?? 'Lajme';

  return (
    <View style={styles.heroOuter}>
      <Pressable
        onPress={() => onPress(hero)}
        style={({ pressed }) => [
          styles.heroCard,
          pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={hero.title}
      >
        <View pointerEvents="none" style={styles.heroAccentRail} />
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
          <LinearGradient
            colors={[colors.surface, colors.surfaceSubtle]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
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
  prev.colors === next.colors &&
  prev.onPress === next.onPress &&
  prev.heroImageUri === next.heroImageUri &&
  samePreviewPost(prev.hero, next.hero),
);

// ── LocalCard (compact overlay card for horizontal rail) ──────────────────────
const LocalCard = memo(function LocalCard({ post, onPress, colors }: { post: Post; onPress: (p: Post) => void; colors: ThemeColors }) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  const imageUri = useMemo(
    () => buildSanityImageUrl(post.mainImageUrl, sanityImageWidths.feedThumb),
    [post.mainImageUrl],
  );

  return (
    <View style={styles.localOuter}>
      <Pressable
        onPress={() => onPress(post)}
        style={({ pressed }) => [
          styles.localCard,
          pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 },
        ]}
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
  prev.colors === next.colors &&
  prev.onPress === next.onPress &&
  samePreviewPost(prev.post, next.post),
);


// ── LocalNewsHeader ─────────────────────────────────────────────────────────
const LocalNewsHeader = memo(function LocalNewsHeader() {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={styles.localHeader}>
      <View style={styles.localTitleGroup}>
        <View style={styles.localAccentBar} />
        <Text style={styles.localHeaderTitle}>Lajmet Lokale</Text>
      </View>
    </View>
  );
});

// ── LatestNewsHeader ─────────────────────────────────────────────────────────
const LatestNewsHeader = memo(function LatestNewsHeader({
  onSeeAll,
}: {
  onSeeAll?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={styles.latestHeader}>
      <View style={styles.latestTopRow}>
        <View style={styles.latestTitleGroup}>
          <View style={styles.latestAccentBar} />
          <Text style={styles.latestTitle}>Lajmet e Fundit</Text>
        </View>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={10} style={({ pressed }) => [styles.latestSeeAll, pressed && { opacity: 0.65 }]} accessibilityRole="button" accessibilityLabel="Shiko të gjitha lajmet">
            <Text style={styles.latestSeeAllText}>Të gjitha</Text>
            <ChevronRight size={13} color={colors.primary} strokeWidth={1.5} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}, (prev, next) => prev.onSeeAll === next.onSeeAll);

// ── GridItem (memoized) ──────────────────────────────────────────────────────
const GridItem = memo(function GridItem({
  item,
  isLeft,
  onPress,
  colors,
}: {
  item: Post;
  isLeft: boolean;
  onPress: (p: Post) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => getStyles(colors), [colors]);
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
        style={({ pressed }) => [
          styles.gridCard,
          pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 },
        ]}
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
  prev.colors === next.colors &&
  prev.onPress === next.onPress &&
  samePreviewPost(prev.item, next.item),
);

// ── SearchResultCard (memoized) — used by virtualized search overlay ─────────
const SearchResultCard = memo(function SearchResultCard({
  item,
  onPress,
  colors,
}: {
  item: Post;
  onPress: (p: Post) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  // M27: thumbnails standardized at 480px wide.
  const imageUri = useMemo(
    () => (item.mainImageUrl ? buildSanityImageUrl(item.mainImageUrl, sanityImageWidths.feedThumb) : undefined),
    [item.mainImageUrl],
  );
  return (
    <Pressable
      style={({ pressed }) => [
        styles.searchResultCard,
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 },
      ]}
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
  prev.colors === next.colors &&
  prev.onPress === next.onPress &&
  samePreviewPost(prev.item, next.item),
);

// ── RadioLiveBanner ────────────────────────────────────────────────────────────
// Heights and phase offsets for the 5 animated equalizer bars.
const BANNER_BAR_HEIGHTS = [7, 13, 20, 13, 7] as const;
const BANNER_BAR_OFFSETS = [0, 0.17, 0.33, 0.50, 0.67] as const;

// Single animated bar — worklet-driven, zero JS thread cost per frame.
const BannerEqBar = memo(function BannerEqBar({
  maxH,
  offset,
  phase,
}: {
  maxH: number;
  offset: number;
  phase: SharedValue<number>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const style = useAnimatedStyle(() => {
    'worklet';
    const sv = (Math.sin((phase.value + offset) * Math.PI * 2) + 1) * 0.5;
    return { height: 3 + (maxH - 3) * sv };
  });
  return <Animated.View style={[styles.bannerEqBar, style]} />;
});

const RadioLiveBanner = memo(function RadioLiveBanner({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const isFocused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const shouldAnimate = isFocused && !reducedMotion;

  const phase = useSharedValue(0);
  const cardScale = useSharedValue(1);

  useEffect(() => {
    if (shouldAnimate) {
      phase.value = withRepeat(
        withTiming(1, { duration: 1200, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(phase);
      phase.value = withTiming(0.5, { duration: 300 });
    }
    return () => { cancelAnimation(phase); };
  }, [shouldAnimate, phase]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  return (
    <Animated.View style={[styles.radioCard, cardAnimStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          cardScale.value = withTiming(0.975, { duration: 90, easing: Easing.out(Easing.cubic) });
        }}
        onPressOut={() => {
          cardScale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
        }}
        accessibilityRole="button"
        accessibilityLabel="Dëgjo RTV Fontana live"
        style={styles.radioCardInner}
      >
        {/* Ghost "98.8" watermark — oversized, clipped by overflow:hidden */}
        <Text style={styles.radioGhostFreq} numberOfLines={1} accessible={false}>98.8</Text>

        {/* Solid red left rail — the brand anchor */}
        <View style={styles.radioRail} />

        <View style={styles.radioContent}>
          {/* ── Left: station identity ─────────────────────── */}
          <View style={styles.radioLeft}>
            {/* Eyebrow row: LIVE badge + station name */}
            <View style={styles.radioTopRow}>
              <View style={styles.radioLiveBadge}>
                {/* Static dot — deliberately not animated per design spec */}
                <View style={styles.radioLiveDot} />
                <Text style={styles.radioLiveLabel}>LIVE</Text>
              </View>
              <Text style={styles.radioEyebrow} numberOfLines={1}>NË TRANSMETIM</Text>
            </View>

            {/* Primary headline */}
            <Text style={styles.radioName} numberOfLines={1}>Radio Fontana</Text>

            {/* Meta + animated equalizer bars */}
            <View style={styles.radioMetaRow}>
              <Text style={styles.radioMeta}>Istog · 98.8 FM</Text>
              <View style={styles.bannerEqRow} pointerEvents="none">
                {BANNER_BAR_HEIGHTS.map((h, i) => (
                  <BannerEqBar key={i} maxH={h} offset={BANNER_BAR_OFFSETS[i]} phase={phase} />
                ))}
              </View>
            </View>
          </View>

          {/* ── Right: play CTA ────────────────────────────── */}
          <View style={styles.radioRight}>
            <View style={styles.radioPlayCircle}>
              <Play size={s(18)} color={colors.navyFixed} style={styles.radioPlayIconNudge} strokeWidth={1.5} />
            </View>
            <Text style={styles.radioPlayLabel}>DËGJO</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});



// ── HomeScreen ─────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
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
  const bottomInsetOffset = 4;

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
  // H-B8: refetchOnWindowFocus disabled on hero. The AppState listener in
  // _layout.tsx already invalidates home-hero after 5 min of background —
  // refetchOnWindowFocus was causing a redundant second fetch every return.
  const heroQuery = useQuery({
    queryKey: ['home-hero'],
    queryFn: ({ signal }) => fetchHeroPost(signal),
    refetchOnWindowFocus: false,
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
  const latestQuery   = useQuery({ queryKey: ['home-latest'],   queryFn: ({ signal }) => fetchLatestPosts('', '', 18, 0, signal), enabled: enableLatest, staleTime: 2 * 60 * 1000 });
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
  const isOpeningArticleRef = useRef(false);
  const onPressPost = useCallback(
    (post: Post) => {
      if (isOpeningArticleRef.current) return;
      isOpeningArticleRef.current = true;
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
      router.prefetch(`/news/${post.slug}`);
      // PROFILING FIX (round 2): staleTime Infinity makes a second prefetch
      // for the same slug a no-op while data exists or a fetch is in-flight,
      // and lets useQuery on the article screen treat the result as fresh
      // forever (combined with `refetchOnMount: false` there).
      queryClient.prefetchQuery({
        queryKey: ['post-detail', post.slug],
        queryFn: ({ signal }) => fetchPostBySlug(post.slug, signal),
        staleTime: Infinity,
      });
      // Navigate to the article from the home screen.
      //
      // Root cause of the "second tap only switches tabs" bug:
      //   TabRouter.getStateForAction for NAVIGATE merges route params when the
      //   target tab already has state. The nested `screen:'[slug]'` param is
      //   stored on the route object but NEVER forwarded as a navigate action to
      //   the inner StackRouter. So the tab switches (correct) but the stack
      //   doesn't move (bug). This initial-state mechanism only fires on the very
      //   first visit when the tab has no existing state.
      //
      // Fix (two-dispatch approach):
      //   When the news stack already exists (has a key), dispatch TWO synchronous
      //   actions that React Navigation batches into one state commit:
      //     1. Focus the news tab.
      //     2. Navigate within the news stack by targeting it directly via its key.
      //   When the news stack doesn't exist yet (first visit), fall back to the
      //   single-dispatch initial-state approach which still works correctly.
      const tabsState = navigation.getState();
      const newsRoute = tabsState?.routes?.find((r) => r.name === 'news');
      const newsStackKey = (newsRoute?.state as NavigationState | undefined)?.key;

      if (newsStackKey) {
        // Step 1: focus the tab (no-op if already focused).
        navigation.dispatch(CommonActions.navigate({ name: 'news' }));
        // Step 2: reset the news stack to [news list → article].
        // Using reset guarantees the user never accumulates multiple articles
        // when browsing from home — back always returns to the news list.
        navigation.dispatch({
          ...CommonActions.reset({
            index: 1,
            routes: [
              { name: 'index' },
              { name: '[slug]', params: { slug: post.slug } },
            ],
          }),
          target: newsStackKey,
        });
      } else {
        // First visit — tab uninitialized, initial-state mechanism handles nesting.
        navigation.dispatch(
          CommonActions.navigate({
            name: 'news',
            params: { screen: '[slug]', initial: false, params: { slug: post.slug } },
          }),
        );
      }
      setTimeout(() => {
        isOpeningArticleRef.current = false;
      }, 300);
    },
    [navigation, queryClient, router],
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
          router.prefetch(`/news/${slug}`);
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
  const refreshRunRef = useRef(0);
  // AUDIT FIX: removed refreshResetKey — changing FlashList `key` on every
  // pull-to-refresh destroyed the recycled view pool and forced a full
  // unmount/remount. FlashList handles refresh natively via `refreshing`.
  // const [refreshResetKey, setRefreshResetKey] = useState(0);
  const onPullToRefresh = useCallback(async () => {
    const runId = refreshRunRef.current + 1;
    refreshRunRef.current = runId;
    setIsRefreshing(true);
    setBannerVisible(true);
    try {
      await Promise.race([
        Promise.allSettled([
          refetchHero(),
          refetchBreaking(),
          refetchLatest(),
          refetchLocal(),
          queryClient.invalidateQueries({ queryKey: ['weather-istog'] }),
          new Promise<void>((resolve) => setTimeout(resolve, REFRESH_MIN_VISIBLE_MS)),
        ]),
        new Promise<void>((resolve) => setTimeout(resolve, REFRESH_MAX_WAIT_MS)),
      ]);
    } finally {
      if (refreshRunRef.current === runId) {
        setIsRefreshing(false);
        setBannerVisible(false);
        // AUDIT FIX: removed setRefreshResetKey — see above.
      }
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
    router.navigate('/(tabs)/live');
  }, [router]);

  const onOpenNewsPage = useCallback(() => {
    // Clear any stale pending category from a previous drawer navigation
    // so it cannot override the explicit "all categories" intent.
    getAndClearPendingDrawerCategory();
    // Explicitly pass category: '' so React Navigation does not preserve
    // a stale category param from a previous news-tab visit.
    router.navigate({ pathname: '/news', params: { category: '' } } as never);
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
      return <GridItem item={item} isLeft={isLeft} onPress={onPressPost} colors={colors} />;
    },
    [onPressPost, styles],
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
        {(heroQuery.isLoading || hero || heroQuery.isError) && (
          <View style={styles.sectionBlock}>
            {hero ? (
              <HeroCard hero={hero} heroImageUri={heroImageUri} onPress={onPressPost} colors={colors} />
            ) : heroQuery.isError ? (
              <View style={styles.heroErrorPlaceholder}>
                <AlertCircle size={28} color={colors.textMuted} strokeWidth={1.5} />
                <Text style={styles.heroErrorText}>Lajmi kryesor nuk disponohet</Text>
              </View>
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
        <LatestNewsHeader onSeeAll={onOpenNewsPage} />
      </View>
      );
    },
    // AUDIT FIX: removed `latestData.length` — the memoized JSX never reads
    // `latestData`, so every time the latest-posts query resolved the entire
    // header (HeroCard, WeatherWidget, RadioLiveBanner) recomputed unnecessarily.
    [hero, heroImageUri, heroQuery.isLoading, heroQuery.isError, bannerVisible, onPressPost, onOpenNewsPage, onPressLive, styles],
  );

  // ── List footer: Lokale → Footer ──────────────────────────────────────────
  const listFooter = useMemo(
    () => {
      return (
      <View>
        {/* ── LAJMET LOKALE ─────────────────────────────── */}
        <View style={styles.lokaleSection}>
          <LocalNewsHeader />
          {localData.length > 0 ? (
            // (≤12 items) — faster than nested FlashList.
            <View style={styles.localRailContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                fadingEdgeLength={0}
                decelerationRate="fast"
                contentContainerStyle={styles.localRail}
                removeClippedSubviews
              >
                {localData.map((post) => (
                  <LocalCard key={post._id} post={post} onPress={onPressPost} colors={colors} />
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
      </View>
      );
    },
    [localData, onPressPost, styles],
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
      <SearchResultCard item={item} onPress={onPressSearchResult} colors={colors} />
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
    [filteredData.length, styles],
  );
  const searchOverlayContentStyle = useMemo(
    () => ({
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: bottomInsetOffset,
    }),
    [bottomInsetOffset],
  );
  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {/* Fixed top bar */}
      <View style={[styles.headerShell, { paddingTop: insets.top }]}>
        {isSearchActive ? (
          <View style={styles.searchRow}>
            <Search size={18} color={colors.textMuted} style={{ marginLeft: 4 }} strokeWidth={1.5} />
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
              <X size={22} color={colors.text} strokeWidth={1.5} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.headerRow}>
            <Image source={isDark ? require('../../assets/images/logo-white-transparent.png') : require('../../assets/images/logo-blue-transparent.png')} contentFit="contain" priority="high" style={styles.headerLogo} />
            <View style={styles.headerSpacer} />
            <View style={styles.headerActions}>
              <Pressable onPress={onHeaderSearch} style={styles.headerIconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Kërko lajme">
                <Search size={20} color={colors.text} strokeWidth={1.5} />
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
              <Search size={44} color={colors.textFaint} strokeWidth={1.5} />
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
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onPullToRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        progressViewOffset={0}
        maintainVisibleContentPosition={DISABLE_MAINTAIN_VISIBLE_CONTENT_POSITION}
      />
    </View>
  );
}

// ── StyleSheet ─────────────────────────────────────────────────────────────────
const getStyles = (colors: ThemeColors, isDark = false) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgScreen,
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
    width: 60,
    height: 60,
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
    backgroundColor: colors.surfaceSubtle,
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
    backgroundColor: colors.surfaceSubtle,
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
    backgroundColor: colors.primaryDeep,
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakingLabel: {
    paddingHorizontal: 14,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
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
  tickerFadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 20,
  },
  tickerFadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 20,
  },
  breakingMeasureContainer: {
    position: 'absolute',
    left: -10000,
    top: 0,
    width: 8000,
    height: BREAKING_H,
    opacity: 0,
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
    borderRadius: s(22),
    backgroundColor: colors.navyFixed,
    ...elevation.card,
    overflow: 'hidden',
  },
  radioCardInner: {
    borderRadius: s(22),
    minHeight: s(110),
  },
  radioGhostFreq: {
    position: 'absolute',
    right: s(-4),
    bottom: -s(18),
    fontSize: s(96),
    fontFamily: fonts.uiBold,
    color: '#FFFFFF',
    opacity: 0.04,
    letterSpacing: -3,
    lineHeight: s(96),
  },
  radioRail: {
    position: 'absolute',
    left: 0,
    top: s(20),
    bottom: s(20),
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: colors.primary,
  },
  radioContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: s(18),
    paddingBottom: s(18),
    paddingLeft: s(20),
    paddingRight: s(16),
    gap: s(14),
  },
  radioLeft: {
    flex: 1,
    minWidth: 0,
  },
  radioTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    marginBottom: s(7),
  },
  radioLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(5),
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: s(9),
    paddingVertical: s(4),
  },
  radioLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFFFFF',
  },
  radioLiveLabel: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: ms(9),
    letterSpacing: 1.4,
  },
  radioEyebrow: {
    color: 'rgba(255,255,255,0.40)',
    fontFamily: fonts.uiBold,
    fontSize: ms(10),
    letterSpacing: 2.0,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  radioName: {
    fontFamily: fonts.uiBold,
    fontSize: ms(25),
    color: '#FFFFFF',
    letterSpacing: -0.7,
    lineHeight: ms(29),
    marginBottom: s(8),
  },
  radioMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
  },
  radioMeta: {
    fontFamily: fonts.uiMedium,
    fontSize: ms(12),
    color: 'rgba(255,255,255,0.42)',
    letterSpacing: 0.2,
  },
  bannerEqRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 20,
  },
  bannerEqBar: {
    width: 2.5,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  radioRight: {
    alignItems: 'center',
    gap: s(5),
  },
  radioPlayCircle: {
    width: s(50),
    height: s(50),
    borderRadius: s(25),
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.navyTint,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  radioPlayIconNudge: {
    marginLeft: 2,
  },
  radioPlayLabel: {
    color: 'rgba(255,255,255,0.40)',
    fontFamily: fonts.uiBold,
    fontSize: ms(9),
    letterSpacing: 1.8,
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
    letterSpacing: -0.6,
  },
  seeAll: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 13,
  },

  // ── Latest news editorial masthead ─────────────────────────────────────────
  latestHeader: {
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  latestTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  latestTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  latestAccentBar: {
    width: 3,
    height: 22,
    borderRadius: 2,
    backgroundColor: colors.primary,
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
    backgroundColor: colors.primary,
  },
  latestKicker: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: 2.0,
  },
  latestDate: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  latestTitleRow: {
    marginBottom: 6,
  },
  latestTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 22,
    letterSpacing: -0.6,
  },
  latestSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  latestSubhead: {
    color: colors.textTertiary,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
    flexShrink: 1,
  },
  latestSeeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  latestSeeAllText: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    letterSpacing: -0.1,
  },
  latestRuleHeavy: {
    height: 2,
    backgroundColor: colors.inkDark,
    marginBottom: 3,
  },
  latestRuleHair: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.inkDark,
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
    backgroundColor: colors.inkDark,
    marginBottom: 14,
  },
  latestCloserLabel: {
    color: colors.textMuted,
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: 2.0,
    marginBottom: 18,
  },
  latestCloserCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 22,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: colors.inkDark,
    borderRadius: radius.pill,
    shadowColor: colors.navy,
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
    color: colors.surface,
    fontFamily: fonts.uiBold,
    fontSize: 13.5,
    letterSpacing: -0.2,
  },
  latestCloserCtaArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  latestCloserSub: {
    color: colors.textMuted,
    fontFamily: fonts.articleItalic,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 14,
  },

  // ── Hero card ───────────────────────────────────────────────────────────────
  heroOuter: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...elevation.cardStrong,
  },
  heroCard: {
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  heroAccentRail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
    backgroundColor: colors.primary,
    zIndex: 2,
  },
  heroImageWrap: {
    width: '100%',
    aspectRatio: 3 / 2,
    backgroundColor: colors.border,
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
    backgroundColor: colors.border,
  },
  heroSkeleton: {
    borderRadius: radius.card,
  },
  heroErrorPlaceholder: {
    borderRadius: radius.card,
    backgroundColor: colors.surfaceSubtle,
    minHeight: 248,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  heroErrorText: {
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  heroContent: {
    paddingLeft: 18,
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
    backgroundColor: colors.primary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
  },
  heroBadgeText: {
    color: colors.surface,
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  heroKicker: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: 2.0,
  },
  heroHeadline: {
    color: colors.navy,
    fontFamily: fonts.uiBold,
    fontSize: 23,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  heroDeck: {
    color: colors.inkSoft,
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
    color: colors.inkFaint,
    fontFamily: fonts.uiRegular,
    fontSize: 10.5,
  },

  // ── Weather card ────────────────────────────────────────────────────────────
  weatherCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...elevation.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weatherInner: {
    backgroundColor: colors.surface,
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
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
  },
  weatherCircle2: {
    position: 'absolute',
    left: -s(36),
    bottom: -s(56),
    width: s(140),
    height: s(140),
    borderRadius: s(70),
    backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.018)',
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
    backgroundColor: colors.textFaint,
  },
  weatherCity: {
    color: colors.inkDark,
    fontFamily: fonts.uiBold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  weatherSub: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 11,
    letterSpacing: 0.1,
  },
  weatherIconPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSubtle,
  },
  weatherDataSkeleton: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  weatherDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  weatherDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  weatherTemp: {
    color: colors.inkDark,
    fontFamily: fonts.uiBold,
    fontSize: ms(50, 0.5),
    letterSpacing: -2,
    lineHeight: ms(56, 0.5),
  },
  weatherRight: {
    gap: 5,
  },
  weatherCondition: {
    color: colors.textSecondary,
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
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 12,
  },
  weatherErrorText: {
    color: colors.textFaint,
    fontFamily: fonts.uiRegular,
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center',
  },
  weatherForecastRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  weatherForecastDay: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  weatherForecastLabel: {
    fontFamily: fonts.uiBold,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  weatherForecastTemp: {
    fontFamily: fonts.uiMedium,
    fontSize: 12,
    color: colors.textSecondary,
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
    backgroundColor: colors.surface,
    ...elevation.card,
  },
  localCard: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  localImageWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surfaceElevated,
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
    backgroundColor: colors.border,
  },
  localBody: {
    paddingHorizontal: 9,
    paddingTop: 8,
    paddingBottom: 9,
    gap: 3,
  },
  localCatText: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 8,
    letterSpacing: 1.6,
  },
  localTitle: {
    color: colors.inkDark,
    fontFamily: fonts.uiBold,
    fontSize: 12.5,
    lineHeight: 17,
    letterSpacing: -0.15,
  },
  localTime: {
    color: colors.inkFaint,
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
    borderRadius: radius.md,
  },
  gridCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...elevation.card,
  },
  gridImgWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.border,
  },
  gridImg: {
    width: '100%',
    height: '100%',
  },
  gridBody: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
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
    backgroundColor: colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  gridBadgeText: {
    color: colors.surface,
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
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 8.5,
    letterSpacing: 1.8,
    flex: 1,
  },
  gridTitle: {
    color: colors.navy,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  gridTime: {
    color: colors.inkFaint,
    fontFamily: fonts.uiRegular,
    fontSize: 9.5,
  },

  // ── Lokale section ─────────────────────────────────────────────────────────
  lokaleSection: {
    marginTop: 18,
  },
  listFooterPad: {
    paddingBottom: 8,
  },


  // ── Local news editorial masthead ────────────────────────────────────────────
  localHeader: {
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  localTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  localAccentBar: {
    width: 3,
    height: 22,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  localHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  localKickerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  localPulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.primary,
  },
  localKicker: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: 2.0,
  },
  localTitleRow: {
    marginBottom: 5,
  },
  localHeaderTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 22,
    letterSpacing: -0.6,
  },
  localSubRow: {
    marginBottom: 12,
  },
  localSubhead: {
    color: colors.textTertiary,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  localRuleHeavy: {
    height: 2,
    backgroundColor: colors.inkDark,
    marginBottom: 3,
  },
  localRuleHair: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.inkDark,
    opacity: 0.6,
    marginBottom: 14,
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
    ...elevation.card,
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
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2.0,
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
