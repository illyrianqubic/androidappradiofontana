import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { HamburgerButton } from '../../../components/HamburgerButton';
import { NewsCard } from '../../../components/NewsCard';
import { RelativeTime } from '../../../components/RelativeTime';
import { SkeletonCard } from '../../../components/SkeletonCard';
import { appIdentity, colors, elevation, fonts, radius, spacing } from '../../../design-tokens';
import { ms, s, vs } from '../../../lib/responsive';
import {
  buildSanityImageUrl,
  defaultThumbhash,
  fetchPostBySlug,
  fetchRelatedPosts,
  type Post,
  type PortableTextBlock,
} from '../../../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────
const HERO_H = vs(300);
const ARTICLE_NAV_H = 62;

// ── Body block renderer ───────────────────────────────────────────────────────
function renderBodyBlock(block: PortableTextBlock, index: number) {
  if (block._type === 'image' && block.imageUrl) {
    // Use 900px for inline images — fast to load, crisp enough on mobile
    const imageUri = buildSanityImageUrl(block.imageUrl, 900);
    if (!imageUri) {
      return null;
    }

    return (
      <View key={`${block._key}-${index}`} style={styles.inlineImageCard}>
        <Image source={{ uri: imageUri }} contentFit="cover" transition={0} style={styles.inlineImage} />
        {block.caption ? <Text style={styles.inlineImageCaption}>{block.caption}</Text> : null}
      </View>
    );
  }

  // Permissive text extraction: any block with a `children` array of
  // text-bearing spans renders, regardless of `_type`. Some Sanity schemas
  // use custom block names like 'paragraph', 'heading', etc. that don't
  // satisfy the strict `_type === 'block'` check, which made them invisible.
  const text = Array.isArray(block.children)
    ? block.children
        .map((child) => (child && typeof child.text === 'string' ? child.text : ''))
        .join('')
        .trim()
    : '';
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
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const postQuery = useQuery({
    queryKey: ['post-detail', slug],
    enabled: Boolean(slug),
    queryFn: () => fetchPostBySlug(slug),
    // M28: 10min staleTime so re-entering the same article within a session
    // never re-hits Sanity. The body field is the heaviest payload in the
    // entire app (up to 100KB of portable text + asset URLs).
    staleTime: 10 * 60 * 1000,
  });

  // Stable string queryKey for related posts — array references would change
  // identity on every parent re-render and trigger spurious refetches.
  const categoriesKey = postQuery.data?.categories?.join('|') ?? '';
  const relatedQuery = useQuery({
    queryKey: ['related-posts', slug, categoriesKey],
    enabled: Boolean(postQuery.data && slug),
    queryFn: () => fetchRelatedPosts(slug, postQuery.data?.categories),
  });

  const navBarHeight = insets.top + ARTICLE_NAV_H;
  const tabBarHeight = insets.bottom + 72;

  // H15: stable contentContainerStyle refs.
  const loadingContentContainerStyle = useMemo(
    () => ({
      paddingTop: navBarHeight + 12,
      paddingBottom: tabBarHeight + 80,
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
    }),
    [navBarHeight, tabBarHeight],
  );
  const articleContentContainerStyle = useMemo(
    () => ({
      paddingTop: navBarHeight,
      paddingBottom: tabBarHeight + 80,
    }),
    [navBarHeight, tabBarHeight],
  );

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
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setLinkCopied(false), 2400);
  }, [postQuery.data, articleWebUrl]);
  const onShare = useCallback(async () => {
    const post = postQuery.data; if (!post) return;
    const articleUrl = Linking.createURL(`/news/${post.slug}`);
    await Share.share({ title: post.title, message: `${post.title}\n${articleUrl}`, url: articleUrl });
  }, [postQuery.data]);
  const onOpenRelatedPost = useCallback(
    (nextPost: Post) => {
      // Do NOT seed ['post-detail', slug] with the shallow related-post object
      // — it has no body[], and writing it as fresh data (staleTime 10min)
      // would prevent fetchPostBySlug from running on the next screen.
      router.push({ pathname: '/news/[slug]' as never, params: { slug: nextPost.slug } as never });
    },
    [router],
  );

  const articleBody = useMemo(() => postQuery.data?.body ?? [], [postQuery.data?.body]);
  const relatedPosts = useMemo(() => relatedQuery.data ?? [], [relatedQuery.data]);
  const post = postQuery.data;

  // Debug: log body length + types whenever it lands so we can verify the
  // GROQ projection is returning every block. No truncation/slice anywhere.
  useEffect(() => {
    if (!articleBody.length) return;
    // eslint-disable-next-line no-console
    console.log(
      `[ArticleDetail] slug=${slug} blocks=${articleBody.length} types=${articleBody.map((b) => b._type).join(',')}`,
    );
  }, [articleBody, slug]);

  // Render all blocks immediately — no InteractionManager defer, no slice.
  const visibleBody = articleBody;

  // Cleanup pending "link copied" timer on unmount
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  // ── Sticky nav bar ─────────────────────────────────────────────────────────
  // Back from an article always lands on the Lajme listing — even when the
  // article was opened from the Home tab. Using router.back() would pop to
  // whichever screen pushed the slug (often Home), which meant the listing
  // never got a chance to render and "back" felt like it skipped a page.
  const onBack = useCallback(() => {
    router.replace('/(tabs)/news' as never);
  }, [router]);

  // Android hardware back: route through onBack so it lands on the Lajme
  // listing instead of popping back to whichever tab pushed the article.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const articleNav = (
    <View style={[styles.articleNav, { paddingTop: insets.top + 10 }]}>
      <View style={styles.articleNavSlot}>
        <Pressable onPress={onBack} hitSlop={12}>
          <View style={styles.articleNavButton}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </View>
        </Pressable>
      </View>
      <View style={styles.articleNavCenter}>
        <Image source={appIdentity.logo} contentFit="cover" style={styles.articleNavLogo} />
      </View>
      <View style={styles.articleNavSlot}>
        <HamburgerButton />
      </View>
    </View>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (postQuery.isLoading) {
    return (
      <View style={styles.screen}>
        {articleNav}
        <ScrollView
          contentContainerStyle={loadingContentContainerStyle}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonCard key={`sk-${i}`} height={180} style={{ borderRadius: radius.card }} />
          ))}
        </ScrollView>
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
      </View>
    );
  }

  // C-A7: hero rendered at 480 px (was 900). Matches the URL prefetched
  // from the home + news lists so it lands from memory cache on arrival.
  const heroImageUri = buildSanityImageUrl(post.mainImageUrl, 480);
  const heroCategory = (post.categories?.[0] ?? 'Lajme').trim();
  const isBreakingCategory = post.breaking || /^lajm i fundit$/i.test(heroCategory);

  // ── Main article view ──────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {articleNav}

      <ScrollView
        contentContainerStyle={articleContentContainerStyle}
        showsVerticalScrollIndicator={false}
      >
        {/* Full-bleed hero */}
        <View style={styles.heroContainer}>
          <Image
            source={heroImageUri ? { uri: heroImageUri } : undefined}
            placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
            contentFit="cover"
            transition={0}
            style={StyleSheet.absoluteFillObject}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.60)']}
            locations={[0.38, 0.70, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[styles.heroCatBadge, isBreakingCategory && styles.heroCatBadgeBreaking]}>
            {isBreakingCategory ? <View style={styles.heroCatDot} /> : null}
            <Text style={[styles.heroCatText, isBreakingCategory && styles.heroCatTextBreaking]}>
              {heroCategory.toUpperCase()}
            </Text>
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
              <Ionicons name="share-outline" size={15} color="#FFFFFF" />
              <Text style={styles.shareQuickLabel}>Ndaj</Text>
            </Pressable>

            <View style={styles.bodyWrap}>
              {visibleBody.length > 0 ? (
                visibleBody.map((block, idx) => renderBodyBlock(block, idx))
              ) : post.excerpt ? (
                // Fallback: if Sanity returned no body/content blocks, render
                // the excerpt so the user always sees article text.
                <Text style={styles.paragraph}>{post.excerpt}</Text>
              ) : null}
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
      </ScrollView>
    </View>
  );
}

// ── StyleSheet ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surface,
    shadowColor: colors.navy,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  articleNavSlot: {
    width: s(44),
    alignItems: 'center',
  },
  articleNavCenter: {
    alignItems: 'center',
  },
  articleNavLogo: {
    width: s(38),
    height: s(38),
    borderRadius: s(9),
    marginTop: 8,
  },
  articleNavButton: {
    width: s(38),
    height: s(38),
    borderRadius: s(19),
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
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
    bottom: 46,
    left: 18,
    backgroundColor: 'rgba(15,23,42,0.58)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroCatBadgeBreaking: {
    backgroundColor: '#FF3333',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#FF3333',
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  heroCatDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
  },
  heroCatText: {
    color: 'rgba(255,255,255,0.95)',
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  heroCatTextBreaking: {
    color: '#FFFFFF',
    fontSize: 10,
    letterSpacing: 1.4,
  },

  // ── Content card ──────────────────────────────────────────────────────────
  articleCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -32,
    minHeight: 400,
  },
  cardHandle: {
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 0,
    width: 32,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: colors.border,
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
    fontSize: ms(25),
    lineHeight: ms(33),
    letterSpacing: -0.6,
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
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.navyMuted,
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
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.navy,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: spacing.md,
  },
  shareQuickLabel: {
    fontFamily: fonts.uiMedium,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  bodyWrap: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  paragraph: {
    color: colors.textSecondary,
    fontFamily: fonts.articleRegular,
    fontSize: ms(17),
    lineHeight: ms(31),
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
});
