import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, Newspaper, RefreshCw, Search, XCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { NewsCard } from '../../../components/news/NewsCard';
import { RelativeTime } from '../../../components/ui/RelativeTime';
import { RefreshStatusBanner } from '../../../components/ui/RefreshStatusBanner';
import { SkeletonCard } from '../../../components/news/SkeletonCard';
import { isBreakingBadgeVisible } from '../../../lib/breakingBadge';
import { HamburgerButton } from '../../../components/ui/HamburgerButton';
import { appIdentity, fonts } from '../../../constants/tokens';
import { useTheme } from '../../../providers/ThemeProvider';
import type { ThemeColors } from '../../../providers/ThemeProvider';
import { queueImagePrefetch } from '../../../lib/prefetchQueue';
import { getAndClearPendingDrawerCategory } from '../../../lib/drawerCategory';
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

const FeaturedCard = memo(function FeaturedCard({ post, onPress, colors }: { post: Post; onPress: (p: Post) => void; colors: ThemeColors }) {
  const SF = useMemo(() => getSF(colors), [colors]);
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
        style={({ pressed }) => [SF.inner, pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] }]}
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
  prev.colors === next.colors &&
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
  onLayout,
}: {
  item: NewsCategoryTab;
  active: boolean;
  onSelect: (tab: NewsCategoryTab) => void;
  onPrefetch: (tab: NewsCategoryTab) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { colors } = useTheme();
  const SP = useMemo(() => getSP(colors), [colors]);
  const handlePress = useCallback(() => onSelect(item), [onSelect, item]);
  const handlePressIn = useCallback(() => onPrefetch(item), [onPrefetch, item]);
  return (
    <Pressable
      onPressIn={handlePressIn}
      onPress={handlePress}
      onLayout={onLayout}
      style={({ pressed }) => [SP.pill, active && SP.pillActive, pressed && { opacity: 0.75, transform: [{ scale: 0.95 }] }]}
      accessibilityRole="tab"
      accessibilityLabel={`Kategoria ${item.label}`}
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
  const { colors } = useTheme();
  const S = useMemo(() => getS(colors), [colors]);
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
      <Search size={16} color={colors.textMuted} style={S.searchIcon} strokeWidth={1.5} />
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
        <Pressable onPress={onClear} hitSlop={8} style={({ pressed }) => [S.clearBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Pastro kërkimin">
          <XCircle size={16} color={colors.textMuted} strokeWidth={1.5} />
        </Pressable>
      ) : null}
    </View>
  );
});

// ── Constants ────────────────────────────────────────────────────────────────
const LOADING_ROWS = [1, 2, 3];
const PAGE_SIZE = 40;
const REFRESH_MIN_VISIBLE_MS = 600;
const REFRESH_MAX_WAIT_MS = 3500;

// ── Main screen ───────────────────────────────────────────────────────────────
export default function NewsIndexScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashListRef<Post>>(null);
  const catScrollRef = useRef<ScrollView>(null);
  const pillLayouts = useRef<Map<string, { x: number; width: number }>>(new Map());
  const [activeCategory, setActiveCategory] = useState<NewsCategoryTab>(() => {
    // Cross-tab drawer navigation fallback: if Expo Router hasn't delivered
    // the category param by the time this screen first mounts, use the slug
    // the drawer stashed right before calling router.navigate().
    const pendingSlug = getAndClearPendingDrawerCategory();
    const slug = categoryParam ?? pendingSlug;
    const found = NEWS_CATEGORY_TABS.find((t) => t.slug === slug);
    return found ?? NEWS_CATEGORY_TABS[0];
  });
  const activeCategorySlugRef = useRef(activeCategory.slug);
  activeCategorySlugRef.current = activeCategory.slug;
  const S = useMemo(() => getS(colors), [colors]);

  // FIX: when navigating from the drawer to ?category=<slug> while this
  // screen is already mounted in the tab stack, the useState initializer
  // does NOT re-run, so the active category would be stuck on whatever was
  // first opened. Sync activeCategory whenever categoryParam changes.
  useEffect(() => {
    if (categoryParam === undefined) {
      if (activeCategorySlugRef.current !== '') {
        setActiveCategory(NEWS_CATEGORY_TABS[0]);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
      return;
    }
    const found = NEWS_CATEGORY_TABS.find((t) => t.slug === categoryParam);
    if (found && found.slug !== activeCategorySlugRef.current) {
      setActiveCategory(found);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [categoryParam]);

  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Header height: statusBar + titleRow(66) + search(54) + categories(50) + divider(1)
  const HEADER_H = insets.top + 171;
  const bottomInsetOffset = 4;

  const postsQuery = useInfiniteQuery({
    queryKey: ['news-feed', activeCategory.slug, debouncedSearch],
    queryFn: ({ pageParam, signal }) =>
      fetchLatestPosts(activeCategory.slug, debouncedSearch, PAGE_SIZE, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    staleTime: 5 * 60 * 1000,
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
      // AUDIT FIX P2.5: warm route module + post query so the article
      // screen renders the moment the slide animation completes.
      router.prefetch(`/article/${post.slug}`);
      queryClient.prefetchQuery({
        queryKey: ['post', post.slug],
        queryFn: ({ signal }) => fetchPostBySlug(post.slug, signal),
        // PROFILING FIX (round 2): see comment in (tabs)/index.tsx.
        staleTime: Infinity,
      });
      // Article now lives in the root stack so it opens above the current tab.
      // Back naturally returns to whichever tab (Home or News) opened it.
      router.push(`/article/${post.slug}`);
    },
    [router, queryClient],
  );

  const onSelectCategory = useCallback((tab: NewsCategoryTab) => {
    if (tab.slug === activeCategorySlugRef.current) return;
    setActiveCategory(tab);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // Auto-scroll the category pill bar so the active pill is always visible.
  useEffect(() => {
    const slug = activeCategory.slug;
    const layout = pillLayouts.current.get(slug);
    if (layout && catScrollRef.current) {
      catScrollRef.current.scrollTo({ x: Math.max(0, layout.x - 16), animated: true });
    }
  }, [activeCategory]);

  // Fire a prefetch for a category so data is warm before setActiveCategory runs.
  // Called on onPressIn (finger-down) — ~150ms before the press registers —
  // so the fetch is often in-flight or complete by the time the list re-renders.
  const onPrefetchCategory = useCallback((tab: NewsCategoryTab) => {
    if (tab.slug === activeCategorySlugRef.current) return;
    queryClient.prefetchInfiniteQuery({
      queryKey: ['news-feed', tab.slug, debouncedSearch],
      queryFn: ({ pageParam, signal }) => fetchLatestPosts(tab.slug, debouncedSearch, PAGE_SIZE, pageParam, signal),
      initialPageParam: 0,
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient, debouncedSearch]);

  // Prefetch all category tabs on mount so every first tap is instant.
  // Runs after interactions settle to avoid competing with the initial render.
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      for (const tab of NEWS_CATEGORY_TABS) {
        if (tab.slug === '') continue; // already fetched by postsQuery
        queryClient.prefetchInfiniteQuery({
          queryKey: ['news-feed', tab.slug, ''],
          queryFn: ({ pageParam, signal }) => fetchLatestPosts(tab.slug, '', PAGE_SIZE, pageParam, signal),
          initialPageParam: 0,
          staleTime: 5 * 60 * 1000,
        });
      }
    });
    return () => handle.cancel();
  }, [queryClient]);


  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const refreshRunRef = useRef(0);
  const onPullToRefresh = useCallback(async () => {
    const runId = refreshRunRef.current + 1;
    refreshRunRef.current = runId;
    setIsRefreshing(true);
    setBannerVisible(true);
    try {
      await Promise.race([
        Promise.allSettled([
          refetchPostsRef.current(),
          queryClient.invalidateQueries({ queryKey: ['news-feed'] }),
          new Promise<void>((resolve) => setTimeout(resolve, REFRESH_MIN_VISIBLE_MS)),
        ]),
        new Promise<void>((resolve) => setTimeout(resolve, REFRESH_MAX_WAIT_MS)),
      ]);
    } finally {
      if (refreshRunRef.current === runId) {
        setIsRefreshing(false);
        setBannerVisible(false);
      }
    }
  }, [queryClient]);

  // AUDIT FIX P2.6: idle-prefetch the first 3 visible posts after 2 s of
  // dwell time so the most likely next taps are near-instant. Declared
  // after `posts` is materialized below.
  const initialLoading = postsQuery.isLoading && !postsQuery.data;
  // When we're fetching a category whose data isn't in cache yet, React Query
  // has no placeholder to show — isPlaceholderData is false and data is
  // undefined until the fetch resolves. Show skeletons rather than an empty
  // list or the previous (wrong) category's posts.
  const isSwitchingCategory = postsQuery.isFetching && !postsQuery.data;
  const posts = useMemo(() => postsQuery.data?.pages.flat() ?? [], [postsQuery.data]);

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
          router.prefetch(`/article/${slug}`);
          queryClient.prefetchQuery({
            queryKey: ['post', slug],
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
        return <FeaturedCard post={item} onPress={openPost} colors={colors} />;
      }
      return <NewsCard post={item} onPress={openPost} colors={colors} />;
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

  // ── Error state ──────────────────────────────────────────────────────────
  const errorState = useMemo(
    () => (
      <View style={S.errorContainer}>
        <AlertCircle size={40} color={colors.textMuted} strokeWidth={1.5} />
        <Text style={S.errorTitle}>Gabim gjatë ngarkimit</Text>
        <Text style={S.errorSubtitle}>Kontrollo lidhjen dhe provo përsëri.</Text>
        <Pressable
          onPress={() => postsQuery.refetch()}
          style={({ pressed }) => [
            S.errorRetryBtn,
            pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
          ]}
          accessibilityLabel="Provo përsëri"
          accessibilityRole="button"
        >
          <RefreshCw size={16} color={colors.surface} strokeWidth={1.5} />
          <Text style={S.errorRetryText}>Provo Përsëri</Text>
        </Pressable>
      </View>
    ),
    [S, colors],
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  const emptyState = useMemo(
    () => (
      <View style={S.emptyState}>
        <Newspaper size={52} color={colors.border} strokeWidth={1.5} />
        <Text style={S.emptyTitle}>Nuk ka lajme</Text>
        <Text style={S.emptySubtitle}>
          {debouncedSearch ? 'Provo me fjalë kyçe tjetër' : 'Zgjidh një kategori tjetër ose kthehu pas pak.'}
        </Text>
      </View>
    ),
    [debouncedSearch, S, colors],
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
          <Image source={isDark ? require('../../../assets/images/logo-white-transparent.png') : require('../../../assets/images/logo-blue-transparent.png')} contentFit="contain" style={S.headerLogo} />
          <View style={S.headerSpacer} />
          <HamburgerButton />
        </View>

        {/* Search — isolated component so this memo does not bust per keystroke */}
        <SearchInput onSearchChange={setDebouncedSearch} />

        {/* Category pills */}
        <ScrollView
          ref={catScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          fadingEdgeLength={0}
          contentContainerStyle={S.catScroll}
        >
          {NEWS_CATEGORY_TABS.map((tab) => (
            <CategoryPill
              key={tab.slug || 'all'}
              item={tab}
              active={tab.slug === activeCategory.slug}
              onSelect={onSelectCategory}
              onPrefetch={onPrefetchCategory}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                pillLayouts.current.set(tab.slug, { x, width });
              }}
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
    // AUDIT FIX: S and isDark must be in deps so theme toggle refreshes the
    // header background and logo source. Without them, the memoized element
    // holds stale styles from the previous theme, causing the header to render
    // with inverted colors after a theme change.
    [S, isDark, insets.top, activeCategory.slug, onSelectCategory, onPrefetchCategory],
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

  const loadMoreFooter = useMemo(() => {
    if (!postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) return null;
    return (
      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
        {postsQuery.isFetchingNextPage ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Pressable
            onPress={() => postsQuery.fetchNextPage()}
            style={({ pressed }) => [
              S.loadMoreBtn,
              pressed && S.loadMoreBtnPressed,
            ]}
          >
            <Text style={S.loadMoreText}>Shiko më shumë</Text>
          </Pressable>
        )}
      </View>
    );
  }, [postsQuery.hasNextPage, postsQuery.isFetchingNextPage, postsQuery.fetchNextPage, colors.primary, S]);

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <View style={S.screen}>
      {stickyHeader}
      {initialLoading || isSwitchingCategory ? (
        <FlashList
          data={LOADING_ROWS}
          keyExtractor={loadingKeyExtractor}
          contentContainerStyle={listContentContainerStyle}
          renderItem={renderLoadingItem}
          extraData={colors}
          maintainVisibleContentPosition={DISABLE_MAINTAIN_VISIBLE_CONTENT_POSITION}
        />
      ) : (
        <FlashList
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
          ListFooterComponent={loadMoreFooter}
          ListEmptyComponent={postsQuery.isError && posts.length === 0 ? errorState : emptyState}
          extraData={colors}
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
      )}
    </View>
  );
}

// ── Styles — featured card ────────────────────────────────────────────────────
const getSF = (colors: ThemeColors) => StyleSheet.create({
  outer: {
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: colors.surface,
    shadowColor: colors.navy,
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
    backgroundColor: colors.surfaceSubtle,
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
    backgroundColor: colors.border,
  },
  content: {
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 13,
    gap: 5,
  },
  breakingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
  },
  breakingText: {
    color: colors.surface,
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  kicker: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2.0,
  },
  headline: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 19,
    lineHeight: 26,
    letterSpacing: -0.35,
  },
  deck: {
    color: colors.textSecondary,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    lineHeight: 19,
  },
  time: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 10,
    marginTop: 1,
  },
});

// ── Styles — category pill ────────────────────────────────────────────────────
const getSP = (colors: ThemeColors) => StyleSheet.create({
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
    color: colors.surface,
    fontFamily: fonts.uiBold,
    letterSpacing: 0.1,
  },
});

// ── Styles — screen ───────────────────────────────────────────────────────────
const getS = (colors: ThemeColors) => StyleSheet.create({
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
    width: 60,
    height: 60,
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
  // Error state
  errorContainer: {
    paddingTop: 60,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 10,
  },
  errorTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 15,
    color: colors.text,
    marginTop: 6,
  },
  errorSubtitle: {
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  errorRetryText: {
    fontFamily: fonts.uiBold,
    fontSize: 13,
    color: colors.surface,
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
  loadMoreBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadMoreBtnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  loadMoreText: {
    fontFamily: fonts.uiBold,
    fontSize: 13,
    color: colors.text,
    letterSpacing: 0.2,
  },
});
