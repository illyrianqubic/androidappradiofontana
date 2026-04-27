import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { HamburgerButton } from '../../../components/HamburgerButton';
import { NewsCard } from '../../../components/NewsCard';
import { RelativeTime } from '../../../components/RelativeTime';
import { SkeletonCard } from '../../../components/SkeletonCard';
import { colors, elevation, fonts, radius, spacing } from '../../../design-tokens';
import {
  buildSanityImageUrl,
  defaultThumbhash,
  fetchPostBySlug,
  fetchRelatedPosts,
  type Post,
  type PortableTextBlock,
} from '../../../services/api';

function renderBodyBlock(block: PortableTextBlock, index: number) {
  if (block._type === 'image' && block.imageUrl) {
    const imageUri = buildSanityImageUrl(block.imageUrl, 1600);
    if (!imageUri) {
      return null;
    }

    return (
      <View key={`${block._key}-${index}`} style={styles.inlineImageCard}>
        <Image source={{ uri: imageUri }} contentFit="cover" style={styles.inlineImage} />
        {block.caption ? <Text style={styles.inlineImageCaption}>{block.caption}</Text> : null}
      </View>
    );
  }

  if (block._type !== 'block') {
    return null;
  }

  const text = block.children?.map((child) => child.text).join('')?.trim();
  if (!text) {
    return null;
  }

  if (block.style === 'h2') {
    return (
      <Text key={`${block._key}-${index}`} style={styles.h2}>
        {text}
      </Text>
    );
  }

  if (block.style === 'h3') {
    return (
      <Text key={`${block._key}-${index}`} style={styles.h3}>
        {text}
      </Text>
    );
  }

  if (block.listItem === 'bullet') {
    return (
      <View key={`${block._key}-${index}`} style={styles.bulletRow}>
        <Text style={styles.bulletDot}>•</Text>
        <Text style={styles.bulletText}>{text}</Text>
      </View>
    );
  }

  return (
    <Text key={`${block._key}-${index}`} style={styles.paragraph}>
      {text}
    </Text>
  );
}

export default function ArticleDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = params.slug;

  const bottomInsetOffset = insets.bottom + 196;

  const postQuery = useQuery({
    queryKey: ['post-detail', slug],
    enabled: Boolean(slug),
    queryFn: () => fetchPostBySlug(slug),
  });

  const relatedQuery = useQuery({
    queryKey: ['related-posts', slug, postQuery.data?.categories],
    enabled: Boolean(postQuery.data && slug),
    queryFn: () => fetchRelatedPosts(slug, postQuery.data?.categories),
  });

  const onShare = useCallback(async () => {
    const post = postQuery.data;
    if (!post) {
      return;
    }

    const articleUrl = Linking.createURL(`/news/${post.slug}`);

    await Share.share({
      title: post.title,
      message: `${post.title}\n${articleUrl}`,
      url: articleUrl,
    });
  }, [postQuery.data]);

  const onOpenRelatedPost = useCallback(
    (nextPost: Post) => {
      router.push({ pathname: '/article/[slug]' as never, params: { slug: nextPost.slug } as never });
    },
    [router],
  );

  const articleBody = useMemo(() => postQuery.data?.body ?? [], [postQuery.data?.body]);
  const relatedPosts = useMemo(() => relatedQuery.data ?? [], [relatedQuery.data]);
  const post = postQuery.data;

  const ARTICLE_NAV_H = 44;
  const navBarHeight = insets.top + ARTICLE_NAV_H;

  const articleNav = (
    <View style={[styles.articleNav, { paddingTop: insets.top + 6 }]}>
      <Pressable onPress={() => router.back()} style={styles.articleNavButton} hitSlop={8}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <HamburgerButton />
    </View>
  );

  if (postQuery.isLoading) {
    return (
      <View style={styles.screen}>
        {articleNav}
        <ScrollView
          contentContainerStyle={[
            styles.loadingContent,
            { paddingTop: navBarHeight + 12, paddingBottom: bottomInsetOffset },
          ]}
          style={{ flex: 1 }}
        >
          {Array.from({ length: 5 }, (_, item) => (
            <SkeletonCard key={`article-loading-${item}`} height={180} style={styles.loadingCard} />
          ))}
        </ScrollView>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.screen}>
        {articleNav}
        <View
          style={[
            styles.emptyStateWrap,
            { paddingTop: navBarHeight + 12, paddingBottom: insets.bottom + spacing.xl },
          ]}
        >
          <Text style={styles.emptyStateTitle}>Artikulli nuk u gjet</Text>
          <Text style={styles.emptyStateSubtitle}>Provo përsëri pas pak ose kthehu te lista e lajmeve.</Text>
        </View>
      </View>
    );
  }

  const heroImageUri = buildSanityImageUrl(post.mainImageUrl, 1800);

  return (
    <View style={styles.screen}>
      {articleNav}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: navBarHeight, paddingBottom: bottomInsetOffset },
        ]}
        style={{ flex: 1 }}
      >
        <Image
          source={heroImageUri ? { uri: heroImageUri } : undefined}
          placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
          contentFit="cover"
          style={styles.heroImage}
        />

        <View style={styles.articleColumn}>
          <Text style={styles.category}>{post.categories?.[0] ?? 'Lajme'}</Text>
          <Text style={styles.title}>{post.title}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.author}>{post.author ?? 'Redaksia Fontana'}</Text>
            <RelativeTime timestamp={post.publishedAt} />
          </View>

          <View style={styles.actionRow}>
            <Pressable onPress={onShare} style={styles.actionButton}>
              <Text style={styles.actionLabel}>Ndaj</Text>
            </Pressable>
          </View>

          <View style={styles.bodyWrap}>
            {articleBody.map((block, idx) => renderBodyBlock(block, idx))}
          </View>

          {relatedPosts.length ? (
            <View style={styles.relatedSection}>
              <Text style={styles.relatedTitle}>Artikuj të ngjashëm</Text>
              {relatedPosts.map((item) => (
                <NewsCard key={item._id} post={item} onPress={onOpenRelatedPost} />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  articleNav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  articleNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  loadingCard: {
    borderRadius: radius.card,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surfaceSubtle,
  },
  articleColumn: {
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  category: {
    marginTop: spacing.md,
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    marginTop: spacing.sm,
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  metaRow: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  author: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    marginRight: spacing.md,
    flexShrink: 1,
  },
  actionRow: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  actionLabel: {
    color: colors.text,
    fontFamily: fonts.uiMedium,
    fontSize: 14,
  },
  bodyWrap: {
    marginTop: spacing.lg,
    gap: spacing.lg,
  },
  paragraph: {
    color: colors.text,
    fontFamily: fonts.articleRegular,
    fontSize: 17,
    lineHeight: 30,
    flexShrink: 1,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bulletDot: {
    marginTop: 7,
    marginRight: spacing.sm,
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 16,
  },
  bulletText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.articleRegular,
    fontSize: 17,
    lineHeight: 30,
    flexShrink: 1,
  },
  h2: {
    marginTop: spacing.md,
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 22,
    lineHeight: 28,
    flexShrink: 1,
  },
  h3: {
    marginTop: spacing.sm,
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 18,
    lineHeight: 24,
    flexShrink: 1,
  },
  inlineImageCard: {
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.card,
  },
  inlineImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: colors.surfaceSubtle,
  },
  inlineImageCaption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  relatedSection: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  relatedTitle: {
    marginBottom: spacing.sm,
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 18,
    flexShrink: 1,
  },
  emptyStateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surface,
  },
  emptyStateTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 24,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
