import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NewsCard } from '../../../components/news/NewsCard';
import { RelativeTime } from '../../../components/ui/RelativeTime';
import { RefreshStatusBanner } from '../../../components/ui/RefreshStatusBanner';
import { SkeletonCard } from '../../../components/news/SkeletonCard';
import { isBreakingBadgeVisible } from '../../../lib/breakingBadge';
import { HamburgerButton } from '../../../components/ui/HamburgerButton';
import { appIdentity, colors, fonts } from '../../../constants/tokens';
import { s } from '../../../lib/responsive';
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
function samePost(a: Post, b: Post): boolean {
  return (
    a._id === b._id &&
    a.slug === b.slug &&
    a.title === b.title &&
    a.excerpt === b.excerpt &&
    a.publishedAt === b.publishedAt &&
    a.breaking === b.breaking &&
    a.mainImageUrl === b.mainImageUrl &&
    a.thumbhash === b.thumbhash &&
    (a.categories?.[0] ?? 'Lajme') === (b.categories?.[0] ?? 'Lajme')
  );
}

const FeaturedCard = memo(function FeaturedCard({ post, onPress }: { post: Post; onPress: (p: Post) => void }) {
  const imageUri = useMemo(
    () => buildSanityImageUrl(post.mainImageUrl, sanityImageWidths.newsFeatured),
    [post.mainImageUrl],
  );
  const cat = post.categories?.[0] ?? 'Lajme';
  const onCardPress = useCallback(() => onPress(post), [onPress, post]);

  return (
    <View style={SF.outer}>
      <Pressable
        onPress={onCardPress}
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
          {isBreakingBadgeVisible(post.breaking, post.publishedAt) ? (
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
    </View>
  );
}, (prev, next) =>
  prev.onPress === next.onPress &&
  samePost(prev.post, next.post),
);

// ── Tiny relative-time helper (avoids extra component in this context) ─────────

// ── Category pill ─────────────────────────────────────────────────────────────
const CategoryPill = memo(function CategoryPill({
  item,
  active,
  onSelect,
  onPrefetch,
}: {
  item: NewsCategoryTab;
  active: boolean;
  onSelect: (tab: NewsCategoryTab) => void;
  onPrefetch: (tab: NewsCategoryTab) => void;
}) {
  const handlePress = useCallback(() => onSelect(item), [onSelect, item]);
  const handlePressIn = useCallback(() => onPrefetch(item), [onPrefetch, item]);
  return (
    <Pressable
      onPressIn={handlePressIn}
      onPress={handlePress}
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
const REFRESH_MIN_VISIBLE_MS = 600;
const REFRESH_MAX_WAIT_MS = 3500;

// ── Main screen ───────────────────────────────────────────────────────────────
export default function NewsIndexScreen() {
  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashListRef<Post>>(null);
  const [activeCategory, setActiveCategory] = useState<NewsCategoryTab>(() => {
    const found = NEWS_CATEGORY_TABS.find((t) => t.slug === categoryParam);
    return found ?? NEWS_CATEGORY_TABS[0];
  });
  const activeCategorySlugRef = useRef(activeCategory.slug);
  activeCategorySlugRef.current = activeCategory.slug;
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Header height: statusBar + titleRow(66) + search(54) + categories(50) + divider(1)
  const HEADER_H = insets.top + 171;
  const bottomInsetOffset = 4;

  const postsQuery = useQuery({
    queryKey: ['news-feed', activeCategory.slug, debouncedSearch],
    queryFn: ({ signal }) => fetchLatestPosts(activeCategory.slug, debouncedSearch, 40, signal),
    // Keep stale data for same-key background revalidation (pull-to-refresh,
    // re-focus). We intentionally do NOT use placeholderData here \u2014 showing a
    // different category's posts while the new fetch loads is worse than
    // showing skeletons. isFetching+isPlaceholderData would have caused a
    // jarring wrong-posts\u2192correct-posts snap; we detect the equivalent
    // condition via isPlaceholderData below and render skeletons instead.
    staleTime: 5 * 60 * 1000,
    // H-B11: 5min gcTime so flipping through all 7 category tabs once does
    // NOT leave 7 \u00d7 60KB feeds resident for half an hour. Re-entering a
    // category within 5 min still hits cache; longer than that just refetches.
    gcTime: 5 * 60 * 1000,
  });
  const refetchPostsRef = useRef(postsQuery.refetch);
  refetchPostsRef.current = postsQuery.refetch;

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
      router.replace({ pathname: '/news/[slug]' as never, params: { slug: post.slug } as never });
    },
    [router, queryClient],
  );

  const onSelectCategory = useCallback((tab: NewsCategoryTab) => {
    if (tab.slug === activeCategorySlugRef.current) return;
    setActiveCategory(tab);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // Fire a prefetch for a category so data is warm before setActiveCategory runs.
  // Called on onPressIn (finger-down) — ~150ms before the press registers —
  // so the fetch is often in-flight or complete by the time the list re-renders.
  const onPrefetchCategory = useCallback((tab: NewsCategoryTab) => {
    if (tab.slug === activeCategorySlugRef.current) return;
    queryClient.prefetchQuery({
      queryKey: ['news-feed', tab.slug, debouncedSearch],
      queryFn: ({ signal }) => fetchLatestPosts(tab.slug, debouncedSearch, 40, signal),
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient, debouncedSearch]);

  // Prefetch all category tabs on mount so every first tap is instant.
  // Runs after interactions settle to avoid competing with the initial render.
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      for (const tab of NEWS_CATEGORY_TABS) {
        if (tab.slug === '') continue; // already fetched by postsQuery
        queryClient.prefetchQuery({
          queryKey: ['news-feed', tab.slug, ''],
          queryFn: ({ signal }) => fetchLatestPosts(tab.slug, '', 40, signal),
          staleTime: 5 * 60 * 1000,
        });
      }
    });
    return () => handle.cancel();
  }, [queryClient]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const refreshRunRef = useRef(0);
  const [refreshResetKey, setRefreshResetKey] = useState(0);
  const onPullToRefresh = useCallback(async () => {
    const runId = refreshRunRef.current + 1;
    refreshRunRef.current = runId;
    setIsRefreshing(true);
    setBannerVisible(true);
    try {
      await Promise.race([
        Promise.allSettled([
          refetchPostsRef.current(),
          new Promise<void>((resolve) => setTimeout(resolve, REFRESH_MIN_VISIBLE_MS)),
        ]),
        new Promise<void>((resolve) => setTimeout(resolve, REFRESH_MAX_WAIT_MS)),
      ]);
    } finally {
      if (refreshRunRef.current === runId) {
        setIsRefreshing(false);
        setBannerVisible(false);
        setRefreshResetKey((key) => key + 1);
      }
    }
  }, []);

  // AUDIT FIX P2.6: idle-prefetch the first 3 visible posts after 2 s of
  // dwell time so the most likely next taps are near-instant. Declared
  // after `posts` is materialized below.
  const initialLoading = postsQuery.isLoading && !postsQuery.data;
  // When we're fetching a category whose data isn't in cache yet, React Query
  // has no placeholder to show — isPlaceholderData is false and data is
  // undefined until the fetch resolves. Show skeletons rather than an empty
  // list or the previous (wrong) category's posts.
  const isSwitchingCategory = postsQuery.isFetching && !postsQuery.data;
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
      return isBreakingBadgeVisible(item.breaking, item.publishedAt) ? 'card-breaking' : 'card';
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
              onSelect={onSelectCategory}
              onPrefetch={onPrefetchCategory}
            />
          ))}
        </ScrollView>

        {/* Bottom divider */}
        <View style={S.headerDivider} />
      </View>
    ),
    // SearchInput owns per-keystroke state and only updates this screen after
    // debounce, so typing does not rebuild the title/category header.
    // onSelectCategory and onPrefetchCategory are stable (empty/stable deps),
    // so only the active pill changes trigger a header rebuild.
    [insets.top, activeCategory.slug, onSelectCategory, onPrefetchCategory],
  );

  const refreshHeader = useMemo(
    () => (
      <RefreshStatusBanner
        visible={bannerVisible}
        title="Duke përditësuar lajmet"
        subtitle="Po kontrollohen artikujt më të fundit nga redaksia."
      />
    ),
    [bannerVisible],
  );
  const postKeyExtractor = useCallback((item: Post) => item._id, []);
  const loadingKeyExtractor = useCallback((item: number) => String(item), []);
  // ── Loading / category-switch state ───────────────────────────────────────
  if (initialLoading || isSwitchingCategory) {
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
        key={`news-refresh-${refreshResetKey}`}
        ref={listRef}
        data={posts}
        keyExtractor={postKeyExtractor}
        drawDistance={500}
        showsVerticalScrollIndicator={false}
        scrollEnabled
        contentContainerStyle={listContentContainerStyle}
        renderItem={renderPostItem}
        getItemType={getPostItemType}
        ListHeaderComponent={refreshHeader}
        ListEmptyComponent={emptyState}
        refreshing={isRefreshing}
        onRefresh={onPullToRefresh}
        progressViewOffset={0}
        maintainVisibleContentPosition={DISABLE_MAINTAIN_VISIBLE_CONTENT_POSITION}
      />
    </View>
  );
}

// ── Styles — featured card ────────────────────────────────────────────────────
const SF = StyleSheet.create({
  outer: {
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0A0F1C',
    shadowOpacity: 0.055,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  inner: {
    borderRadius: 12,
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
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 13,
    gap: 5,
  },
  breakingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
  },
  breakingText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.5,
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
    fontSize: 19,
    lineHeight: 26,
    letterSpacing: -0.35,
  },
  deck: {
    color: '#475569',
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    lineHeight: 19,
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
