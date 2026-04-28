import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
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

type LatestGridItem = Post | { _skeleton: string };

type QuickLink = {
  icon: string;
  title: string;
  route: '/programi' | '/na-kontakto' | '/rreth-nesh';
};

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
      <View style={styles.breakingFixedLabelWrap}>
        <Text numberOfLines={1} style={styles.breakingFixedLabelText}>
          BREAKING
        </Text>
      </View>

      <View style={styles.breakingTickerViewport}>
        <Animated.View style={[styles.breakingTickerTrack, tickerStyle]}>
          <Text onLayout={onMeasureSegment} numberOfLines={1} style={styles.breakingTickerText}>
            {`🔴 ${marqueeText}     `}
          </Text>
          <Text numberOfLines={1} style={styles.breakingTickerText}>
            {`🔴 ${marqueeText}     `}
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
  const topInsetOffset = headerHeight + 14;
  const bottomInsetOffset = insets.bottom + 208;

  const quickLinks = useMemo<QuickLink[]>(
    () => [
      { icon: '', title: 'Na Kontakto', route: '/na-kontakto' },
      { icon: 'ℹ️', title: 'Rreth Nesh', route: '/rreth-nesh' },
    ],
    [],
  );

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
      router.push({ pathname: '/(tabs)/news/[slug]' as never, params: { slug: post.slug } as never });
    },
    [router],
  );

  const onOpenQuickLink = useCallback(
    (route: QuickLink['route']) => {
      router.push(route as never);
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

  const onHeaderMenu = useCallback(() => {
    router.push('/na-kontakto' as never);
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
            source={item.mainImageUrl ? { uri: buildSanityImageUrl(item.mainImageUrl, 480) } : undefined}
            placeholder={{ thumbhash: item.thumbhash || defaultThumbhash }}
            contentFit="cover"
            style={styles.popularImage}
          />

          <View style={styles.popularRankBadge}>
            <Text style={styles.popularRankText}>{index + 1}</Text>
          </View>
        </View>

        <View style={styles.popularBody}>
          <Text numberOfLines={2} style={styles.popularTitle}>
            {item.title}
          </Text>
          <Text numberOfLines={1} style={styles.popularCategory}>
            {item.categories?.[0] ?? 'Lajme'}
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
        <View style={styles.sectionBlock}>
          {hero ? (
            <Pressable onPress={() => onPressPost(hero)} style={styles.heroCard}>
              <Image
                source={heroImageUri ? { uri: heroImageUri } : undefined}
                placeholder={{ thumbhash: hero.thumbhash || defaultThumbhash }}
                contentFit="cover"
                transition={220}
                style={styles.heroImage}
              />

              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.80)']}
                style={styles.heroGradientOverlay}
              >
                <View style={styles.heroBadgeRow}>
                  <View style={styles.heroCategoryBadge}>
                    <Text numberOfLines={1} style={styles.heroCategoryBadgeText}>
                      {hero.categories?.[0] ?? 'Lajme'}
                    </Text>
                  </View>

                  <View style={styles.heroTagBadge}>
                    <Text style={styles.heroTagBadgeText}>{hero.breaking ? 'BREAKING' : 'E SPIKATUR'}</Text>
                  </View>
                </View>

                <Text numberOfLines={3} style={styles.heroHeadline}>
                  {hero.title}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <SkeletonCard height={214} style={styles.heroSkeleton} />
          )}

          {hero ? (
            <View style={styles.heroMetaRow}>
              <Text numberOfLines={1} style={styles.heroMetaAuthor}>
                {hero.author ?? 'Redaksia Fontana'}
              </Text>
              <RelativeTime timestamp={hero.publishedAt} />
            </View>
          ) : null}
        </View>

        <View style={styles.sectionBlock}>
          <BreakingTicker headlines={breakingData.map((item) => item.title)} />
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Më të Lexuara</Text>

          <FlashList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={popularData}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.popularRail}
            renderItem={renderPopularItem}
            ListEmptyComponent={<SkeletonCard height={108} style={styles.popularSkeleton} />}
          />
        </View>

        <View style={[styles.sectionBlock, styles.latestHeaderRow]}>
          <Text style={styles.sectionTitle}>Lajmet e Fundit</Text>
          <Pressable onPress={onHeaderSearch}>
            <Text style={styles.seeAllLink}>Shiko të gjitha →</Text>
          </Pressable>
        </View>
      </View>
    ),
    [
      breakingData,
      hero,
      heroImageUri,
      onHeaderSearch,
      onPressPost,
      popularData,
      renderPopularItem,
    ],
  );

  const listFooter = useMemo(
    () => (
      <View style={styles.quickLinksSection}>
        <Text style={styles.sectionTitle}>Qasja e Shpejtë</Text>

        <View style={styles.quickLinksRow}>
          {quickLinks.map((item) => (
            <Pressable
              key={item.route}
              onPress={() => onOpenQuickLink(item.route)}
              style={styles.quickLinkCard}
            >
              <Text style={styles.quickLinkIcon}>{item.icon}</Text>
              <Text numberOfLines={1} style={styles.quickLinkTitle}>
                {item.title}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </View>
    ),
    [onOpenQuickLink, quickLinks],
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.headerShell, { paddingTop: insets.top + 6 }]}>
        <View style={[styles.headerRow, { height: headerHeight - insets.top - 6 }]}>
          <Image source={appIdentity.logo} contentFit="cover" style={styles.headerLogo} />

          <View style={styles.headerActions}>
            <Pressable onPress={onHeaderSearch} style={styles.headerIconButton}>
              <Ionicons name="search-outline" size={20} color={colors.text} />
            </Pressable>

            <Pressable onPress={onHeaderMenu} style={styles.headerIconButton}>
              <Ionicons name="options-outline" size={20} color={colors.text} />
            </Pressable>
          </View>
        </View>
      </View>

      <FlashList
        data={gridData}
        numColumns={2}
        keyExtractor={(item) => (isSkeletonItem(item) ? item._skeleton : item._id)}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: topInsetOffset, paddingBottom: bottomInsetOffset },
        ]}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        renderItem={renderLatestItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerShell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  headerRow: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  sectionBlock: {
    marginBottom: 24,
  },
  heroCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    ...elevation.card,
  },
  heroSkeleton: {
    borderRadius: 16,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#F3F4F6',
  },
  heroGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  heroCategoryBadge: {
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
    letterSpacing: 0.4,
  },
  heroTagBadge: {
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroTagBadgeText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroHeadline: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  heroMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroMetaAuthor: {
    color: colors.text,
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    marginRight: 12,
    flex: 1,
  },
  breakingStrip: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
  },
  breakingFixedLabelWrap: {
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.28)',
    justifyContent: 'center',
    height: '100%',
  },
  breakingFixedLabelText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  breakingTickerViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  breakingTickerTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakingTickerText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 27,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  popularRail: {
    marginTop: 10,
    paddingBottom: 2,
    gap: 10,
  },
  popularSkeleton: {
    width: 290,
    borderRadius: 12,
  },
  popularCard: {
    width: 300,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEF2F7',
    flexDirection: 'row',
    ...elevation.card,
  },
  popularImageWrap: {
    width: 126,
    position: 'relative',
  },
  popularImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F3F4F6',
  },
  popularRankBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularRankText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 12,
  },
  popularBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'space-between',
    gap: 8,
  },
  popularTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 15,
    lineHeight: 21,
  },
  popularCategory: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  latestHeaderRow: {
    marginTop: -2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAllLink: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 13,
  },
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
    borderWidth: 1,
    borderColor: '#EEF2F7',
    overflow: 'hidden',
    ...elevation.card,
  },
  latestImageWrap: {
    position: 'relative',
  },
  latestImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#F3F4F6',
  },
  latestCategoryBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  latestCategoryBadgeText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    maxWidth: 90,
  },
  latestBody: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
    minHeight: 98,
  },
  latestTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  latestMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  latestAuthor: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 12,
    flex: 1,
  },
  quickLinksSection: {
    marginTop: 12,
    marginBottom: 12,
  },
  quickLinksRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  quickLinkCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...elevation.card,
  },
  quickLinkIcon: {
    fontSize: 20,
    lineHeight: 22,
  },
  quickLinkTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 12,
    textAlign: 'center',
  },
});
