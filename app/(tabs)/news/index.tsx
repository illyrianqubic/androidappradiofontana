import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
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
import { appIdentity, colors, fonts, radius, spacing } from '../../../design-tokens';
import { queueImagePrefetch } from '../../../lib/prefetchQueue';
import {
  buildSanityImageUrl,
  defaultThumbhash,
  fetchLatestPosts,
  type Post,
} from '../../../services/api';

// ── Category tabs ─────────────────────────────────────────────────────────────
type NewsCategoryTab = { label: string; slug: string };

const NEWS_CATEGORY_TABS: NewsCategoryTab[] = [
  { label: 'Të Gjitha', slug: '' },
  { label: 'Lajme',     slug: 'lajme' },
  { label: 'Sport',     slug: 'sport' },
  { label: 'Teknologji', slug: 'teknologji' },
  { label: 'Showbiz',   slug: 'showbiz' },
  { label: 'Shëndetësi', slug: 'shendetesi' },
  { label: 'Nga Bota',  slug: 'nga-bota' },
];

// ── Featured card (first item, large editorial) ───────────────────────────────
const FeaturedCard = memo(function FeaturedCard({ post, onPress }: { post: Post; onPress: (p: Post) => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const imageUri = buildSanityImageUrl(post.mainImageUrl, 900);
  const cat = post.categories?.[0] ?? 'Lajme';

  return (
    <Animated.View style={[SF.outer, animStyle]}>
      <Pressable
        onPress={() => onPress(post)}
        onPressIn={() => { scale.value = withTiming(0.975, { duration: 100 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 180 }); }}
        style={SF.inner}
      >
        <Image
          source={imageUri ? { uri: imageUri } : undefined}
          placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
          contentFit="cover"
          transition={0}
          style={SF.image}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.76)']}
          locations={[0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
        {/* Category badge */}
        <View style={SF.catBadge}>
          <Text style={SF.catText}>{cat.toUpperCase()}</Text>
        </View>
        {post.breaking ? (
          <View style={SF.liveChip}>
            <View style={SF.liveDot} />
            <Text style={SF.liveText}>LIVE</Text>
          </View>
        ) : null}
        {/* Text overlay */}
        <View style={SF.overlay}>
          <Text numberOfLines={3} style={SF.overlayTitle}>{post.title}</Text>
          <View style={SF.overlayMeta}>
            <Text style={SF.overlayAuthor}>{post.author ?? 'Redaksia Fontana'}</Text>
            <View style={SF.overlaySep} />
            <Text style={SF.overlayTime}>{relativeLabel(post.publishedAt)}</Text>
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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // 300ms debounce so we don't fire a Sanity request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Header height: statusBar + titleRow(66) + search(54) + categories(50) + divider(1)
  const HEADER_H = insets.top + 171;
  const bottomInsetOffset = insets.bottom + 190;

  const postsQuery = useQuery({
    queryKey: ['news-feed', activeCategory.slug, debouncedSearch],
    queryFn: () => fetchLatestPosts(activeCategory.slug, debouncedSearch, 40),
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
      // NOTE: do NOT prefetchQuery(['post-detail', slug], () => Promise.resolve(post))
      // here — the listing post has no `body[]`, and seeding it as fresh data
      // (staleTime 10min) prevented fetchPostBySlug from ever running, leaving
      // the article screen with an empty body. The slug screen owns its own
      // detail fetch.
      router.push({ pathname: '/news/[slug]' as never, params: { slug: post.slug } as never });
    },
    [router],
  );

  const onSelectCategory = useCallback((tab: NewsCategoryTab) => {
    setActiveCategory(tab);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    await postsQuery.refetch();
    setRefreshing(false);
  }, [postsQuery]);

  const initialLoading = postsQuery.isLoading && !postsQuery.data;
  const posts = postsQuery.data ?? [];
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

  // H15: stable contentContainerStyle + RefreshControl element so FlashList
  // doesn't see a new prop reference on every parent render.
  const listContentContainerStyle = useMemo(
    () => ({
      paddingTop: HEADER_H + 12,
      paddingBottom: bottomInsetOffset,
      paddingHorizontal: 16,
    }),
    [HEADER_H, bottomInsetOffset],
  );
  const refreshControlEl = useMemo(
    () => (
      <RefreshControl
        tintColor={colors.primary}
        refreshing={refreshing}
        onRefresh={refresh}
      />
    ),
    [refreshing, refresh],
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
        refreshControl={refreshControlEl}
        decelerationRate="fast"
        contentContainerStyle={listContentContainerStyle}
        renderItem={renderPostItem}
        getItemType={getPostItemType}
        ListEmptyComponent={emptyState}
      />
    </View>
  );
}

// ── Styles — featured card ────────────────────────────────────────────────────
const SF = StyleSheet.create({
  outer: {
    borderRadius: 20,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: colors.navy,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  inner: {
    height: 260,
    justifyContent: 'flex-end',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfaceElevated,
  },
  catBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(15,23,42,0.54)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  catText: {
    color: 'rgba(255,255,255,0.95)',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.1,
  },
  liveChip: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  liveText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  overlay: {
    padding: 14,
    gap: 6,
  },
  overlayTitle: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 20,
    lineHeight: 27,
    letterSpacing: -0.5,
  },
  overlayMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overlayAuthor: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: fonts.uiMedium,
    fontSize: 12,
  },
  overlaySep: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  overlayTime: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: fonts.uiRegular,
    fontSize: 12,
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

