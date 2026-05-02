import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NewsCard } from '../../../components/news/NewsCard';
import { RelativeTime } from '../../../components/ui/RelativeTime';
import { RefreshStatusBanner } from '../../../components/ui/RefreshStatusBanner';
import { SkeletonCard } from '../../../components/news/SkeletonCard';
import { HamburgerButton } from '../../../components/ui/HamburgerButton';
import { appIdentity, colors, fonts } from '../../../constants/tokens';
import { queueImagePrefetch } from '../../../lib/prefetchQueue';
import {
  buildSanityImageUrl,
  defaultThumbhash,
  fetchLatestPosts,
  fetchPostBySlug,
  sanityImageWidths,
  type Post,
} from '../../../services/api';

// ── Category tabs ─────────────────────────────────────────────────────────────
type NewsCategoryTab = { label: string; slug: string };

const NEWS_CATEGORY_TABS: NewsCategoryTab[] = [
  { label: 'Të Gjitha',  slug: '' },
  { label: 'Politikë',   slug: 'politike' },
  { label: 'Sport',      slug: 'sport' },
  { label: 'Teknologji', slug: 'teknologji' },
  { label: 'Showbiz',    slug: 'showbiz' },
  { label: 'Shëndetësi', slug: 'shendetesi' },
  { label: 'Biznes',     slug: 'biznes' },
  { label: 'Nga Bota',   slug: 'nga-bota' },
];

const DISABLE_MAINTAIN_VISIBLE_CONTENT_POSITION = { disabled: true } as const;

// ── Featured card (first item, large editorial) ───────────────────────────────
const FeaturedCard = memo(function FeaturedCard({ post, onPress }: { post: Post; onPress: (p: Post) => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const imageUri = useMemo(
    () => buildSanityImageUrl(post.mainImageUrl, sanityImageWidths.newsFeatured),
    [post.mainImageUrl],
  );
  const cat = post.categories?.[0] ?? 'Lajme';
  const onCardPress = useCallback(() => onPress(post), [onPress, post]);

  return (
    <Animated.View style={[SF.outer, animStyle]}>
      <Pressable
        onPress={onCardPress}
        onPressIn={() => { scale.value = withTiming(0.985, { duration: 100 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 180 }); }}
        style={SF.inner}
      >
        {/* Image — cinematic 16:10, no overlays */}
        <View style={SF.imageZone}>
          <Image
            source={imageUri ? { uri: imageUri } : undefined}
            placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
            recyclingKey={post._id}
            contentFit="cover"
            transition={0}
            style={SF.image}
          />
          <View style={SF.imageDivider} />
        </View>

        {/* White editorial panel */}
        <View style={SF.content}>
          {post.breaking ? (
            <View style={SF.breakingBadge}>
              <Text style={SF.breakingText}>LAJM I FUNDIT</Text>
            </View>
          ) : null}

          <Text style={SF.kicker} numberOfLines={1}>{cat.toUpperCase()}</Text>

          <Text numberOfLines={3} style={SF.headline}>{post.title}</Text>

          {post.excerpt ? (
            <Text numberOfLines={2} style={SF.deck}>{post.excerpt}</Text>
          ) : null}

          <RelativeTime timestamp={post.publishedAt} style={SF.time} />
        </View>
      </Pressable>
    </Animated.View>
  );
});

// ── Tiny relative-time helper (avoids extra component in this context) ─────────

// ── Category pill ─────────────────────────────────────────────────────────────
const CategoryPill = memo(function CategoryPill({
  item,
  active,
  onPress,
}: {
  item: NewsCategoryTab;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[SP.pill, active && SP.pillActive]}
    >
      <Text style={[SP.pillText, active && SP.pillTextActive]}>{item.label}</Text>
    </Pressable>
  );
});

// ── Search input (isolated) ──────────────────────────────────────────────────
// Owns its per-keystroke state so the large sticky header and FlashList only
// hear about search after the debounce settles.
const SearchInput = memo(function SearchInput({
  onSearchChange,
}: {
  onSearchChange: (next: string) => void;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const next = value.trim().toLowerCase();
    const timer = setTimeout(() => {
      onSearchChange(next);
    }, 300);
    return () => clearTimeout(timer);
  }, [onSearchChange, value]);

  const onClear = useCallback(() => {
    setValue('');
    onSearchChange('');
  }, [onSearchChange]);

  return (
    <View style={S.searchRow}>
      <Ionicons name="search-outline" size={16} color={colors.textMuted} style={S.searchIcon} />
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="Kërko lajme..."
        placeholderTextColor={colors.textTertiary}
        style={S.searchInput}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {value.length > 0 ? (
        <Pressable onPress={onClear} hitSlop={8} style={S.clearBtn}>
          <Ionicons name="close-circle" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
});

// ── Constants ────────────────────────────────────────────────────────────────
const LOADING_ROWS = [1, 2, 3];

// ── Main screen ───────────────────────────────────────────────────────────────
export default function NewsIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashListRef<Post>>(null);
  const [activeCategory, setActiveCategory] = useState<NewsCategoryTab>(NEWS_CATEGORY_TABS[0]);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Header height: statusBar + titleRow(66) + search(54) + categories(50) + divider(1)
  const HEADER_H = insets.top + 171;
  const bottomInsetOffset = insets.bottom + 190;

  const postsQuery = useQuery({
    queryKey: ['news-feed', activeCategory.slug, debouncedSearch],
    queryFn: ({ signal }) => fetchLatestPosts(activeCategory.slug, debouncedSearch, 40, signal),
    placeholderData: (previousData) => previousData,
    // H-B11: 5min gcTime so flipping through all 7 category tabs once does
    // NOT leave 7 \u00d7 60KB feeds resident for half an hour. Re-entering a
    // category within 5 min still hits cache; longer than that just refetches.
    gcTime: 5 * 60 * 1000,
  });
  const refetchPosts = postsQuery.refetch;

  const queryClient = useQueryClient();

  const openPost = useCallback(
    (post: Post) => {
      // Pre-fetch the exact hero URL used by the article screen so navigation
      // does not fetch a second, larger Sanity image variant.
      // M-C3: capped at 3 concurrent so card-mashing never floods the socket pool.
      queueImagePrefetch(buildSanityImageUrl(post.mainImageUrl, sanityImageWidths.articleHero));
      // AUDIT FIX P2.5: warm route module + post-detail query so the article
      // screen renders the moment the slide animation completes.
      router.prefetch(`/news/${post.slug}` as never);
      queryClient.prefetchQuery({
        queryKey: ['post-detail', post.slug],
        queryFn: ({ signal }) => fetchPostBySlug(post.slug, signal),
        // PROFILING FIX (round 2): see comment in (tabs)/index.tsx.
        staleTime: Infinity,
      });
      router.push({ pathname: '/news/[slug]' as never, params: { slug: post.slug } as never });
    },
    [router, queryClient],
  );

  const onSelectCategory = useCallback((tab: NewsCategoryTab) => {
    if (tab.slug === activeCategory.slug) return;
    setActiveCategory(tab);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeCategory.slug]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const onPullToRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        refetchPosts(),
        new Promise<void>((resolve) => setTimeout(resolve, 1100)),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchPosts]);

  // AUDIT FIX P2.6: idle-prefetch the first 3 visible posts after 2 s of
  // dwell time so the most likely next taps are near-instant. Declared
  // after `posts` is materialized below.
  const initialLoading = postsQuery.isLoading && !postsQuery.data;
  const posts = postsQuery.data ?? [];

  useEffect(() => {
    if (posts.length === 0) return;
    const slugs = posts.slice(0, 3).map((p) => p.slug).filter(Boolean);
    if (slugs.length === 0) return;
    let interactionHandle: { cancel: () => void } | null = null;
    const t = setTimeout(() => {
      // PERF FIX: defer the actual prefetch burst until after any
      // in-flight gestures/animations resolve so we don't compete with
      // the UI thread.
      interactionHandle = InteractionManager.runAfterInteractions(() => {
        for (const slug of slugs) {
          router.prefetch(`/news/${slug}` as never);
          queryClient.prefetchQuery({
            queryKey: ['post-detail', slug],
            queryFn: ({ signal }) => fetchPostBySlug(slug, signal),
            // PROFILING FIX (round 2): see comment in (tabs)/index.tsx.
            staleTime: Infinity,
          });
        }
      });
    }, 2000);
    return () => {
      clearTimeout(t);
      interactionHandle?.cancel();
    };
  }, [posts, router, queryClient]);
  const showFeatured = !debouncedSearch && posts.length > 2;

  const renderLoadingItem = useCallback(() => <SkeletonCard height={180} />, []);

  const renderPostItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Post>) => {
      if (index === 0 && showFeatured) {
        return <FeaturedCard post={item} onPress={openPost} />;
      }
      return <NewsCard post={item} onPress={openPost} />;
    },
    [openPost, showFeatured],
  );

  // FlashList item-type discriminator — featured card has a very different
  // layout than NewsCard, so tell the recycler not to reuse views across them.
  const getPostItemType = useCallback(
    (item: Post, index: number) => {
      if (index === 0 && showFeatured) return 'featured';
      return item.breaking ? 'card-breaking' : 'card';
    },
    [showFeatured],
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  const emptyState = useMemo(
    () => (
      <View style={S.emptyState}>
        <Ionicons name="newspaper-outline" size={52} color={colors.border} />
        <Text style={S.emptyTitle}>Nuk ka lajme</Text>
        <Text style={S.emptySubtitle}>
          {debouncedSearch ? 'Provo me fjalë kyçe tjetër' : 'Zgjidh një kategori tjetër ose kthehu pas pak.'}
        </Text>
      </View>
    ),
    [debouncedSearch],
  );

  // H15: stable contentContainerStyle so FlashList doesn't see a new prop
  // reference on every parent render.
  const listContentContainerStyle = useMemo(
    () => ({
      paddingTop: HEADER_H + 12,
      paddingBottom: bottomInsetOffset,
      paddingHorizontal: 16,
    }),
    [HEADER_H, bottomInsetOffset],
  );

  // ── Sticky header (absolutely positioned above the list) ───────────────────
  const stickyHeader = useMemo(
    () => (
      <View style={[S.header, { paddingTop: insets.top }]}>
        {/* Title row */}
        <View style={S.headerTitleRow}>
          <Image source={appIdentity.logo} contentFit="cover" style={S.headerLogo} />
          <View style={S.headerSpacer} />
          <HamburgerButton />
        </View>

        {/* Search — isolated component so this memo does not bust per keystroke */}
        <SearchInput onSearchChange={setDebouncedSearch} />

        {/* Category pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={S.catScroll}
        >
          {NEWS_CATEGORY_TABS.map((tab) => (
            <CategoryPill
              key={tab.slug || 'all'}
              item={tab}
              active={tab.slug === activeCategory.slug}
              onPress={() => onSelectCategory(tab)}
            />
          ))}
        </ScrollView>

        {/* Bottom divider */}
        <View style={S.headerDivider} />
      </View>
    ),
    // SearchInput owns per-keystroke state and only updates this screen after
    // debounce, so typing does not rebuild the title/category header.
    [insets.top, activeCategory.slug, onSelectCategory],
  );

  const refreshHeader = useMemo(
    () => (
      <RefreshStatusBanner
        visible={isRefreshing}
        title="Duke përditësuar lajmet"
        subtitle="Po kontrollohen artikujt më të fundit nga redaksia."
      />
    ),
    [isRefreshing],
  );
  const postKeyExtractor = useCallback((item: Post) => item._id, []);
  const loadingKeyExtractor = useCallback((item: number) => String(item), []);
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

  // ── Loading state ──────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <View style={S.screen}>
        {stickyHeader}
        <FlashList
          data={LOADING_ROWS}
          keyExtractor={loadingKeyExtractor}
          contentContainerStyle={listContentContainerStyle}
          renderItem={renderLoadingItem}
          maintainVisibleContentPosition={DISABLE_MAINTAIN_VISIBLE_CONTENT_POSITION}
        />
      </View>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <View style={S.screen}>
      {stickyHeader}
      <FlashList
        ref={listRef}
        data={posts}
        keyExtractor={postKeyExtractor}
        showsVerticalScrollIndicator={false}
        scrollEnabled
        contentContainerStyle={listContentContainerStyle}
        renderItem={renderPostItem}
        getItemType={getPostItemType}
        ListHeaderComponent={refreshHeader}
        ListEmptyComponent={emptyState}
        refreshControl={refreshControl}
        maintainVisibleContentPosition={DISABLE_MAINTAIN_VISIBLE_CONTENT_POSITION}
      />
    </View>
  );
}

// ── Styles — featured card ────────────────────────────────────────────────────
const SF = StyleSheet.create({
  outer: {
    borderRadius: 14,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0A0F1C',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  inner: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  imageZone: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#E6E8EE',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageDivider: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(10,15,28,0.06)',
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 14,
    gap: 5,
  },
  breakingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DC2626',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
  },
  breakingText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.6,
  },
  kicker: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2.0,
  },
  headline: {
    color: '#0A0F1C',
    fontFamily: fonts.uiBold,
    fontSize: 21,
    lineHeight: 27,
    letterSpacing: -0.45,
  },
  deck: {
    color: '#3C4358',
    fontFamily: fonts.uiRegular,
    fontSize: 13.5,
    lineHeight: 20,
  },
  time: {
    color: '#64748B',
    fontFamily: fonts.uiRegular,
    fontSize: 10,
    marginTop: 1,
  },
});

// ── Styles — category pill ────────────────────────────────────────────────────
const SP = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: 7,
  },
  pillActive: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  pillText: {
    fontFamily: fonts.uiMedium,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    letterSpacing: 0.1,
  },
});

// ── Styles — screen ───────────────────────────────────────────────────────────
const S = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
  },
  // Sticky header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    shadowColor: colors.navy,
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 66,
    paddingTop: 8,
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 11,
    marginBottom: 10,
    height: 42,
  },
  searchIcon: {
    marginRight: 7,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: colors.text,
    fontFamily: fonts.uiRegular,
    fontSize: 14,
  },
  clearBtn: {
    padding: 2,
    marginLeft: 4,
  },
  catScroll: {
    paddingBottom: 10,
  },
  headerDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: -14,
  },
  // Empty state
  emptyState: {
    paddingTop: 60,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 18,
    color: colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: fonts.uiRegular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
});
