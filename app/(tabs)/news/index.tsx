import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { NewsCard } from '../../../components/NewsCard';
import { SkeletonCard } from '../../../components/SkeletonCard';
import { HamburgerButton } from '../../../components/HamburgerButton';
import { colors, fonts, radius, spacing } from '../../../design-tokens';
import {
  buildSanityImageUrl,
  defaultThumbhash,
  fetchAuthors,
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
function FeaturedCard({ post, onPress }: { post: Post; onPress: (p: Post) => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const imageUri = buildSanityImageUrl(post.mainImageUrl, 1200);
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
          transition={240}
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
}

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
function CategoryPill({
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
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function NewsIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashListRef<Post>>(null);
  const [activeCategory, setActiveCategory] = useState<NewsCategoryTab>(NEWS_CATEGORY_TABS[0]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const loadingRows = useMemo(() => [1, 2, 3], []);

  // Header height: statusBar + titleRow(54) + search(54) + categories(50) + divider(1)
  const HEADER_H = insets.top + 159;
  const bottomInsetOffset = insets.bottom + 190;

  const authorsQuery = useQuery({
    queryKey: ['cms-authors'],
    queryFn: fetchAuthors,
  });

  const postsQuery = useQuery({
    queryKey: ['news-feed', activeCategory.slug, search],
    queryFn: () => fetchLatestPosts(activeCategory.slug, search, 40),
    placeholderData: (previousData) => previousData,
  });

  const openPost = useCallback(
    (post: Post) => {
      router.push({ pathname: '/article/[slug]' as never, params: { slug: post.slug } as never });
    },
    [router],
  );

  const onSelectCategory = useCallback((tab: NewsCategoryTab) => {
    setActiveCategory(tab);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory.slug]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await Promise.all([postsQuery.refetch(), authorsQuery.refetch()]);
    setRefreshing(false);
  }, [authorsQuery, postsQuery]);

  const initialLoading = postsQuery.isLoading && !postsQuery.data;
  const posts = postsQuery.data ?? [];

  const renderLoadingItem = useCallback(() => <SkeletonCard height={180} />, []);

  const renderPostItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Post>) => {
      if (index === 0 && !search && posts.length > 2) {
        return <FeaturedCard post={item} onPress={openPost} />;
      }
      return <NewsCard post={item} onPress={openPost} />;
    },
    [openPost, search, posts.length],
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  const emptyState = (
    <View style={S.emptyState}>
      <Ionicons name="newspaper-outline" size={52} color={colors.border} />
      <Text style={S.emptyTitle}>Nuk ka lajme</Text>
      <Text style={S.emptySubtitle}>
        {search ? 'Provo me fjalë kyçe tjetër' : 'Zgjidh një kategori tjetër ose kthehu pas pak.'}
      </Text>
    </View>
  );

  // ── Sticky header (absolutely positioned above the list) ───────────────────
  const stickyHeader = (
    <View style={[S.header, { paddingTop: insets.top }]}>
      {/* Title row */}
      <View style={S.headerTitleRow}>
        <View style={S.headerAccent} />
        <View style={S.headerTitleBlock}>
          <Text style={S.headerTitle}>Lajme</Text>
          {authorsQuery.data ? (
            <Text style={S.headerSubtitle}>nga {authorsQuery.data.length} autorë · RTV Fontana</Text>
          ) : (
            <Text style={S.headerSubtitle}>RTV Fontana</Text>
          )}
        </View>
        <View style={{ flex: 1 }} />
        <HamburgerButton />
      </View>

      {/* Search */}
      <View style={S.searchRow}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} style={S.searchIcon} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Kërko lajme..."
          placeholderTextColor={colors.textTertiary}
          style={S.searchInput}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8} style={S.clearBtn}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

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
  );

  // ── Loading state ──────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <View style={S.screen}>
        {stickyHeader}
        <FlashList
          data={loadingRows}
          keyExtractor={(item) => String(item)}
          contentContainerStyle={{
            paddingTop: HEADER_H + 12,
            paddingBottom: bottomInsetOffset,
            paddingHorizontal: 16,
          }}
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
        refreshControl={
          <RefreshControl
            tintColor={colors.primary}
            refreshing={refreshing}
            onRefresh={refresh}
          />
        }
        decelerationRate="fast"
        contentContainerStyle={{
          paddingTop: HEADER_H + 12,
          paddingBottom: bottomInsetOffset,
          paddingHorizontal: 16,
        }}
        renderItem={renderPostItem}
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
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  inner: {
    height: 240,
    justifyContent: 'flex-end',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E5E7EB',
  },
  catBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  catText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1,
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
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.4,
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
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    marginRight: 8,
  },
  pillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  pillText: {
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    color: colors.textMuted,
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
  },
});

// ── Styles — screen ───────────────────────────────────────────────────────────
const S = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  // Sticky header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    gap: 10,
  },
  headerAccent: {
    width: 4,
    height: 26,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  headerTitleBlock: {
    gap: 1,
  },
  headerTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 20,
    color: colors.text,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  headerSubtitle: {
    fontFamily: fonts.uiRegular,
    fontSize: 11,
    color: colors.textMuted,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    marginBottom: 10,
    height: 44,
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
    marginHorizontal: -16,
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

