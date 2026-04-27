import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
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
  fetchPopularPosts,
  type Post,
} from '../../services/api';

const BREAKING_H = 42;

type LatestGridItem = Post | { _skeleton: string };

function isSkeletonItem(item: LatestGridItem): item is { _skeleton: string } {
  return '_skeleton' in item;
}

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

  useEffect(() => {
    if (!segmentWidth) {
      return;
    }

    cancelAnimation(translateX);
    translateX.value = 0;

    const duration = Math.max(16000, segmentWidth * 28);
    translateX.value = withRepeat(
      withTiming(-segmentWidth, {
        duration,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(translateX);
    };
  }, [segmentWidth, marqueeText, translateX]);

  const tickerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const onMeasureSegment = useCallback((event: LayoutChangeEvent) => {
    setSegmentWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <View style={styles.breakingStrip}>
      <View style={styles.breakingLabel}>
        <View style={styles.breakingDot} />
        <Text style={styles.breakingLabelText}>LIVE</Text>
      </View>
      <View style={styles.breakingTickerViewport}>
        <Animated.View style={[styles.breakingTickerTrack, tickerStyle]}>
          <Text onLayout={onMeasureSegment} numberOfLines={1} style={styles.breakingTickerText}>
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

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const headerHeight = insets.top + 58;
  const topInsetOffset = headerHeight + BREAKING_H + 14;
  const bottomInsetOffset = insets.bottom + 208;

  const latestSkeleton = useMemo(
    () => Array.from({ length: 6 }, (_, index) => ({ _skeleton: `latest-skeleton-${index}` })),
    [],
  );

  const heroQuery = useQuery({ queryKey: ['home-hero-post'], queryFn: fetchHeroPost });
  const breakingQuery = useQuery({ queryKey: ['home-breaking-posts'], queryFn: fetchBreakingPosts });
  const latestQuery = useQuery({
    queryKey: ['home-latest-posts'],
    queryFn: () => fetchLatestPosts('', '', 18),
  });
  const popularQuery = useQuery({
    queryKey: ['home-popular-posts'],
    queryFn: () => fetchPopularPosts(8),
  });

  const hero = heroQuery.data;
  const latestData = useMemo(() => latestQuery.data ?? [], [latestQuery.data]);
  const breakingData = useMemo(() => breakingQuery.data ?? [], [breakingQuery.data]);
  const popularData = useMemo(() => popularQuery.data ?? [], [popularQuery.data]);

  const showLatestSkeleton = latestQuery.isLoading && latestData.length === 0;
  const gridData: LatestGridItem[] = showLatestSkeleton ? latestSkeleton : latestData;

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
    ]);

    setRefreshing(false);
  }, [breakingQuery, heroQuery, latestQuery, popularQuery]);

  const onHeaderSearch = useCallback(() => {
    router.push('/(tabs)/news' as never);
  }, [router]);

  const heroImageUri = useMemo(
    () => buildSanityImageUrl(hero?.mainImageUrl, 1600),
    [hero?.mainImageUrl],
  );

  const renderPopularItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Post>) => (
      <Pressable onPress={() => onPressPost(item)} style={styles.popularCard}>
        <View style={styles.popularImageWrap}>
          <Image
            source={item.mainImageUrl ? { uri: buildSanityImageUrl(item.mainImageUrl, 600) } : undefined}
            placeholder={{ thumbhash: item.thumbhash || defaultThumbhash }}
            contentFit="cover"
            style={styles.popularImage}
          />
          <View style={styles.popularRankBadge}>
            <Text style={styles.popularRankText}>{index + 1}</Text>
          </View>
        </View>
        <View style={styles.popularBody}>
          <Text numberOfLines={1} style={styles.popularCategory}>
            {item.categories?.[0] ?? 'Lajme'}
          </Text>
          <Text numberOfLines={2} style={styles.popularTitle}>
            {item.title}
          </Text>
        </View>
      </Pressable>
    ),
    [onPressPost],
  );

  const renderLatestItem = useCallback(
    ({ item, index }: ListRenderItemInfo<LatestGridItem>) => {
      const columnSpacing = index % 2 === 0 ? styles.latestColumnLeft : styles.latestColumnRight;

      if (isSkeletonItem(item)) {
        return (
          <View style={[styles.latestColumn, columnSpacing]}>
            <SkeletonCard height={232} style={styles.latestSkeleton} />
          </View>
        );
      }

      const imageUri = buildSanityImageUrl(item.mainImageUrl, 900);

      return (
        <View style={[styles.latestColumn, columnSpacing]}>
          <Pressable onPress={() => onPressPost(item)} style={styles.latestCard}>
            <View style={styles.latestImageWrap}>
              <Image
                source={imageUri ? { uri: imageUri } : undefined}
                placeholder={{ thumbhash: item.thumbhash || defaultThumbhash }}
                contentFit="cover"
                transition={220}
                style={styles.latestImage}
              />

              <View style={styles.latestCategoryBadge}>
                <Text numberOfLines={1} style={styles.latestCategoryBadgeText}>
                  {item.categories?.[0] ?? 'Lajme'}
                </Text>
              </View>
            </View>

            <View style={styles.latestBody}>
              <Text numberOfLines={2} style={styles.latestTitle}>
                {item.title}
              </Text>

              <View style={styles.latestMetaRow}>
                <Text numberOfLines={1} style={styles.latestAuthor}>
                  {item.author ?? 'Redaksia Fontana'}
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

  const listHeader = useMemo(
    () => (
      <View>
        {/* ── HERO ──────────────────────────────────────────── */}
        <View style={styles.sectionBlock}>
          {hero ? (
            <>
              <Pressable onPress={() => onPressPost(hero)} style={styles.heroCard}>
                <Image
                  source={heroImageUri ? { uri: heroImageUri } : undefined}
                  placeholder={{ thumbhash: hero.thumbhash || defaultThumbhash }}
                  contentFit="cover"
                  transition={220}
                  style={styles.heroImage}
                />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.62)', 'rgba(0,0,0,0.88)']}
                  locations={[0.3, 0.65, 1]}
                  style={styles.heroOverlay}
                >
                  <View style={styles.heroCategoryBadge}>
                    <Text numberOfLines={1} style={styles.heroCategoryBadgeText}>
                      {hero.categories?.[0] ?? 'Lajme'}
                    </Text>
                  </View>
                  <Text numberOfLines={3} style={styles.heroHeadline}>
                    {hero.title}
                  </Text>
                </LinearGradient>
              </Pressable>
              <View style={styles.heroMetaRow}>
                <Text numberOfLines={1} style={styles.heroMetaAuthor}>
                  {hero.author ?? 'Redaksia Fontana'}
                </Text>
                <RelativeTime timestamp={hero.publishedAt} />
              </View>
            </>
          ) : (
            <SkeletonCard height={220} style={styles.heroSkeleton} />
          )}
        </View>

        {/* ── MË TË LEXUARA ─────────────────────────────────── */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <View style={styles.sectionAccentBar} />
              <Text style={styles.sectionTitle}>Më të Lexuara</Text>
            </View>
            <Pressable onPress={onHeaderSearch}>
              <Text style={styles.seeAllLink}>Shiko të gjitha →</Text>
            </Pressable>
          </View>
          <FlashList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={popularData}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.popularRail}
            renderItem={renderPopularItem}
            ListEmptyComponent={<SkeletonCard height={190} style={styles.popularSkeleton} />}
          />
        </View>

        {/* ── LAJMET E FUNDIT — section header ──────────────── */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <View style={styles.sectionAccentBar} />
            <Text style={styles.sectionTitle}>Lajmet e Fundit</Text>
          </View>
          <Pressable onPress={onHeaderSearch}>
            <Text style={styles.seeAllLink}>Shiko të gjitha →</Text>
          </Pressable>
        </View>
      </View>
    ),
    [
      hero,
      heroImageUri,
      onHeaderSearch,
      onPressPost,
      popularData,
      renderPopularItem,
    ],
  );

  return (
    <View style={styles.screen}>
      {/* ── Fixed top bar ─────────────────────────────────── */}
      <View style={[styles.headerShell, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Image source={appIdentity.logo} contentFit="cover" style={styles.headerLogo} />
          <View style={styles.headerActions}>
            <Pressable onPress={onHeaderSearch} style={styles.headerIconBtn} hitSlop={8}>
              <Ionicons name="search-outline" size={20} color={colors.text} />
            </Pressable>
            <HamburgerButton />
          </View>
        </View>
      </View>

      {/* ── Breaking ticker — fixed below header ──────────── */}
      <View style={[styles.breakingBand, { top: headerHeight }]}>
        <BreakingTicker headlines={breakingData.map((p) => p.title)} />
      </View>

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
        renderItem={renderLatestItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F3F5',
  },

  // ── Top bar ───────────────────────────────────────────────────────────────
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
    height: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLogo: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.surfaceSubtle,
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

  // ── Breaking band (position:absolute, below header) ───────────────────────
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
    paddingHorizontal: 14,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.28)',
  },
  breakingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    opacity: 0.92,
  },
  breakingLabelText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  breakingTickerViewport: {
    flex: 1,
    overflow: 'hidden',
    height: '100%',
    justifyContent: 'center',
  },
  breakingTickerTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakingTickerText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    lineHeight: BREAKING_H,
  },

  // ── Section layout ────────────────────────────────────────────────────────
  sectionBlock: {
    marginBottom: 28,
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
  sectionAccentBar: {
    width: 3,
    height: 20,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 18,
    letterSpacing: -0.25,
  },
  seeAllLink: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 13,
  },

  // ── Hero card ─────────────────────────────────────────────────────────────
  heroCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    ...elevation.card,
  },
  heroSkeleton: {
    borderRadius: 18,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#E5E7EB',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'space-between',
  },
  heroCategoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroCategoryBadgeText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroHeadline: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 23,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 2,
    overflow: 'hidden',
  },
  heroMetaAuthor: {
    color: colors.text,
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    flex: 1,
    flexShrink: 1,
    marginRight: 12,
  },

  // ── Popular rail (vertical cards, horizontal scroll) ──────────────────────
  popularRail: {
    paddingBottom: 4,
    gap: 12,
  },
  popularSkeleton: {
    width: 190,
    borderRadius: 14,
  },
  popularCard: {
    width: 190,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    ...elevation.card,
  },
  popularImageWrap: {
    width: '100%',
    height: 112,
    position: 'relative',
  },
  popularImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E7EB',
  },
  popularRankBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularRankText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 13,
  },
  popularBody: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 11,
    gap: 5,
  },
  popularCategory: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.0,
  },
  popularTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },

  // ── Latest grid ───────────────────────────────────────────────────────────
  latestColumn: {
    flex: 1,
    marginBottom: 12,
  },
  latestColumnLeft: {
    paddingRight: 6,
  },
  latestColumnRight: {
    paddingLeft: 6,
  },
  latestSkeleton: {
    borderRadius: 12,
  },
  latestCard: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    ...elevation.card,
  },
  latestImageWrap: {
    position: 'relative',
  },
  latestImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#E5E7EB',
  },
  latestCategoryBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  latestCategoryBadgeText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    maxWidth: 90,
  },
  latestBody: {
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 10,
    gap: 7,
    minHeight: 90,
  },
  latestTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  latestMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    overflow: 'hidden',
  },
  latestAuthor: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    flex: 1,
    flexShrink: 1,
  },
});
