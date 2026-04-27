import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { HamburgerButton } from '../../components/HamburgerButton';
import { RelativeTime } from '../../components/RelativeTime';
import { SkeletonCard } from '../../components/SkeletonCard';
import { appIdentity, colors, elevation, fonts, radius } from '../../design-tokens';
import {
  buildSanityImageUrl,
  defaultThumbhash,
  fetchBreakingPosts,
  fetchHeroPost,
  fetchLatestPosts,
  fetchLocalPosts,
  fetchPopularPosts,
  type Post,
} from '../../services/api';

const BREAKING_H = 44;

type LatestGridItem = Post | { _skeleton: string };
function isSkeletonItem(item: LatestGridItem): item is { _skeleton: string } {
  return '_skeleton' in item;
}

// ── Weather ────────────────────────────────────────────────────────────────────
type WeatherResponse = {
  current: { temperature_2m: number; weathercode: number; windspeed_10m: number };
};

function wInfo(code: number): { label: string; icon: string; g0: string; g1: string } {
  if (code === 0)  return { label: 'E kthjellët',      icon: '☀️',  g0: '#1558B0', g1: '#4A9FDF' };
  if (code <= 3)   return { label: 'Me re të lehta',   icon: '⛅',  g0: '#1E6BAA', g1: '#7BBDE8' };
  if (code <= 48)  return { label: 'Mjegull',           icon: '🌫️', g0: '#4A5568', g1: '#718096' };
  if (code <= 57)  return { label: 'Vesë e lehtë',      icon: '🌦️', g0: '#1A40A0', g1: '#5070D0' };
  if (code <= 67)  return { label: 'Shi',               icon: '🌧️', g0: '#1A2E4A', g1: '#2D5080' };
  if (code <= 77)  return { label: 'Borë',              icon: '❄️',  g0: '#7BA4C0', g1: '#C8E4F4' };
  if (code <= 82)  return { label: 'Rrebeshe shi',      icon: '⛈️', g0: '#192030', g1: '#2D4060' };
  return                  { label: 'Stuhi',             icon: '⛈️', g0: '#0D1218', g1: '#1A2030' };
}

async function fetchWeatherIstog(): Promise<WeatherResponse> {
  const res = await fetch(
    'https://api.open-meteo.com/v1/forecast?latitude=42.78&longitude=20.48&current=temperature_2m,weathercode,windspeed_10m&timezone=Europe%2FBelgrade',
  );
  if (!res.ok) throw new Error('weather');
  return res.json() as Promise<WeatherResponse>;
}

// ── WeatherWidget ──────────────────────────────────────────────────────────────
function WeatherWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['weather-istog'],
    queryFn: fetchWeatherIstog,
    staleTime: 30 * 60 * 1000,
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
      <LinearGradient
        colors={info ? [info.g0, info.g1] : ['#1558B0', '#4A9FDF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.weatherGrad}
      >
        {/* Decorative circle highlight */}
        <View style={styles.weatherCircle} />

        <View style={styles.weatherTopRow}>
          <View>
            <Text style={styles.weatherCity}>Istog, Kosovë</Text>
            <Text style={styles.weatherSub}>Moti tani</Text>
          </View>
          {isLoading || !data ? (
            <View style={styles.weatherIconPlaceholder} />
          ) : (
            <Text style={styles.weatherEmoji}>{info?.icon}</Text>
          )}
        </View>

        {isLoading || !data ? (
          <View style={styles.weatherDataSkeleton} />
        ) : (
          <Animated.View style={[styles.weatherDataRow, revealStyle]}>
            <Text style={styles.weatherTemp}>{Math.round(data.current.temperature_2m)}°</Text>
            <View style={styles.weatherRight}>
              <Text style={styles.weatherCondition}>{info?.label}</Text>
              <View style={styles.weatherWindRow}>
                <Ionicons name="flag-outline" size={13} color="rgba(255,255,255,0.7)" />
                <Text style={styles.weatherWind}>
                  {Math.round(data.current.windspeed_10m)} km/h erë
                </Text>
              </View>
            </View>
          </Animated.View>
        )}
      </LinearGradient>
    </View>
  );
}

// ── BreakingTicker ─────────────────────────────────────────────────────────────
function BreakingTicker({ headlines }: { headlines: string[] }) {
  const marqueeText = useMemo(
    () =>
      headlines.length > 0
        ? headlines.join('   •   ')
        : 'Lajmet e fundit nga RTV Fontana',
    [headlines],
  );

  const [segmentWidth, setSegmentWidth] = useState(0);
  const translateX = useSharedValue(0);
  const dotOpacity = useSharedValue(1);

  useEffect(() => {
    if (!segmentWidth) return;
    cancelAnimation(translateX);
    translateX.value = 0;
    const duration = Math.max(18000, segmentWidth * 30);
    translateX.value = withRepeat(
      withTiming(-segmentWidth, { duration, easing: Easing.linear }),
      -1,
      false,
    );
    return () => { cancelAnimation(translateX); };
  }, [segmentWidth, marqueeText, translateX]);

  useEffect(() => {
    dotOpacity.value = withRepeat(
      withTiming(0.18, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => { cancelAnimation(dotOpacity); };
  }, [dotOpacity]);

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

// ── HeroCard ───────────────────────────────────────────────────────────────────
function HeroCard({
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

  return (
    <Animated.View style={[styles.heroOuter, scaleStyle]}>
      <Pressable
        onPress={() => onPress(hero)}
        onPressIn={() => {
          scale.value = withSpring(0.974, { damping: 22, stiffness: 400 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 280 });
        }}
        style={styles.heroInner}
      >
        <Image
          source={heroImageUri ? { uri: heroImageUri } : undefined}
          placeholder={{ thumbhash: hero.thumbhash || defaultThumbhash }}
          contentFit="cover"
          transition={280}
          style={styles.heroImage}
        />
        <LinearGradient
          colors={[
            'transparent',
            'rgba(0,0,0,0.06)',
            'rgba(0,0,0,0.68)',
            'rgba(0,0,0,0.96)',
          ]}
          locations={[0, 0.28, 0.62, 1]}
          style={StyleSheet.absoluteFill}
        />
        {/* Top badges */}
        <View style={styles.heroTopRow}>
          <View style={styles.heroCatBadge}>
            <Text style={styles.heroCatText}>{cat.toUpperCase()}</Text>
          </View>
          {hero.breaking ? (
            <View style={styles.heroBreakingBadge}>
              <View style={styles.heroBreakingDot} />
              <Text style={styles.heroBreakingText}>LIVE</Text>
            </View>
          ) : null}
        </View>
        {/* Bottom overlay */}
        <View style={styles.heroBottom}>
          <Text numberOfLines={3} style={styles.heroTitle}>{hero.title}</Text>
          <View style={styles.heroMeta}>
            <View style={styles.heroAuthorDot} />
            <Text numberOfLines={1} style={styles.heroAuthorText}>
              {hero.author ?? 'Redaksia Fontana'}
            </Text>
            <View style={styles.heroMetaSep} />
            <RelativeTime timestamp={hero.publishedAt} style={styles.heroTimeText} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── LocalCard (compact overlay card for horizontal rail) ──────────────────────
function LocalCard({ post, onPress }: { post: Post; onPress: (p: Post) => void }) {
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const imageUri = buildSanityImageUrl(post.mainImageUrl, 640);

  return (
    <Animated.View style={[styles.localOuter, scaleStyle]}>
      <Pressable
        onPress={() => onPress(post)}
        onPressIn={() => { scale.value = withSpring(0.958, { damping: 20, stiffness: 400 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 18, stiffness: 280 }); }}
        style={styles.localInner}
      >
        <Image
          source={imageUri ? { uri: imageUri } : undefined}
          placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
          contentFit="cover"
          transition={200}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.84)']}
          locations={[0.3, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.localCatBadge}>
          <Text style={styles.localCatText}>
            {(post.categories?.[0] ?? 'Lajme').toUpperCase()}
          </Text>
        </View>
        <View style={styles.localBottom}>
          <Text numberOfLines={2} style={styles.localTitle}>{post.title}</Text>
          <RelativeTime timestamp={post.publishedAt} style={styles.localTime} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── SectionHeader (reusable inside header/footer) ─────────────────────────────
function SectionHeader({
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
}

// ── HomeScreen ─────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);

  const headerHeight = insets.top + 66;
  const topInsetOffset = headerHeight + BREAKING_H + 14;
  const bottomInsetOffset = insets.bottom + 208;

  const latestSkeleton = useMemo(
    () => Array.from({ length: 6 }, (_, i) => ({ _skeleton: `sk-${i}` })),
    [],
  );

  const heroQuery    = useQuery({ queryKey: ['home-hero'],    queryFn: fetchHeroPost });
  const breakingQuery = useQuery({ queryKey: ['home-breaking'], queryFn: fetchBreakingPosts });
  const latestQuery  = useQuery({ queryKey: ['home-latest'],  queryFn: () => fetchLatestPosts('', '', 18) });
  const popularQuery = useQuery({ queryKey: ['home-popular'], queryFn: () => fetchPopularPosts(8) });
  const localQuery   = useQuery({ queryKey: ['home-local'],   queryFn: () => fetchLocalPosts(12) });

  const hero         = heroQuery.data;
  const heroImageUri = useMemo(() => buildSanityImageUrl(hero?.mainImageUrl, 1600) ?? null, [hero?.mainImageUrl]);
  const latestData   = useMemo(() => latestQuery.data ?? [], [latestQuery.data]);
  const breakingData = useMemo(() => breakingQuery.data ?? [], [breakingQuery.data]);
  const popularData  = useMemo(() => popularQuery.data ?? [], [popularQuery.data]);
  const localData    = useMemo(() => localQuery.data ?? [], [localQuery.data]);

  const showLatestSkeleton = latestQuery.isLoading && latestData.length === 0;
  const gridData: LatestGridItem[] = showLatestSkeleton ? latestSkeleton : latestData;

  const filteredData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return latestData;
    return latestData.filter(
      (p) => p.title.toLowerCase().includes(q) || (p.excerpt ?? '').toLowerCase().includes(q),
    );
  }, [searchQuery, latestData]);

  const onPressPost = useCallback(
    (post: Post) => {
      router.push({ pathname: '/article/[slug]' as never, params: { slug: post.slug } as never });
    },
    [router],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await Promise.all([
      heroQuery.refetch(),
      breakingQuery.refetch(),
      latestQuery.refetch(),
      popularQuery.refetch(),
      localQuery.refetch(),
    ]);
    setRefreshing(false);
  }, [heroQuery, breakingQuery, latestQuery, popularQuery, localQuery]);

  const onHeaderSearch = useCallback(() => {
    setIsSearchActive(true);
    setTimeout(() => searchInputRef.current?.focus(), 80);
  }, []);

  const exitSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery('');
    searchInputRef.current?.blur();
  }, []);

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
      const imageUri = buildSanityImageUrl(item.mainImageUrl, 900);
      return (
        <View style={[styles.gridColumn, isLeft ? styles.gridColLeft : styles.gridColRight]}>
          <Pressable
            onPress={() => onPressPost(item)}
            style={({ pressed }) => [styles.gridCard, pressed && styles.gridCardPressed]}
          >
            <View style={styles.gridImgWrap}>
              <Image
                source={imageUri ? { uri: imageUri } : undefined}
                placeholder={{ thumbhash: item.thumbhash || defaultThumbhash }}
                contentFit="cover"
                transition={220}
                style={styles.gridImg}
              />
              <View style={styles.gridCatBadge}>
                <Text numberOfLines={1} style={styles.gridCatText}>
                  {item.categories?.[0] ?? 'Lajme'}
                </Text>
              </View>
            </View>
            <View style={styles.gridBody}>
              <Text numberOfLines={2} style={styles.gridTitle}>{item.title}</Text>
              <View style={styles.gridMetaRow}>
                <Text numberOfLines={1} style={styles.gridAuthor}>
                  {item.author ?? 'Redaksia'}
                </Text>
                <RelativeTime timestamp={item.publishedAt} />
              </View>
            </View>
          </Pressable>
        </View>
      );
    },
    [onPressPost],
  );

  // ── List header: Hero → Weather → section header for grid ──────────────────
  const listHeader = useMemo(
    () => (
      <View>
        {/* ── HERO ─────────────────────────────────────────── */}
        <View style={styles.sectionBlock}>
          {hero ? (
            <HeroCard hero={hero} heroImageUri={heroImageUri} onPress={onPressPost} />
          ) : (
            <SkeletonCard height={248} style={styles.heroSkeleton} />
          )}
        </View>

        {/* ── WEATHER ─────────────────────────────────────── */}
        <View style={styles.sectionBlock}>
          <WeatherWidget />
        </View>

        {/* ── LAJMET E FUNDIT section header ──────────────── */}
        <SectionHeader title="Lajmet e Fundit" onSeeAll={onHeaderSearch} />
      </View>
    ),
    [hero, heroImageUri, onPressPost, onHeaderSearch],
  );

  // ── List footer: Lokale → Popular → Footer cards ──────────────────────────
  const listFooter = useMemo(
    () => (
      <View>
        {/* ── LAJMET LOKALE ─────────────────────────────── */}
        <View style={[styles.sectionBlock, { marginTop: 20 }]}>
          <SectionHeader title="Lajmet Lokale" onSeeAll={onHeaderSearch} />
          {localData.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.localRail}
              decelerationRate="fast"
            >
              {localData.map((item) => (
                <LocalCard key={item._id} post={item} onPress={onPressPost} />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.localRailSkeleton}>
              <SkeletonCard height={200} style={styles.localSkeletonCard} />
              <SkeletonCard height={200} style={styles.localSkeletonCard} />
              <SkeletonCard height={200} style={styles.localSkeletonCard} />
            </View>
          )}
        </View>

        {/* ── MË TË LEXUARA ─────────────────────────────── */}
        <View style={styles.sectionBlock}>
          <SectionHeader title="Më të Lexuara" onSeeAll={onHeaderSearch} />
          {popularData.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.popularRail}
              decelerationRate="fast"
            >
              {popularData.map((item, index) => (
                <Pressable
                  key={item._id}
                  onPress={() => onPressPost(item)}
                  style={({ pressed }) => [styles.popularCard, pressed && styles.popularCardPressed]}
                >
                  <View style={styles.popularImgWrap}>
                    <Image
                      source={item.mainImageUrl ? { uri: buildSanityImageUrl(item.mainImageUrl, 600) } : undefined}
                      placeholder={{ thumbhash: item.thumbhash || defaultThumbhash }}
                      contentFit="cover"
                      style={styles.popularImg}
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.42)']}
                      locations={[0.45, 1]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.popularRank}>
                      <Text style={styles.popularRankText}>{index + 1}</Text>
                    </View>
                  </View>
                  <View style={styles.popularBody}>
                    <Text numberOfLines={1} style={styles.popularCat}>
                      {item.categories?.[0] ?? 'Lajme'}
                    </Text>
                    <Text numberOfLines={2} style={styles.popularTitle}>{item.title}</Text>
                    <RelativeTime timestamp={item.publishedAt} style={styles.popularTime} />
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.popularRailSkeleton}>
              <SkeletonCard height={190} style={styles.popularSkeleton} />
              <SkeletonCard height={190} style={styles.popularSkeleton} />
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
            © {new Date().getFullYear()} RTV Fontana · Istog, Kosovë
          </Text>
        </View>
      </View>
    ),
    [localData, popularData, onPressPost, onHeaderSearch, router],
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
            <Image source={appIdentity.logo} contentFit="cover" style={styles.headerLogo} />
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
          <BreakingTicker headlines={breakingData.map((p) => p.title)} />
        </View>
      )}

      {/* Search overlay */}
      {isSearchActive && (
        <ScrollView
          style={[styles.searchOverlay, { top: headerHeight }]}
          contentContainerStyle={[styles.searchOverlayContent, { paddingBottom: bottomInsetOffset }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {searchQuery.trim() === '' ? (
            <Text style={styles.searchHint}>Shkruaj emrin e artikullit për të kërkuar...</Text>
          ) : filteredData.length === 0 ? (
            <View style={styles.searchEmpty}>
              <Ionicons name="search-outline" size={44} color="#D1D5DB" />
              <Text style={styles.searchEmptyTitle}>Asnjë rezultat</Text>
              <Text style={styles.searchEmptyText}>
                Nuk u gjet asnjë artikull për "{searchQuery}"
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.searchCount}>
                {filteredData.length} rezultat{filteredData.length !== 1 ? 'e' : ''}
              </Text>
              {filteredData.map((item) => (
                <Pressable
                  key={item._id}
                  style={({ pressed }) => [
                    styles.searchResultCard,
                    pressed && styles.searchResultPressed,
                  ]}
                  onPress={() => { exitSearch(); onPressPost(item); }}
                >
                  <Image
                    source={item.mainImageUrl ? { uri: buildSanityImageUrl(item.mainImageUrl, 400) } : undefined}
                    placeholder={{ thumbhash: item.thumbhash || defaultThumbhash }}
                    contentFit="cover"
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
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* Main content */}
      <FlashList
        data={gridData}
        numColumns={2}
        keyExtractor={(item) => (isSkeletonItem(item) ? item._skeleton : item._id)}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={onRefresh} />
        }
        decelerationRate="fast"
        contentContainerStyle={{
          paddingTop: topInsetOffset,
          paddingBottom: bottomInsetOffset,
          paddingHorizontal: 16,
        }}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        renderItem={renderGridItem}
      />
    </View>
  );
}

// ── StyleSheet ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F3F5',
  },

  // ── Top bar ─────────────────────────────────────────────────────────────────
  headerShell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
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
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakingLabel: {
    paddingHorizontal: 13,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.24)',
  },
  breakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  breakingLabelText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9.5,
    letterSpacing: 1.4,
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
    color: '#FFFFFF',
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    lineHeight: BREAKING_H,
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
    width: 3,
    height: 22,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 19,
    letterSpacing: -0.3,
  },
  seeAll: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 13,
  },

  // ── Hero card ───────────────────────────────────────────────────────────────
  heroOuter: {
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  heroInner: {
    borderRadius: 22,
    overflow: 'hidden',
    minHeight: 248,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#D1D5DB',
  },
  heroSkeleton: {
    borderRadius: 22,
  },
  heroTopRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroCatBadge: {
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  heroCatText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9.5,
    letterSpacing: 0.7,
  },
  heroBreakingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBreakingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  heroBreakingText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9.5,
    letterSpacing: 1.1,
  },
  heroBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 15,
    paddingBottom: 15,
    paddingTop: 8,
    gap: 9,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 24,
    lineHeight: 31,
    letterSpacing: -0.55,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  heroAuthorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.65)',
    flexShrink: 0,
  },
  heroAuthorText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    flex: 1,
    flexShrink: 1,
  },
  heroMetaSep: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.38)',
    flexShrink: 0,
  },
  heroTimeText: {
    color: 'rgba(255,255,255,0.70)',
    fontFamily: fonts.uiRegular,
    fontSize: 13,
  },

  // ── Weather card ────────────────────────────────────────────────────────────
  weatherCard: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  weatherGrad: {
    padding: 20,
    minHeight: 120,
    position: 'relative',
    overflow: 'hidden',
  },
  weatherCircle: {
    position: 'absolute',
    right: -48,
    top: -48,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  weatherTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  weatherCity: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 17,
    letterSpacing: -0.25,
    lineHeight: 22,
  },
  weatherSub: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    marginTop: 2,
  },
  weatherIconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  weatherEmoji: {
    fontSize: 44,
    lineHeight: 50,
  },
  weatherDataSkeleton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  weatherDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  weatherTemp: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 52,
    letterSpacing: -2,
    lineHeight: 58,
  },
  weatherRight: {
    gap: 4,
  },
  weatherCondition: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  weatherWindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weatherWind: {
    color: 'rgba(255,255,255,0.70)',
    fontFamily: fonts.uiMedium,
    fontSize: 13,
  },

  // ── Local cards (horizontal compact overlay) ────────────────────────────────
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
    width: 170,
    borderRadius: 18,
    marginRight: 12,
  },
  localOuter: {
    width: 170,
    height: 210,
    borderRadius: 18,
    marginRight: 12,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  localInner: {
    width: 170,
    height: 210,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#D1D5DB',
  },
  localCatBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  localCatText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 8.5,
    letterSpacing: 0.5,
  },
  localBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 11,
    gap: 5,
  },
  localTitle: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.15,
  },
  localTime: {
    color: 'rgba(255,255,255,0.68)',
    fontFamily: fonts.uiRegular,
    fontSize: 11,
  },

  // ── Popular rail ─────────────────────────────────────────────────────────────
  popularRail: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingBottom: 4,
  },
  popularRailSkeleton: {
    flexDirection: 'row',
    gap: 12,
  },
  popularSkeleton: {
    width: 190,
    borderRadius: 16,
    marginRight: 12,
  },
  popularCard: {
    width: 190,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginRight: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  popularCardPressed: {
    opacity: 0.92,
  },
  popularImgWrap: {
    width: '100%',
    height: 114,
    position: 'relative',
  },
  popularImg: {
    width: '100%',
    height: '100%',
    backgroundColor: '#D1D5DB',
  },
  popularRank: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  popularRankText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 13,
  },
  popularBody: {
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 11,
    gap: 5,
  },
  popularCat: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  popularTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  popularTime: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 11,
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
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    ...elevation.card,
  },
  gridCardPressed: {
    opacity: 0.94,
  },
  gridImgWrap: {
    position: 'relative',
  },
  gridImg: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#D1D5DB',
  },
  gridCatBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  gridCatText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    maxWidth: 90,
  },
  gridBody: {
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 10,
    gap: 7,
    minHeight: 90,
  },
  gridTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  gridMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    overflow: 'hidden',
  },
  gridAuthor: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    flex: 1,
    flexShrink: 1,
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
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.30,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  footerCardAbout: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000',
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
    backgroundColor: '#F2F3F5',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchResultPressed: {
    backgroundColor: colors.redTint,
  },
  searchResultImg: {
    width: 90,
    height: 90,
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
