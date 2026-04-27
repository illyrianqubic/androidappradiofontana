import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { NewsCard } from '../../../components/NewsCard';
import { SkeletonCard } from '../../../components/SkeletonCard';
import { StickyTopBar } from '../../../components/StickyTopBar';
import { HamburgerButton } from '../../../components/HamburgerButton';
import { colors, fonts, radius, spacing } from '../../../design-tokens';
import {
  fetchAuthors,
  fetchLatestPosts,
  type Post,
} from '../../../services/api';

type NewsCategoryTab = {
  label: string;
  slug: string;
};

const NEWS_CATEGORY_TABS: NewsCategoryTab[] = [
  { label: 'Të Gjitha', slug: '' },
  { label: 'Lajme', slug: 'lajme' },
  { label: 'Sport', slug: 'sport' },
  { label: 'Teknologji', slug: 'teknologji' },
  { label: 'Showbiz', slug: 'showbiz' },
  { label: 'Shëndetësi', slug: 'shendetesi' },
  { label: 'Nga Bota', slug: 'nga-bota' },
];

export default function NewsIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashListRef<Post>>(null);
  const [activeCategory, setActiveCategory] = useState<NewsCategoryTab>(NEWS_CATEGORY_TABS[0]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const loadingRows = useMemo(() => [1, 2, 3, 4], []);
  const topInsetOffset = insets.top + 72;
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

  const authorsCount = authorsQuery.data?.length ?? 0;

  const openPost = useCallback(
    (post: Post) => {
      router.push({ pathname: '/article/[slug]' as never, params: { slug: post.slug } as never });
    },
    [router],
  );

  const onSelectCategory = useCallback((category: NewsCategoryTab) => {
    setActiveCategory(category);
    // Snap immediately — animated:true can race with placeholderData swap causing a jump.
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // Safety net: scroll to top after the render cycle that follows a category change.
  // Handles the case where new data arrives before the synchronous scroll above takes effect.
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

  const renderLoadingItem = useCallback(() => <SkeletonCard height={180} />, []);

  const renderPostItem = useCallback(
    ({ item }: ListRenderItemInfo<Post>) => <NewsCard post={item} onPress={openPost} />,
    [openPost],
  );

  const renderCategoryItem = useCallback(
    ({ item }: ListRenderItemInfo<NewsCategoryTab>) => {
      const active = item.slug === activeCategory.slug;

      return (
        <Pressable
          onPress={() => onSelectCategory(item)}
          style={[styles.categoryPill, active && styles.categoryPillActive]}
        >
          <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>
            {item.label}
          </Text>
        </Pressable>
      );
    },
    [activeCategory, onSelectCategory],
  );

  const listHeader = useMemo(
    () => (
      <View>
        {authorsCount > 0 ? (
          <Text style={styles.subtitle}>Publikuar nga {authorsCount} autorë</Text>
        ) : null}

        <View style={styles.searchWrap}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Kërko lajme..."
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>

        <FlashList
          horizontal
          data={NEWS_CATEGORY_TABS}
          keyExtractor={(item) => item.slug || 'all'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRail}
          renderItem={renderCategoryItem}
        />
      </View>
    ),
    [authorsCount, renderCategoryItem, search],
  );

  if (initialLoading) {
    return (
      <View style={styles.screen}>
        <StickyTopBar
          title="Lajme"
          subtitle="Përditësime nga RTV Fontana"
          topInset={insets.top}
          rightElement={<HamburgerButton />}
        />
        <FlashList
          data={loadingRows}
          keyExtractor={(item) => String(item)}
          contentContainerStyle={[
            styles.loadingContent,
            { paddingTop: topInsetOffset, paddingBottom: bottomInsetOffset },
          ]}
          renderItem={renderLoadingItem}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StickyTopBar
        title="Lajme"
        subtitle="Përditësime nga RTV Fontana"
        topInset={insets.top}
        rightElement={<HamburgerButton />}
      />
      <FlashList
        ref={listRef}
        data={postsQuery.data ?? []}
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
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: topInsetOffset, paddingBottom: bottomInsetOffset },
        ]}
        renderItem={renderPostItem}
        ListHeaderComponent={listHeader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  loadingContent: {
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    marginTop: -4,
    marginBottom: spacing.sm,
  },
  searchWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: {
    height: 46,
    color: colors.text,
    fontFamily: fonts.uiRegular,
    fontSize: 15,
  },
  categoryRail: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  categoryPill: {
    marginRight: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryPillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.redTint,
  },
  categoryPillText: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    flexShrink: 1,
  },
  categoryPillTextActive: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    flexShrink: 1,
  },
});
