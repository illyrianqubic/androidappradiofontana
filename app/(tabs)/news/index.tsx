import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NewsCard } from '../../../components/NewsCard';
import { SkeletonCard } from '../../../components/SkeletonCard';
import { HamburgerButton } from '../../../components/HamburgerButton';
import { appIdentity, colors, fonts } from '../../../design-tokens';
import { queueImagePrefetch } from '../../../lib/prefetchQueue';
import {
  buildSanityImageUrl,
  defaultThumbhash,
  fetchLatestPosts,
  fetchPostBySlug,
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

// ── Featured card (first item, large editorial) ───────────────────────────────
const FeaturedCard = memo(function FeaturedCard({ post, onPress }: { post: Post; onPress: (p: Post) => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const imageUri = buildSanityImageUrl(post.mainImageUrl, 1080);
  const cat = post.categories?.[0] ?? 'Lajme';
  const initial = ((post.author ?? 'Redaksia Fontana').trim().charAt(0) || 'R').toUpperCase();
  // Reading time estimate — 4× (excerpt + title) at 220 wpm.
  const readingMin = (() => {
    const text = `${post.title ?? ''} ${post.excerpt ?? ''}`.trim();
    if (!text) return 3;
    return Math.max(2, Math.ceil((text.split(/\s+/).length * 4) / 220));
  })();

  return (
    <Animated.View style={[SF.outer, animStyle]}>
      <Pressable
        onPress={() => onPress(post)}
        onPressIn={() => { scale.value = withTiming(0.985, { duration: 100 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 180 }); }}
        style={SF.inner}
      >
        {/* Image — cinematic 16:10, no overlays */}
        <View style={SF.imageZone}>
          <Image
            source={imageUri ? { uri: imageUri } : undefined}
            placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
            contentFit="cover"
            transition={0}
            style={SF.image}
          />
          <View style={SF.imageDivider} />
        </View>

        {/* White editorial panel */}
        <View style={SF.content}>
          {post.breaking ? (
            <View style={SF.breakingRow}>
              <View style={SF.breakingPulse} />
              <Text style={SF.breakingText}>LAJM I FUNDIT</Text>
            </View>
          ) : null}

          <View style={SF.kickerRow}>
            <View style={SF.kickerDot} />
            <Text style={SF.kicker} numberOfLines={1}>{cat.toUpperCase()}</Text>
          </View>

          <Text numberOfLines={3} style={SF.headline}>{post.title}</Text>

          {post.excerpt ? (
            <Text numberOfLines={3} style={SF.deck}>{post.excerpt}</Text>
          ) : null}

          <View style={SF.bylineRule} />

          <View style={SF.byline}>
            <View style={SF.avatar}>
              <Text style={SF.avatarText}>{initial}</Text>
            </View>
            <View style={SF.bylineCol}>
              <Text numberOfLines={1} style={SF.author}>
                {post.author ?? 'Redaksia Fontana'}
              </Text>
              <View style={SF.metaRow}>
                <Text style={SF.metaText}>{readingMin} min lexim</Text>
                <View style={SF.metaSep} />
                <Text style={SF.metaText}>{relativeLabel(post.publishedAt)}</Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

// ── Tiny relative-time helper (avoids extra component in this context) ─────────
function relativeLabel(ts: string | undefined): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Tani';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} orë`;
  const days = Math.floor(hrs / 24);
  return `${days} ditë`;
}

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
// Extracted so the sticky-header useMemo does NOT depend on `search`. The
// header tree is large; rebuilding it on every keystroke caused visible input
// latency. Now only this small component re-renders as the user types.
const SearchInput = memo(function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const onClear = useCallback(() => onChange(''), [onChange]);
  return (
    <View style={S.searchRow}>
      <Ionicons name="search-outline" size={16} color={colors.textMuted} style={S.searchIcon} />
      <TextInput
        value={value}
        onChangeText={onChange}
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
  const [search, setSearch] = useState('');
  // AUDIT FIX P7.25 + P7.26: replace 300ms setTimeout debounce with React 19's
  // useDeferredValue. The deferred value updates in a low-priority transition,
  // so the TextInput stays at 60 fps while the heavy query/render is throttled
  // automatically — no fixed delay, no setTimeout, no extra re-render.
  const debouncedSearch = useDeferredValue(search);

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

  const queryClient = useQueryClient();

  const openPost = useCallback(
    (post: Post) => {
      // C-A7: pre-fetch the 480px hero (matches sizes used on the slug screen)
      // so the article hero renders from memory cache on arrival.
      // M-C3: capped at 3 concurrent so card-mashing never floods the socket pool.
      queueImagePrefetch(buildSanityImageUrl(post.mainImageUrl, 480));
      // AUDIT FIX P2.5: warm route module + post-detail query so the article
      // screen renders the moment the slide animation completes.
      router.prefetch(`/news/${post.slug}` as never);
      queryClient.prefetchQuery({
        queryKey: ['post-detail', post.slug],
        queryFn: () => fetchPostBySlug(post.slug),
        // PROFILING FIX (round 2): see comment in (tabs)/index.tsx.
        staleTime: Infinity,
      });
      router.push({ pathname: '/news/[slug]' as never, params: { slug: post.slug } as never });
    },
    [router, queryClient],
  );

  const onSelectCategory = useCallback((tab: NewsCategoryTab) => {
    setActiveCategory(tab);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['news-feed', activeCategory.slug, debouncedSearch],
      refetchType: 'active',
    });
  }, [queryClient, activeCategory.slug, debouncedSearch]);

  // BUGFIX (scroll hijack): same fix as home — native RefreshControl
  // instead of GestureDetector + AnimatedFlashList wrapper.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const onPullToRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

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
            queryFn: () => fetchPostBySlug(slug),
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
    (_item: Post, index: number) => (index === 0 && showFeatured ? 'featured' : 'card'),
    [showFeatured],
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  const emptyState = useMemo(
    () => (
      <View style={S.emptyState}>
        <Ionicons name="newspaper-outline" size={52} color={colors.border} />
        <Text style={S.emptyTitle}>Nuk ka lajme</Text>
        <Text style={S.emptySubtitle}>
          {search ? 'Provo me fjalë kyçe tjetër' : 'Zgjidh një kategori tjetër ose kthehu pas pak.'}
        </Text>
      </View>
    ),
    [search],
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
        <SearchInput value={search} onChange={setSearch} />

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
    // search intentionally excluded — SearchInput owns its visible state and
    // bubbles changes via setSearch (which is a stable React setter).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [insets.top, activeCategory.slug, onSelectCategory],
  );

  // ── Loading state ──────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <View style={S.screen}>
        {stickyHeader}
        <FlashList
          data={LOADING_ROWS}
          keyExtractor={(item) => String(item)}
          contentContainerStyle={listContentContainerStyle}
          renderItem={renderLoadingItem}
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
        keyExtractor={(item) => item._id}
        showsVerticalScrollIndicator={false}
        scrollEnabled
        decelerationRate="fast"
        contentContainerStyle={listContentContainerStyle}
        renderItem={renderPostItem}
        getItemType={getPostItemType}
        ListEmptyComponent={emptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onPullToRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />
    </View>
  );
}

// ── Styles — featured card ────────────────────────────────────────────────────
const SF = StyleSheet.create({
  outer: {
    borderRadius: 20,
    marginBottom: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0A0F1C',
    shadowOpacity: 0.10,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  inner: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  imageZone: {
    width: '100%',
    aspectRatio: 16 / 10,
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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
  },
  breakingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#DC2626',
    borderRadius: 4,
    marginBottom: 12,
  },
  breakingPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  breakingText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 1.8,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  kickerDot: {
    width: 6,
    height: 6,
    borderRadius: 1,
    backgroundColor: '#DC2626',
  },
  kicker: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: 2.2,
  },
  headline: {
    color: '#0A0F1C',
    fontFamily: fonts.articleBold,
    fontSize: 24,
    lineHeight: 31,
    letterSpacing: -0.5,
  },
  deck: {
    color: '#3C4358',
    fontFamily: fonts.uiRegular,
    fontSize: 14.5,
    lineHeight: 22,
    marginTop: 10,
  },
  bylineRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EEF0F4',
    marginTop: 16,
    marginBottom: 14,
  },
  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  bylineCol: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
  },
  author: {
    color: '#0A0F1C',
    fontFamily: fonts.uiBold,
    fontSize: 13,
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  metaText: {
    color: '#7A8294',
    fontFamily: fonts.uiRegular,
    fontSize: 12,
  },
  metaSep: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#B5BAC8',
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
  flexFill: {
    flex: 1,
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

