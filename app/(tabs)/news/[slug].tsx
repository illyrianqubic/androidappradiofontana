import { useCallback, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { HamburgerButton } from '../../../components/HamburgerButton';
import { NewsCard } from '../../../components/NewsCard';
import { RelativeTime } from '../../../components/RelativeTime';
import { SkeletonCard } from '../../../components/SkeletonCard';
import { useUI } from '../../../context/UIContext';
import { appIdentity, colors, elevation, fonts, radius, spacing } from '../../../design-tokens';
import {
  buildSanityImageUrl,
  defaultThumbhash,
  fetchPostBySlug,
  fetchRelatedPosts,
  type Post,
  type PortableTextBlock,
} from '../../../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────
const HERO_H = 270;
const ARTICLE_NAV_H = 62;
const FADE_START = HERO_H - 110;
const FADE_END = HERO_H - 28;

// ── Body block renderer ───────────────────────────────────────────────────────
function renderBodyBlock(block: PortableTextBlock, index: number) {
  if (block._type === 'image' && block.imageUrl) {
    const imageUri = buildSanityImageUrl(block.imageUrl, 1200);
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
  const [linkCopied, setLinkCopied] = useState(false);
  const { hideMiniPlayer, showMiniPlayer } = useUI();

  // ── Auto-hide MiniPlayer while reading ───────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      hideMiniPlayer();
      return () => { showMiniPlayer(); };
    }, [hideMiniPlayer, showMiniPlayer]),
  );

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

  // ── Scroll-driven nav animation ───────────────────────────────────────────
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });
  const navBarHeight = insets.top + ARTICLE_NAV_H;
  const tabBarHeight = insets.bottom + 72;

  const navBgStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(255,255,255,${interpolate(scrollY.value, [FADE_START, FADE_END], [0, 1], Extrapolation.CLAMP)})`,
  }));
  const navBorderStyle = useAnimatedStyle(() => ({
    borderBottomWidth: interpolate(scrollY.value, [FADE_START, FADE_END], [0, 2], Extrapolation.CLAMP),
    borderBottomColor: `rgba(220,38,38,${interpolate(scrollY.value, [FADE_START, FADE_END], [0, 1], Extrapolation.CLAMP)})`,
    shadowOpacity: interpolate(scrollY.value, [FADE_START, FADE_END], [0, 0.07], Extrapolation.CLAMP),
  }));
  const backBtnBgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(scrollY.value, [0, FADE_END], ['rgba(0,0,0,0.38)', '#F3F4F6']),
    borderColor: interpolateColor(scrollY.value, [0, FADE_END], ['rgba(255,255,255,0.15)', 'rgba(0,0,0,0.05)']),
  }));
  const whiteIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [FADE_START, FADE_END], [1, 0], Extrapolation.CLAMP),
  }));
  const darkIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [FADE_START, FADE_END], [0, 1], Extrapolation.CLAMP),
  }));
  const centerLogoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [FADE_START, FADE_END], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(scrollY.value, [FADE_START, FADE_END], [0.86, 1], Extrapolation.CLAMP) }],
  }));

  const articleWebUrl = useCallback(
    (p: Post) => `https://radiofontana.org/lajme/${p.slug}`,
    [],
  );
  const onShareFacebook = useCallback(async () => {
    const p = postQuery.data; if (!p) return;
    await Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleWebUrl(p))}`);
  }, [postQuery.data, articleWebUrl]);
  const onShareWhatsApp = useCallback(async () => {
    const p = postQuery.data; if (!p) return;
    await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(`${p.title} ${articleWebUrl(p)}`)}`);
  }, [postQuery.data, articleWebUrl]);
  const onCopyLink = useCallback(async () => {
    const p = postQuery.data; if (!p) return;
    await Clipboard.setStringAsync(articleWebUrl(p));
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2400);
  }, [postQuery.data, articleWebUrl]);
  const onShare = useCallback(async () => {
    const post = postQuery.data; if (!post) return;
    const articleUrl = Linking.createURL(`/news/${post.slug}`);
    await Share.share({ title: post.title, message: `${post.title}\n${articleUrl}`, url: articleUrl });
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

  // ── Animated nav ──────────────────────────────────────────────────────────
  const articleNav = (
    <Animated.View style={[styles.articleNav, { paddingTop: insets.top }, navBgStyle, navBorderStyle]}>
      <View style={styles.articleNavSlot}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Animated.View style={[styles.articleNavButton, backBtnBgStyle]}>
            <Animated.View style={[StyleSheet.absoluteFillObject, styles.iconCenter, whiteIconStyle]}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFillObject, styles.iconCenter, darkIconStyle]}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Animated.View>
          </Animated.View>
        </Pressable>
      </View>
      <Animated.View style={[styles.articleNavCenter, centerLogoStyle]}>
        <Image source={appIdentity.logo} contentFit="cover" style={styles.articleNavLogo} />
        <Text style={styles.articleNavTitle}>Radio Fontana</Text>
      </Animated.View>
      <View style={styles.articleNavSlot}>
        <HamburgerButton />
      </View>
    </Animated.View>
  );

  // ── Bottom tab bar ────────────────────────────────────────────────────────
  const bottomTabBar = (
    <View style={[styles.articleTabBar, { height: tabBarHeight, paddingBottom: insets.bottom + 4 }]}>
      <Pressable style={styles.articleTabItem} onPress={() => router.replace('/(tabs)' as never)}>
        <Ionicons name="home-outline" size={24} color={colors.textMuted} />
        <Text style={styles.articleTabLabel}>Kryefaqja</Text>
      </Pressable>
      <Pressable style={styles.articleTabItem} onPress={() => router.replace('/(tabs)/live' as never)}>
        <Ionicons name="radio-outline" size={24} color={colors.textMuted} />
        <Text style={styles.articleTabLabel}>Drejtpërdrejt</Text>
      </Pressable>
      <Pressable style={styles.articleTabItem} onPress={() => router.replace('/(tabs)/news' as never)}>
        <Ionicons name="newspaper-outline" size={24} color={colors.textMuted} />
        <Text style={styles.articleTabLabel}>Lajme</Text>
      </Pressable>
    </View>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (postQuery.isLoading) {
    return (
      <View style={styles.screen}>
        {articleNav}
        <Animated.ScrollView
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: navBarHeight + 12, paddingBottom: tabBarHeight + 80, paddingHorizontal: spacing.lg, gap: spacing.sm }}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonCard key={`sk-${i}`} height={180} style={{ borderRadius: radius.card }} />
          ))}
        </Animated.ScrollView>
        {bottomTabBar}
      </View>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────────
  if (!post) {
    return (
      <View style={styles.screen}>
        {articleNav}
        <View style={[styles.emptyStateWrap, { paddingTop: navBarHeight + 12, paddingBottom: insets.bottom + spacing.xl }]}>
          <Ionicons name="document-outline" size={52} color={colors.border} />
          <Text style={styles.emptyStateTitle}>Artikulli nuk u gjet</Text>
          <Text style={styles.emptyStateSubtitle}>Provo përsëri pas pak ose kthehu te lista e lajmeve.</Text>
        </View>
        {bottomTabBar}
      </View>
    );
  }

  const heroImageUri = buildSanityImageUrl(post.mainImageUrl, 1200);

  // ── Main article view ──────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {articleNav}

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Full-bleed hero */}
        <View style={styles.heroContainer}>
          <Image
            source={heroImageUri ? { uri: heroImageUri } : undefined}
            placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
            contentFit="cover"
            style={StyleSheet.absoluteFillObject}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.60)']}
            locations={[0.38, 0.70, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroCatBadge}>
            <Text style={styles.heroCatText}>{(post.categories?.[0] ?? 'Lajme').toUpperCase()}</Text>
          </View>
        </View>

        {/* Article card — slides up over hero */}
        <View style={styles.articleCard}>
          <View style={styles.cardHandle} />
          <View style={styles.articleColumn}>
            <Text style={styles.title}>{post.title}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaAuthorRow}>
                <View style={styles.metaAuthorDot} />
                <Text style={styles.author}>{post.author ?? 'Redaksia Fontana'}</Text>
              </View>
              <RelativeTime timestamp={post.publishedAt} />
            </View>
            <View style={styles.divider} />
            <Pressable
              onPress={onShare}
              style={({ pressed }) => [styles.shareQuickBtn, pressed && { opacity: 0.75 }]}
            >
              <Ionicons name="share-outline" size={15} color={colors.primary} />
              <Text style={styles.shareQuickLabel}>Ndaj</Text>
            </Pressable>

            <View style={styles.bodyWrap}>
              {articleBody.map((block, idx) => renderBodyBlock(block, idx))}
            </View>

            {/* Share section */}
            <View style={styles.shareSection}>
              <View style={styles.shareSectionHeader}>
                <View style={styles.shareSectionAccent} />
                <Text style={styles.shareTitle}>Ndaj artikullin</Text>
              </View>
              <View style={styles.shareRow}>
                <Pressable onPress={onShareFacebook} style={[styles.shareBtn, styles.shareBtnFB]}>
                  <Ionicons name="logo-facebook" size={18} color="#FFFFFF" />
                  <Text style={styles.shareBtnLabel}>Facebook</Text>
                </Pressable>
                <Pressable onPress={onShareWhatsApp} style={[styles.shareBtn, styles.shareBtnWA]}>
                  <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
                  <Text style={styles.shareBtnLabel}>WhatsApp</Text>
                </Pressable>
                <Pressable onPress={onCopyLink} style={[styles.shareBtn, styles.shareBtnCopy, linkCopied && styles.shareBtnCopyDone]}>
                  <Ionicons name={linkCopied ? 'checkmark' : 'link-outline'} size={18} color={linkCopied ? colors.primary : colors.text} />
                  <Text style={[styles.shareBtnLabel, styles.shareBtnLabelCopy, linkCopied && styles.shareBtnLabelCopyDone]}>
                    {linkCopied ? 'Kopjuar!' : 'Kopjo'}
                  </Text>
                </Pressable>
              </View>
              {linkCopied ? (
                <View style={styles.copiedToast}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                  <Text style={styles.copiedToastText}>Linku u kopjua!</Text>
                </View>
              ) : null}
            </View>

            {/* Related */}
            {relatedPosts.length > 0 ? (
              <View style={styles.relatedSection}>
                <View style={styles.relatedHeader}>
                  <View style={styles.relatedAccent} />
                  <Text style={styles.relatedTitle}>Artikuj të ngjashëm</Text>
                </View>
                {relatedPosts.map((item) => (
                  <NewsCard key={item._id} post={item} onPress={onOpenRelatedPost} />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </Animated.ScrollView>

      {bottomTabBar}
    </View>
  );
}

// ── StyleSheet ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F3F5',
  },

  // ── Nav bar ───────────────────────────────────────────────────────────────
  articleNav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  articleNavSlot: {
    width: 44,
    alignItems: 'center',
  },
  articleNavCenter: {
    alignItems: 'center',
    gap: 2,
  },
  articleNavTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    color: colors.primary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  articleNavLogo: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
  },
  articleNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  iconCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroContainer: {
    height: HERO_H,
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
  },
  heroCatBadge: {
    position: 'absolute',
    bottom: 42,
    left: 18,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  heroCatText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },

  // ── Content card ──────────────────────────────────────────────────────────
  articleCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -28,
    minHeight: 400,
  },
  cardHandle: {
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 2,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
  articleColumn: {
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    overflow: 'hidden',
  },
  title: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 24,
    lineHeight: 31,
    letterSpacing: -0.4,
    flexShrink: 1,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  metaAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: spacing.md,
  },
  metaAuthorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    flexShrink: 0,
  },
  author: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    flexShrink: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  shareQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: colors.redTint,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.15)',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: spacing.md,
  },
  shareQuickLabel: {
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    color: colors.primary,
  },
  bodyWrap: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
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
    fontSize: 21,
    lineHeight: 27,
    flexShrink: 1,
  },
  h3: {
    marginTop: spacing.sm,
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 17,
    lineHeight: 23,
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
    fontSize: 12,
    lineHeight: 17,
  },

  // ── Share section ─────────────────────────────────────────────────────────
  shareSection: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  shareSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  shareSectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  shareTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 16,
    color: colors.text,
  },
  shareRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  shareBtnFB: { backgroundColor: '#1877F2' },
  shareBtnWA: { backgroundColor: '#25D366' },
  shareBtnCopy: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  shareBtnCopyDone: {
    backgroundColor: colors.redTint,
    borderColor: colors.primary,
  },
  shareBtnLabel: {
    fontFamily: fonts.uiBold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  shareBtnLabelCopy: { color: colors.text },
  shareBtnLabelCopyDone: { color: colors.primary },
  copiedToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: colors.redTint,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  copiedToastText: {
    fontFamily: fonts.uiMedium,
    fontSize: 12,
    color: colors.primary,
  },

  // ── Related ───────────────────────────────────────────────────────────────
  relatedSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  relatedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  relatedAccent: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  relatedTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 17,
    color: colors.text,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyStateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyStateTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 22,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },

  // ── Bottom tab bar ────────────────────────────────────────────────────────
  articleTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  articleTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  articleTabLabel: {
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
