import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  InteractionManager,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as Font from 'expo-font';
import {
  Merriweather_400Regular,
  Merriweather_400Regular_Italic,
  Merriweather_700Bold,
} from '@expo-google-fonts/merriweather';

import { HamburgerButton } from '../../../components/HamburgerButton';
import { SkeletonCard } from '../../../components/SkeletonCard';
import { appIdentity, colors, fonts, spacing } from '../../../design-tokens';
import { ms, s, vs } from '../../../lib/responsive';
import {
  buildSanityImageUrl,
  defaultThumbhash,
  fetchPostBySlug,
  fetchRelatedPosts,
  sanityImageWidths,
  type Post,
  type PortableTextBlock,
} from '../../../services/api';

// AUDIT FIX P1.2: Merriweather is loaded lazily on the article screen
// only — saves the cold-start cost of fetching/parsing 3 serif weights for
// users who never open an article. Module-scoped guard so the load only
// happens once per app session even across multiple article opens.
let _merriweatherLoadPromise: Promise<void> | null = null;
function loadMerriweather(): Promise<void> {
  if (_merriweatherLoadPromise) return _merriweatherLoadPromise;
  _merriweatherLoadPromise = Font.loadAsync({
    MerriweatherVariable: Merriweather_400Regular,
    MerriweatherVariableItalic: Merriweather_400Regular_Italic,
    MerriweatherVariableBold: Merriweather_700Bold,
  }).catch(() => {
    // Font load failure: caller falls back to system serif. Reset the
    // promise so a future open can retry.
    _merriweatherLoadPromise = null;
  }) as Promise<void>;
  return _merriweatherLoadPromise;
}

// ── Editorial constants ──────────────────────────────────────────────────────
const HERO_H = vs(360);
const ARTICLE_NAV_H = 60;
const BODY_PADDING_H = spacing.lg + 4; // 24px

// Premium reading palette overrides — tuned for long-form
const INK = '#0B1220';        // body text
const INK_SOFT = '#3B4456';   // captions, byline
const INK_FAINT = '#8A93A6';  // metadata
const RULE = '#E6E1D8';       // warm ivory rules
const PAPER = '#FBF9F4';      // header section warm paper
const ACCENT = colors.primary; // brand red

// Approximate average words-per-minute for Albanian readers
const WPM = 220;

// ── Body block renderer ──────────────────────────────────────────────────────
type BodyBlockState = { firstParagraphRendered: boolean };

function extractText(block: PortableTextBlock): string {
  if (!Array.isArray(block.children)) return '';
  return block.children
    .map((c) => (c && typeof c.text === 'string' ? c.text : ''))
    .join('')
    .trim();
}

function renderBodyBlock(
  block: PortableTextBlock,
  index: number,
  state: BodyBlockState,
): React.ReactNode {
  // Inline image: full-bleed (negative horizontal margins extend past the
  // article column padding so the image kisses both screen edges)
  if (block._type === 'image' && block.imageUrl) {
    const imageUri = buildSanityImageUrl(block.imageUrl, sanityImageWidths.articleInline);
    if (!imageUri) return null;
    return (
      <View key={`${block._key}-${index}`} style={styles.inlineImageWrap}>
        <Image
          source={{ uri: imageUri }}
          contentFit="cover"
          transition={0}
          style={styles.inlineImage}
        />
        {block.caption ? (
          <Text style={styles.inlineImageCaption}>
            <Text style={styles.captionDash}>— </Text>
            {block.caption}
          </Text>
        ) : null}
      </View>
    );
  }

  const text = extractText(block);
  if (!text) return null;

  // Headings — h2 with red rule above, h3 as small-caps eyebrow
  if (block.style === 'h2') {
    return (
      <View key={`${block._key}-${index}`} style={styles.h2Wrap}>
        <View style={styles.h2Rule} />
        <Text style={styles.h2}>{text}</Text>
      </View>
    );
  }
  if (block.style === 'h3') {
    return (
      <Text key={`${block._key}-${index}`} style={styles.h3}>
        {text}
      </Text>
    );
  }

  // Pull quote — any blockquote-styled block
  if (block.style === 'blockquote') {
    return (
      <View key={`${block._key}-${index}`} style={styles.pullQuote}>
        <Text style={styles.pullQuoteMark}>“</Text>
        <Text style={styles.pullQuoteText}>{text}</Text>
      </View>
    );
  }

  // Bullet
  if (block.listItem === 'bullet') {
    return (
      <View key={`${block._key}-${index}`} style={styles.bulletRow}>
        <View style={styles.bulletDot} />
        <Text style={styles.bulletText}>{text}</Text>
      </View>
    );
  }

  // Body paragraph — first one gets an editorial lead-in (small-caps first
  // 1–3 words in Inter Bold, then a serif em-dash, then the rest of the
  // paragraph in Merriweather). Mimics NYT-style article openings.
  if (!state.firstParagraphRendered) {
    state.firstParagraphRendered = true;
    return (
      <Text key={`${block._key}-${index}`} style={styles.firstParagraph}>
        {renderEditorialLead(text)}
      </Text>
    );
  }

  return (
    <Text key={`${block._key}-${index}`} style={styles.paragraph}>
      {text}
    </Text>
  );
}

// "ROMA — Lajmi i fundit ka..." style. Take the first 1–3 short capitalisable
// words (max 28 chars) and render them as a small-caps lead-in.
function renderEditorialLead(text: string): React.ReactNode {
  const words = text.split(/\s+/);
  let leadWords: string[] = [];
  let leadLen = 0;
  for (const w of words) {
    if (leadWords.length >= 3) break;
    if (leadLen + w.length > 28 && leadWords.length > 0) break;
    leadWords.push(w);
    leadLen += w.length + 1;
  }
  // Avoid swallowing the entire short paragraph as the lead
  if (leadWords.length >= words.length) leadWords = leadWords.slice(0, 1);
  const lead = leadWords.join(' ').toUpperCase().replace(/[.,;:]+$/, '');
  const rest = text.slice(leadWords.join(' ').length);
  return (
    <>
      <Text style={styles.leadIn}>{lead}</Text>
      <Text style={styles.leadDash}> — </Text>
      <Text>{rest.replace(/^[\s—–-]+/, '')}</Text>
    </>
  );
}

function countWords(blocks: PortableTextBlock[]): number {
  let total = 0;
  for (const b of blocks) {
    if (b._type === 'image') continue;
    const t = extractText(b);
    if (!t) continue;
    total += t.split(/\s+/).length;
  }
  return total;
}

function formatPubDate(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('sq-AL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

// Memoized body — only re-renders when the post body changes. Without this
// every screen-level state change (linkCopied toggle on share-copy, refetch,
// related-query landing) re-walked the portable-text array and rebuilt every
// <Text> block. With ~10–30 blocks per article this saved 8–20 ms per
// re-render on Cortex-A53.
//
// PERF (root cause of "freeze on opening article"): rendering all 30–60
// portable-text blocks synchronously after bodyReady=true blocked JS for
// 80–250 ms on mid-range Android *right after the slide-in animation*,
// producing a visible stall. We now render the first ARTICLE_BODY_INITIAL
// blocks immediately (enough to fill the viewport and let the user start
// reading), then incrementally append ARTICLE_BODY_CHUNK more blocks per
// frame using requestAnimationFrame. Each chunk render is small enough to
// stay under the 16 ms frame budget so subsequent scroll input is never
// starved.
const ARTICLE_BODY_INITIAL = 6;
const ARTICLE_BODY_CHUNK = 6;

const ArticleBody = memo(function ArticleBody({
  blocks,
  excerpt,
}: {
  blocks: PortableTextBlock[];
  excerpt: string | undefined;
}) {
  const total = blocks.length;
  const [renderedCount, setRenderedCount] = useState(() =>
    Math.min(ARTICLE_BODY_INITIAL, total),
  );

  // Reset counter if the underlying blocks array changes (e.g. user navigates
  // to a related article and the same <ArticleBody> instance gets new props).
  useEffect(() => {
    setRenderedCount(Math.min(ARTICLE_BODY_INITIAL, total));
  }, [blocks, total]);

  useEffect(() => {
    if (renderedCount >= total) return;
    let raf: number | null = null;
    const tick = () => {
      setRenderedCount((c) => Math.min(c + ARTICLE_BODY_CHUNK, total));
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [renderedCount, total]);

  if (total > 0) {
    const bodyState: BodyBlockState = { firstParagraphRendered: false };
    const visible = renderedCount >= total ? blocks : blocks.slice(0, renderedCount);
    return <>{visible.map((b, i) => renderBodyBlock(b, i, bodyState))}</>;
  }
  if (excerpt) {
    return <Text style={styles.firstParagraph}>{renderEditorialLead(excerpt)}</Text>;
  }
  return null;
});

// ─────────────────────────────────────────────────────────────────────────────
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
    // AUDIT FIX P5.18: pass the abort signal through so RQ can cancel an
    // in-flight request on unmount / refetch.
    queryFn: ({ signal }) => fetchPostBySlug(slug, signal),
    // AUDIT FIX P5.20: staleTime raised from 10 min to 30 min so revisiting
    // an article (or coming back via prefetch) skips the network round-trip
    // for half an hour instead of ten minutes — better offline-first UX.
    staleTime: 30 * 60 * 1000,
    // PROFILING FIX (round 2): React 19 dev StrictMode mounts effects twice;
    // combined with the prefetchQuery already running on tap, this could
    // trigger a duplicate Sanity fetch for the same slug (~1.2 s wasted on
    // article open). `refetchOnMount: false` makes the screen rely on the
    // cache (which the prefetch has already filled or is filling), and the
    // shared in-flight promise dedupe is still in effect for the first miss.
    refetchOnMount: false,
  });

  const categoriesKey = postQuery.data?.categories?.join('|') ?? '';
  const relatedQuery = useQuery({
    queryKey: ['related-posts', slug, categoriesKey],
    enabled: Boolean(postQuery.data && slug),
    queryFn: ({ signal }) => fetchRelatedPosts(slug, postQuery.data?.categories, signal),
  });

  // AUDIT FIX P1.2: lazy-load Merriweather on mount. Until it resolves we
  // render the body anyway — the system serif fallback is acceptable.
  const [serifReady, setSerifReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadMerriweather().then(() => {
      if (!cancelled) setSerifReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // AUDIT FIX P2.8: defer body rendering until after the navigation
  // animation completes. Without this, ~50 portable-text blocks parse and
  // mount during the slide animation, dropping 1–3 frames.
  const [bodyReady, setBodyReady] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setBodyReady(true);
    });
    return () => handle.cancel();
  }, []);

  const navBarHeight = insets.top + ARTICLE_NAV_H;

  // ── Reading progress (UI thread via Reanimated) ──────────────────────────
  const scrollY = useSharedValue(0);
  const contentH = useSharedValue(1);
  const layoutH = useSharedValue(1);
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    contentH.value = e.contentSize.height;
    layoutH.value = e.layoutMeasurement.height;
  });
  const progressBarStyle = useAnimatedStyle(() => {
    const max = Math.max(1, contentH.value - layoutH.value);
    const pct = Math.min(1, Math.max(0, scrollY.value / max));
    return { width: `${pct * 100}%` };
  });
  // Nav is always white — no scroll-driven fade.

  // ── Share & navigation ──────────────────────────────────────────────────
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
  const onShareNative = useCallback(async () => {
    const post = postQuery.data; if (!post) return;
    const articleUrl = Linking.createURL(`/news/${post.slug}`);
    await Share.share({ title: post.title, message: `${post.title}\n${articleUrl}`, url: articleUrl });
  }, [postQuery.data]);
  const onOpenRelatedPost = useCallback(
    (nextPost: Post) => {
      router.push({ pathname: '/news/[slug]' as never, params: { slug: nextPost.slug } as never });
    },
    [router],
  );

  const articleBody = useMemo(() => postQuery.data?.body ?? [], [postQuery.data?.body]);
  const relatedPosts = useMemo(() => relatedQuery.data ?? [], [relatedQuery.data]);
  const post = postQuery.data;
  const heroImageUri = useMemo(
    () => buildSanityImageUrl(post?.mainImageUrl, sanityImageWidths.articleHero),
    [post?.mainImageUrl],
  );
  const heroCategory = useMemo(
    () => (post?.categories?.[0] ?? 'Lajme').trim(),
    [post?.categories],
  );
  const isBreaking = useMemo(
    () => Boolean(post?.breaking) || /^lajm i fundit$/i.test(heroCategory),
    [post?.breaking, heroCategory],
  );
  const pubDate = useMemo(() => formatPubDate(post?.publishedAt), [post?.publishedAt]);
  const readMinutes = useMemo(() => {
    const w = countWords(articleBody);
    if (w === 0) return 0;
    return Math.max(1, Math.round(w / WPM));
  }, [articleBody]);

  // Cleanup pending "link copied" timer on unmount
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  // ── Back navigation ─────────────────────────────────────────────────────
  // BUGFIX: router.canGoBack() returns true even when the only back entry
  // is the root Stack's (tabs) screen (i.e. the article was opened via
  // router.push from the Home tab, which pushes to the root Stack rather
  // than into the news nested Stack). In that case router.back() goes to the
  // Home tab instead of the news listing.
  //
  // Fix: inspect the actual previous route name. If it's '(tabs)' we are
  // the root of the root Stack — navigate to the news index explicitly.
  // Otherwise (prev is 'index' = normal flow, or '[slug]' = related post
  // chain) it's safe to router.back() within the current Stack.
  const navRef = useNavigation();
  const onBack = useCallback(() => {
    const state = navRef.getState();
    const prevName =
      state && state.index > 0
        ? (state.routes as Array<{ name: string }>)[state.index - 1]?.name
        : undefined;
    if (prevName && prevName !== '(tabs)') {
      router.back();
    } else {
      router.navigate('/(tabs)/news' as never);
    }
  }, [router, navRef]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  // ── Sticky nav bar (translucent → solid on scroll) ───────────────────────
  const articleNav = (
    <View
      pointerEvents="box-none"
      style={[styles.articleNav, { paddingTop: insets.top + 8, height: navBarHeight }]}
    >
      <Animated.View
        pointerEvents="none"
        style={styles.articleNavSolid}
      />
      <View style={styles.articleNavRow}>
        <View style={styles.articleNavSlot}>
          <Pressable onPress={onBack} hitSlop={12}>
            <View style={styles.articleNavButton}>
              <Ionicons name="chevron-back" size={20} color={INK} />
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
      {/* Reading progress bar — sits flush at the very bottom of the nav */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progressBarStyle]} />
      </View>
    </View>
  );

  // ── Loading ─────────────────────────────────────────────────────────────
  if (postQuery.isLoading) {
    return (
      <View style={styles.screen}>
        {articleNav}
        <View style={[styles.loadingWrap, { paddingTop: navBarHeight + 16 }]}>
          <SkeletonCard height={vs(280)} style={{ borderRadius: 0 }} />
          <View style={styles.loadingHeader}>
            <SkeletonCard height={14} style={styles.loadingBlock} />
            <SkeletonCard height={28} style={styles.loadingBlock} />
            <SkeletonCard height={28} style={styles.loadingBlock} />
            <SkeletonCard height={14} style={styles.loadingBlock} />
          </View>
          <View style={styles.loadingHeader}>
            <SkeletonCard height={18} style={styles.loadingBlock} />
            <SkeletonCard height={18} style={styles.loadingBlock} />
            <SkeletonCard height={18} style={styles.loadingBlock} />
          </View>
        </View>
      </View>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────────
  if (!post) {
    return (
      <View style={styles.screen}>
        {articleNav}
        <View style={[styles.emptyStateWrap, { paddingTop: navBarHeight + 12, paddingBottom: insets.bottom + spacing.xl }]}>
          <Ionicons name="document-outline" size={52} color={RULE} />
          <Text style={styles.emptyStateTitle}>Artikulli nuk u gjet</Text>
          <Text style={styles.emptyStateSubtitle}>Provo përsëri pas pak ose kthehu te lista e lajmeve.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {articleNav}

      <Animated.ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: navBarHeight, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── Hero ────────────────────────────────────────────────────── */}
        <View style={styles.heroContainer}>
          <Image
            source={heroImageUri ? { uri: heroImageUri } : undefined}
            placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
            contentFit="cover"
            transition={0}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Subtle bottom fade to paper colour so the image transitions
              gracefully into the article header section. */}
          <LinearGradient
            colors={['transparent', 'transparent', 'rgba(251,249,244,0.0)', PAPER]}
            locations={[0, 0.55, 0.85, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* ── Article header (paper section) ──────────────────────────── */}
        <View style={styles.headerSection}>
          <View style={styles.eyebrowRow}>
            {isBreaking ? (
              <View style={styles.breakingChip}>
                <View style={styles.breakingDot} />
                <Text style={styles.breakingText}>LAJM I FUNDIT</Text>
              </View>
            ) : (
              <Text style={styles.eyebrowCategory}>{heroCategory.toUpperCase()}</Text>
            )}
          </View>

          <Text style={styles.headline}>{post.title}</Text>

          {post.excerpt ? (
            <Text style={styles.excerpt}>{post.excerpt}</Text>
          ) : null}

          <View style={styles.bylineRule} />
          <View style={styles.bylineRow}>
            <View style={styles.bylineMain}>
              <Text style={styles.bylineLabel}>NGA</Text>
              <Text style={styles.bylineAuthor}>
                {(post.author ?? 'Redaksia Fontana').toUpperCase()}
              </Text>
            </View>
            <View style={styles.bylineMeta}>
              {pubDate ? <Text style={styles.bylineMetaText}>{pubDate}</Text> : null}
              {pubDate && readMinutes > 0 ? <View style={styles.bylineDot} /> : null}
              {readMinutes > 0 ? (
                <Text style={styles.bylineMetaText}>{readMinutes} min lexim</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Body (white reading surface) ────────────────────────────── */}
        <View style={styles.bodySection}>
          <View style={styles.bodyColumn}>
            {/* AUDIT FIX P2.8: defer body until after nav animation. */}
            {bodyReady ? (
              <ArticleBody blocks={articleBody} excerpt={post.excerpt} />
            ) : post.excerpt ? (
              <Text style={styles.firstParagraph}>{renderEditorialLead(post.excerpt)}</Text>
            ) : null}

            {/* End-of-article ornament */}
            <View style={styles.endOrnament}>
              <View style={styles.endRule} />
              <Text style={styles.endDiamond}>◆</Text>
              <View style={styles.endRule} />
            </View>

            {/* ── Share strip ───────────────────────────────────────── */}
            <View style={styles.shareStrip}>
              <Text style={styles.shareStripLabel}>Më pëlqeu? Ndaje me të tjerët.</Text>
              <View style={styles.shareIconRow}>
                <ShareIcon
                  icon="logo-facebook"
                  bg="#1877F2"
                  iconColor="#FFFFFF"
                  onPress={onShareFacebook}
                  ariaLabel="Facebook"
                />
                <ShareIcon
                  icon="logo-whatsapp"
                  bg="#25D366"
                  iconColor="#FFFFFF"
                  onPress={onShareWhatsApp}
                  ariaLabel="WhatsApp"
                />
                <ShareIcon
                  icon={linkCopied ? 'checkmark' : 'link-outline'}
                  bg={linkCopied ? '#FFEAEA' : '#F4F1EB'}
                  iconColor={linkCopied ? ACCENT : INK}
                  onPress={onCopyLink}
                  ariaLabel={linkCopied ? 'Kopjuar' : 'Kopjo linkun'}
                  border
                />
                <ShareIcon
                  icon="share-social-outline"
                  bg="#F4F1EB"
                  iconColor={INK}
                  onPress={onShareNative}
                  ariaLabel="Ndaj"
                  border
                />
              </View>
            </View>
          </View>
        </View>

        {/* ── Related posts (editorial list) ───────────────────────────── */}
        {relatedPosts.length > 0 ? (
          <View style={styles.relatedSection}>
            <View style={styles.relatedHeaderWrap}>
              <Text style={styles.relatedKicker}>VAZHDO TË LEXOSH</Text>
              <Text style={styles.relatedHeadline}>Artikuj të ngjashëm</Text>
              <View style={styles.relatedHeaderRule} />
            </View>
            {relatedPosts.slice(0, 6).map((item, i) => (
              <RelatedItem
                key={item._id}
                post={item}
                index={i}
                isLast={i === Math.min(relatedPosts.length, 6) - 1}
                onPress={onOpenRelatedPost}
              />
            ))}
          </View>
        ) : null}

        {/* ── Footer credit ───────────────────────────────────────────── */}
        <View style={styles.footerCredit}>
          <Text style={styles.footerCreditText}>RADIO FONTANA · 98.8 FM</Text>
          <Text style={styles.footerCreditSub}>Lajmi i besueshëm i Istogut që nga viti 1999</Text>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function ShareIcon({
  icon,
  bg,
  iconColor,
  onPress,
  ariaLabel,
  border,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  iconColor: string;
  onPress: () => void;
  ariaLabel: string;
  border?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={ariaLabel}
      hitSlop={6}
      style={({ pressed }) => [
        styles.shareIcon,
        { backgroundColor: bg },
        border && styles.shareIconBordered,
        pressed && { transform: [{ scale: 0.94 }], opacity: 0.85 },
      ]}
    >
      <Ionicons name={icon} size={20} color={iconColor} />
    </Pressable>
  );
}

const RelatedItem = memo(function RelatedItem({
  post,
  isLast,
  onPress,
}: {
  post: Post;
  index: number;
  isLast: boolean;
  onPress: (post: Post) => void;
}) {
  const thumbUri = buildSanityImageUrl(post.mainImageUrl, sanityImageWidths.articleRelated);
  const cat = (post.categories?.[0] ?? 'Lajme').trim().toUpperCase();
  const handlePress = useCallback(() => onPress(post), [onPress, post]);
  return (
    <View style={styles.relatedCardWrap}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.relatedCard, pressed && { opacity: 0.75 }]}
      >
        {/* Clean image — no overlay */}
        <View style={styles.relatedCardImg}>
          <Image
            source={thumbUri ? { uri: thumbUri } : undefined}
            placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
            contentFit="cover"
            transition={0}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
        {/* White body */}
        <View style={styles.relatedCardBody}>
          <View style={styles.relatedCardBadgeRow}>
            <View style={styles.relatedCardCatBadge}>
              <Text style={styles.relatedCardCatText}>{cat}</Text>
            </View>
          </View>
          <Text numberOfLines={2} style={styles.relatedCardTitle}>
            {post.title}
          </Text>
          {post.publishedAt ? (
            <Text style={styles.relatedCardMeta}>{formatPubDate(post.publishedAt)}</Text>
          ) : null}
        </View>
      </Pressable>
      {!isLast ? <View style={styles.relatedSep} /> : null}
    </View>
  );
});

// ── StyleSheet ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // ── Sticky nav ─────────────────────────────────────────────────────────
  articleNav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  articleNavSolid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RULE,
  },
  articleNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  articleNavSlot: {
    width: s(44),
    alignItems: 'center',
  },
  articleNavCenter: {
    alignItems: 'center',
  },
  articleNavLogo: {
    width: s(36),
    height: s(36),
    borderRadius: s(8),
  },
  articleNavButton: {
    width: s(38),
    height: s(38),
    borderRadius: s(19),
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RULE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Reading progress bar (under nav) ───────────────────────────────────
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(220, 38, 38, 0.10)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: ACCENT,
  },

  // ── Scroll content ─────────────────────────────────────────────────────
  scrollContent: {
    paddingTop: 0,
  },

  // ── Hero ───────────────────────────────────────────────────────────────
  heroContainer: {
    height: HERO_H,
    backgroundColor: '#0B0B0B',
    overflow: 'hidden',
  },

  // ── Article header (warm paper) ────────────────────────────────────────
  headerSection: {
    backgroundColor: PAPER,
    paddingHorizontal: BODY_PADDING_H,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  eyebrowCategory: {
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: 2.4,
    color: ACCENT,
  },
  breakingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: ACCENT,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  breakingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  breakingText: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: '#FFFFFF',
  },
  headline: {
    fontFamily: fonts.articleBold, // AUDIT FIX P6.22: Black weight no longer loaded
    color: INK,
    fontSize: ms(30),
    lineHeight: ms(38),
    letterSpacing: -0.6,
    marginBottom: 14,
  },
  excerpt: {
    fontFamily: fonts.articleItalic,
    color: INK_SOFT,
    fontSize: ms(17),
    lineHeight: ms(27),
    marginBottom: 18,
  },
  bylineRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: RULE,
    marginVertical: 6,
  },
  bylineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    flexWrap: 'wrap',
    gap: 6,
  },
  bylineMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  bylineLabel: {
    fontFamily: fonts.uiRegular,
    fontSize: 10,
    letterSpacing: 2,
    color: INK_FAINT,
  },
  bylineAuthor: {
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: INK,
    flexShrink: 1,
  },
  bylineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bylineDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: INK_FAINT,
  },
  bylineMetaText: {
    fontFamily: fonts.uiRegular,
    fontSize: 11,
    letterSpacing: 0.6,
    color: INK_FAINT,
  },

  // ── Body section (white) ───────────────────────────────────────────────
  bodySection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: BODY_PADDING_H,
    paddingTop: spacing.xl + 4,
    paddingBottom: spacing.xl,
  },
  bodyColumn: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  firstParagraph: {
    fontFamily: fonts.articleRegular,
    color: INK,
    fontSize: ms(18),
    lineHeight: ms(31),
    marginBottom: 18,
  },
  paragraph: {
    fontFamily: fonts.articleRegular,
    color: INK,
    fontSize: ms(17),
    lineHeight: ms(30),
    marginBottom: 18,
  },
  leadIn: {
    fontFamily: fonts.uiBold,
    fontSize: ms(13),
    letterSpacing: 1.6,
    color: INK,
  },
  leadDash: {
    fontFamily: fonts.articleRegular,
    color: INK_SOFT,
    fontSize: ms(17),
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
    marginTop: ms(12),
  },
  bulletText: {
    flex: 1,
    fontFamily: fonts.articleRegular,
    color: INK,
    fontSize: ms(17),
    lineHeight: ms(28),
  },

  // ── Headings ───────────────────────────────────────────────────────────
  h2Wrap: {
    marginTop: 12,
    marginBottom: 12,
  },
  h2Rule: {
    width: 48,
    height: 2,
    backgroundColor: ACCENT,
    marginBottom: 12,
  },
  h2: {
    fontFamily: fonts.articleBold,
    color: INK,
    fontSize: ms(22),
    lineHeight: ms(30),
    letterSpacing: -0.2,
  },
  h3: {
    fontFamily: fonts.uiBold,
    color: INK,
    fontSize: 12,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 6,
  },

  // ── Pull quote ─────────────────────────────────────────────────────────
  pullQuote: {
    marginVertical: 18,
    paddingLeft: 18,
    borderLeftWidth: 3,
    borderLeftColor: ACCENT,
  },
  pullQuoteMark: {
    fontFamily: fonts.articleBold, // AUDIT FIX P6.22: Black weight no longer loaded
    color: ACCENT,
    fontSize: 36,
    lineHeight: 36,
    marginBottom: -6,
  },
  pullQuoteText: {
    fontFamily: fonts.articleItalic,
    color: INK,
    fontSize: ms(20),
    lineHeight: ms(30),
  },

  // ── Inline image (full-bleed) ──────────────────────────────────────────
  inlineImageWrap: {
    marginVertical: 18,
    marginHorizontal: -BODY_PADDING_H,
  },
  inlineImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: colors.surfaceSubtle,
  },
  inlineImageCaption: {
    paddingHorizontal: BODY_PADDING_H,
    paddingTop: 8,
    fontFamily: fonts.articleItalic,
    fontSize: 13,
    lineHeight: 19,
    color: INK_SOFT,
  },
  captionDash: {
    color: ACCENT,
    fontFamily: fonts.articleBold,
  },

  // ── End ornament ───────────────────────────────────────────────────────
  endOrnament: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 28,
    gap: 14,
  },
  endRule: {
    flex: 1,
    maxWidth: 48,
    height: StyleSheet.hairlineWidth,
    backgroundColor: RULE,
  },
  endDiamond: {
    fontFamily: fonts.articleRegular,
    color: ACCENT,
    fontSize: 13,
    letterSpacing: 4,
  },

  // ── Share strip ────────────────────────────────────────────────────────
  shareStrip: {
    alignItems: 'center',
    paddingVertical: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: RULE,
  },
  shareStripLabel: {
    fontFamily: fonts.articleItalic,
    color: INK_SOFT,
    fontSize: 14,
    marginBottom: 16,
  },
  shareIconRow: {
    flexDirection: 'row',
    gap: 14,
  },
  shareIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareIconBordered: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RULE,
  },

  // ── Related ───────────────────────────────────────────────────────────
  relatedSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: BODY_PADDING_H,
    paddingTop: 32,
    paddingBottom: 8,
  },
  relatedHeaderWrap: {
    marginBottom: 8,
  },
  relatedKicker: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2.4,
    color: ACCENT,
    marginBottom: 6,
  },
  relatedHeadline: {
    fontFamily: fonts.articleBold,
    color: INK,
    fontSize: ms(22),
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  relatedHeaderRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: RULE,
    marginBottom: 4,
  },
  relatedCardWrap: {
    marginBottom: 14,
  },
  relatedCard: {
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  relatedCardImg: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surfaceSubtle,
  },
  relatedCardBody: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 6,
  },
  relatedCardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  relatedCardCatBadge: {
    backgroundColor: '#FFF1F2',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  relatedCardCatText: {
    color: '#DC2626',
    fontFamily: fonts.uiBold,
    fontSize: 8.5,
    letterSpacing: 1.4,
  },
  relatedCardTitle: {
    fontFamily: fonts.articleBold,
    color: INK,
    fontSize: ms(15),
    lineHeight: ms(21),
    letterSpacing: -0.1,
  },
  relatedCardMeta: {
    fontFamily: fonts.uiRegular,
    fontSize: 11,
    color: INK_FAINT,
  },
  relatedSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: RULE,
    marginBottom: 14,
  },

  // ── Footer credit ─────────────────────────────────────────────────────
  footerCredit: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 16,
    paddingHorizontal: BODY_PADDING_H,
  },
  footerCreditText: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2.6,
    color: INK,
    marginBottom: 4,
  },
  footerCreditSub: {
    fontFamily: fonts.articleItalic,
    fontSize: 12,
    color: INK_FAINT,
    textAlign: 'center',
  },

  // ── Loading + empty ───────────────────────────────────────────────────
  loadingWrap: {
    flex: 1,
    paddingHorizontal: 0,
    gap: 0,
  },
  loadingHeader: {
    paddingHorizontal: BODY_PADDING_H,
    paddingTop: spacing.lg,
    gap: 12,
  },
  loadingBlock: {
    borderRadius: 4,
  },
  emptyStateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyStateTitle: {
    color: INK,
    fontFamily: fonts.articleBold,
    fontSize: 22,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    color: INK_FAINT,
    fontFamily: fonts.articleRegular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
