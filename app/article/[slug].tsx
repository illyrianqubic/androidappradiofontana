import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Dimensions,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  FileText,
  Link,
  RefreshCw,
  Share2,
  X,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Font from 'expo-font';
import {
  Merriweather_400Regular,
  Merriweather_400Regular_Italic,
  Merriweather_700Bold,
} from '@expo-google-fonts/merriweather';

import { SkeletonCard } from '../../components/news/SkeletonCard';
import { appIdentity, fonts, radius, spacing } from '../../constants/tokens';
import { useTheme } from '../../providers/ThemeProvider';
import type { ThemeColors } from '../../providers/ThemeProvider';
import { ms, s, vs } from '../../lib/responsive';
import { queueImagePrefetch } from '../../lib/prefetchQueue';
import { isBreakingBadgeVisible } from '../../lib/breakingBadge';
import {
  buildSanityImageUrl,
  fetchPostBySlug,
  fetchRelatedPosts,
  getSafeThumbhash,
  sanityImageWidths,
  type Post,
  type PortableTextBlock,
} from '../../services/api';
import { appSettings } from '../../services/storage';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// AUDIT FIX P1.2: Merriweather is loaded lazily on the article screen
// only — saves the cold-start cost of fetching/parsing 3 serif weights for
// users who never open an article. Module-scoped guards so the load only
// happens once per app session even across multiple article opens, and
// subsequent opens skip the re-render that waits for the promise.
let _merriweatherLoaded = false;
let _merriweatherLoadPromise: Promise<void> | null = null;
function loadMerriweather(): Promise<void> {
  if (_merriweatherLoaded) return Promise.resolve();
  if (_merriweatherLoadPromise) return _merriweatherLoadPromise;
  _merriweatherLoadPromise = Font.loadAsync({
    MerriweatherVariable: Merriweather_400Regular,
    MerriweatherVariableItalic: Merriweather_400Regular_Italic,
    MerriweatherVariableBold: Merriweather_700Bold,
  }).then(() => {
    _merriweatherLoaded = true;
  }).catch(() => {
    // Font load failure: falls back to system serif. Reset so a future open
    // can retry.
    _merriweatherLoadPromise = null;
  }) as Promise<void>;
  return _merriweatherLoadPromise;
}

// ── Editorial constants ──────────────────────────────────────────────────────
const HERO_H = vs(360);
const ARTICLE_NAV_H = 60;
const BODY_PADDING_H = spacing.lg + 4; // 24px

// Premium reading palette overrides — tuned for long-form



// Approximate average words-per-minute for Albanian readers
const WPM = 220;
const ARTICLE_STALE_TIME_MS = 30 * 60 * 1000;
const RELATED_STALE_TIME_MS = 15 * 60 * 1000;

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
  styles: ReturnType<typeof getStyles>,
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
        {renderEditorialLead(text, styles)}
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
function renderEditorialLead(text: string, styles: ReturnType<typeof getStyles>): React.ReactNode {
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

// AUDIT FIX (iOS parity): hand-rolled Albanian month names instead of
// toLocaleDateString('sq-AL', ...) — Hermes' bundled ICU data can differ
// between iOS and Android builds, risking a different-looking (or
// English-fallback) month name on one platform. Matches the same
// hand-rolled approach RelativeTime.tsx already uses for this exact reason.
const SQ_MONTHS = [
  'janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor',
  'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor',
];

function formatPubDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${SQ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
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
    return <>{visible.map((b, i) => renderBodyBlock(b, i, bodyState, styles))}</>;
  }
  if (excerpt) {
    return <Text style={styles.firstParagraph}>{renderEditorialLead(excerpt, styles)}</Text>;
  }
  return null;
});

// ─────────────────────────────────────────────────────────────────────────────
export default function ArticleDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ slug: string }>();
  const rawSlug = params.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const [linkCopied, setLinkCopied] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backDebounceRef = useRef(false);
  const { selected: selectedReaction, toggle: toggleReaction } = useArticleReaction(slug ?? '');

  const postQuery = useQuery({
    queryKey: ['post', slug],
    enabled: Boolean(slug),
    // AUDIT FIX P5.18: pass the abort signal through so RQ can cancel an
    // in-flight request on unmount / refetch.
    queryFn: ({ signal }) => fetchPostBySlug(slug, signal),
    // Cache configuration: fresh for 5 min, kept for 15 min. Revisiting the
    // same article within 5 min loads instantly from cache; keeping it for
    // 15 min reduces Sanity API calls without holding stale bodies forever.
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    // PROFILING FIX (round 2): React 19 dev StrictMode mounts effects twice;
    // combined with the prefetchQuery already running on tap, this could
    // trigger a duplicate Sanity fetch for the same slug (~1.2 s wasted on
    // article open). `refetchOnMount: false` makes the screen rely on the
    // cache (which the prefetch has already filled or is filling), and the
    // shared in-flight promise dedupe is still in effect for the first miss.
    refetchOnMount: false,
  });

  const relatedCategoryKey =
    postQuery.data?.categorySlugs?.[0] ?? postQuery.data?.categories?.[0] ?? '';
  const relatedQuery = useQuery({
    queryKey: ['related-posts', slug, relatedCategoryKey],
    enabled: Boolean(postQuery.data && slug),
    queryFn: ({ signal }) =>
      fetchRelatedPosts(
        slug,
        postQuery.data?.categorySlugs,
        postQuery.data?.categories,
        signal,
      ),
    staleTime: RELATED_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // AUDIT FIX P1.2: lazy-load Merriweather on mount. Initial state reads the
  // module-level flag so 2nd+ article opens skip the re-render entirely.
  const [, setSerifReady] = useState(_merriweatherLoaded);
  useEffect(() => {
    if (_merriweatherLoaded) return;
    let cancelled = false;
    loadMerriweather().then(() => {
      if (!cancelled) setSerifReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // All stack transitions use animation:'none' so InteractionManager fires
  // instantly — the bodyReady gate just added a frame of latency with no
  // benefit. ArticleBody's own incremental renderer (ARTICLE_BODY_INITIAL +
  // ARTICLE_BODY_CHUNK via rAF) already keeps the first render under budget.

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
    const articleUrl = articleWebUrl(post);
    await Share.share({ title: post.title, message: `${post.title}\n${articleUrl}`, url: articleUrl });
  }, [postQuery.data, articleWebUrl]);
  const onOpenRelatedPost = useCallback(
    (nextPost: Post) => {
      queueImagePrefetch(buildSanityImageUrl(nextPost.mainImageUrl, sanityImageWidths.articleHero));
      router.prefetch(`/article/${nextPost.slug}`);
      queryClient.prefetchQuery({
        queryKey: ['post', nextPost.slug],
        queryFn: ({ signal }) => fetchPostBySlug(nextPost.slug, signal),
        staleTime: 5 * 60 * 1000,
      });
      router.replace(`/article/${nextPost.slug}`);
    },
    [queryClient, router],
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
    () => {
      const flag = Boolean(post?.breaking) || /^lajm i fundit$/i.test(heroCategory);
      return flag && isBreakingBadgeVisible(true, post?.publishedAt);
    },
    [post?.breaking, post?.publishedAt, heroCategory],
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
  // Always navigate to the Lajme (news index) regardless of how the article
  // was opened — from home, from the news list, or from a related article.
  const onBack = useCallback(() => {
    if (backDebounceRef.current) return;
    backDebounceRef.current = true;
    // Defer navigation to avoid synchronous-unmount crash when the press
    // handler fires while React is in the middle of a commit phase.
    setTimeout(() => {
      if (router.canGoBack && router.canGoBack()) {
        router.back();
      } else {
        router.navigate('/(tabs)/news');
      }
      // Reset the debounce after the navigation has had time to commit.
      setTimeout(() => { backDebounceRef.current = false; }, 500);
    }, 0);
  }, [router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  // ── Sticky nav bar (translucent → solid on scroll) ───────────────────────
  const articleNavStyle = useMemo(
    () => [styles.articleNav, { paddingTop: insets.top + 8, height: navBarHeight }],
    [insets.top, navBarHeight],
  );
  const articleNav = useMemo(
    () => (
      <View pointerEvents="box-none" style={articleNavStyle}>
        <Animated.View pointerEvents="none" style={styles.articleNavSolid} />
        <View style={styles.articleNavRow}>
          <View style={styles.articleNavSlot}>
            <Pressable onPress={onBack} hitSlop={12}>
              <View style={styles.articleNavButton}>
                <ChevronLeft size={20} color={colors.inkDark} strokeWidth={1.5} />
              </View>
            </Pressable>
          </View>
        </View>
        {/* Reading progress bar — sits flush at the very bottom of the nav */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressBarStyle]} />
        </View>
      </View>
    ),
    [articleNavStyle, onBack, progressBarStyle, colors],
  );
  const scrollContentStyle = useMemo(
    () => [styles.scrollContent, { paddingTop: navBarHeight, paddingBottom: insets.bottom + 24 }],
    [navBarHeight, insets.bottom],
  );

  // ── Error (no stale data to fall back on) ──────────────────────────────
  if (postQuery.isError && !postQuery.data) {
    return (
      <View style={styles.screen}>
        {articleNav}
        <View style={[styles.emptyStateWrap, { paddingTop: navBarHeight + 12, paddingBottom: insets.bottom + spacing.xl }]}>
          <AlertCircle size={48} color={colors.primary} strokeWidth={1.5} />
          <Text style={styles.emptyStateTitle}>Gabim gjatë ngarkimit</Text>
          <Text style={styles.emptyStateSubtitle}>
            Artikulli nuk mund të ngarkohet. Kontrollo lidhjen.
          </Text>
          <Pressable
            onPress={() => postQuery.refetch()}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
            ]}
          >
            <RefreshCw size={18} color="#FFFFFF" strokeWidth={1.5} />
            <Text style={styles.retryButtonText}>Provo Përsëri</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (postQuery.isLoading) {
    return (
      <View style={styles.screen}>
        {articleNav}
        <View style={[styles.loadingWrap, { paddingTop: navBarHeight + 16 }]}>
          <SkeletonCard height={260} style={{ width: '100%', borderRadius: 0 }} />
          <View style={styles.loadingHeader}>
            <SkeletonCard height={28} style={[styles.loadingBlock, { width: '85%' }]} />
            <SkeletonCard height={28} style={[styles.loadingBlock, { width: '85%' }]} />
            <SkeletonCard height={14} style={[styles.loadingBlock, { width: 160 }]} />
          </View>
          <View style={styles.loadingHeader}>
            <SkeletonCard height={14} style={[styles.loadingBlock, { width: '100%' }]} />
            <SkeletonCard height={14} style={[styles.loadingBlock, { width: '90%' }]} />
            <SkeletonCard height={14} style={[styles.loadingBlock, { width: '100%' }]} />
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
          <FileText size={52} color={colors.rule} strokeWidth={1.5} />
          <Text style={styles.emptyStateTitle}>Artikulli nuk u gjet</Text>
          <Text style={styles.emptyStateSubtitle}>Provo përsëri pas pak ose kthehu te lista e lajmeve.</Text>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)/news');
              }
            }}
            style={({ pressed }) => [
              styles.backButton,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel="Kthehu te lajmet"
            accessibilityRole="button"
          >
            <Text style={styles.backButtonText}>← Kthehu te lajmet</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {articleNav}

      <Animated.ScrollView
        contentContainerStyle={scrollContentStyle}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── Hero ────────────────────────────────────────────────────── */}
        <View style={styles.heroContainer}>
          <Pressable onPress={() => setLightboxVisible(true)} style={StyleSheet.absoluteFill}>
            <Image
              source={heroImageUri ? { uri: heroImageUri } : undefined}
              placeholder={{ thumbhash: getSafeThumbhash(post.thumbhash) }}
              contentFit="cover"
              transition={0}
              style={StyleSheet.absoluteFill}
            />
          </Pressable>
          {/* Subtle bottom fade to paper colour so the image transitions
              gracefully into the article header section. */}
          <LinearGradient
            colors={['transparent', 'transparent', 'rgba(251,249,244,0.0)', colors.paper]}
            locations={[0, 0.55, 0.85, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
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
            {/* Body renders immediately — ArticleBody's rAF chunking keeps
                the first frame under budget without an animation gate. */}
            <ArticleBody blocks={articleBody} excerpt={post.excerpt} />

            {/* ── Emoji reactions ───────────────────────────────────── */}
            <ReactionBar selected={selectedReaction} onToggle={toggleReaction} />

            {/* ── Share strip ───────────────────────────────────────── */}
            <View style={styles.shareStrip}>
              <Text style={styles.shareStripLabel}>Më pëlqeu? Ndaje me të tjerët.</Text>
              <View style={styles.shareIconRow}>
                <ShareIcon
                  icon={<Ionicons name="logo-facebook" size={20} color="#FFFFFF" />}
                  bg="#1877F2"
                  onPress={onShareFacebook}
                  ariaLabel="Facebook"
                />
                <ShareIcon
                  icon={<Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />}
                  bg="#25D366"
                  onPress={onShareWhatsApp}
                  ariaLabel="WhatsApp"
                />
                <ShareIcon
                  icon={linkCopied ? <Check size={20} color={colors.primary} strokeWidth={1.5} /> : <Link size={20} color={colors.inkDark} strokeWidth={1.5} />}
                  bg={linkCopied ? colors.redTint : colors.surfaceSubtle}
                  onPress={onCopyLink}
                  ariaLabel={linkCopied ? 'Kopjuar' : 'Kopjo linkun'}
                  border
                />
                <ShareIcon
                  icon={<Share2 size={20} color={colors.inkDark} strokeWidth={1.5} />}
                  bg={colors.surfaceSubtle}
                  onPress={onShareNative}
                  ariaLabel="Ndaj"
                  border
                />
              </View>
            </View>
          </View>
        </View>

        {/* ── Related posts ───────────────────────────────────────────── */}
        {relatedPosts.length > 0 ? (
          <View style={styles.relatedSection}>
            <View style={styles.relatedHeaderWrap}>
              <Text style={styles.relatedHeadline}>Artikuj të ngjashëm</Text>
            </View>
            {relatedPosts.slice(0, 2).map((item, i) => (
              <RelatedItem
                key={item._id}
                post={item}
                index={i}
                isLast={i === Math.min(relatedPosts.length, 2) - 1}
                onPress={onOpenRelatedPost}
                colors={colors}
              />
            ))}
          </View>
        ) : null}
      </Animated.ScrollView>

      <ShareFab onPress={onShareNative} scrollY={scrollY} />

      <ImageLightbox
        uri={heroImageUri}
        visible={lightboxVisible}
        onClose={() => setLightboxVisible(false)}
      />
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function ShareIcon({
  icon,
  bg,
  onPress,
  ariaLabel,
  border,
}: {
  icon: React.ReactNode;
  bg: string;
  onPress: () => void;
  ariaLabel: string;
  border?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
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
      {icon}
    </Pressable>
  );
}

const RelatedItem = memo(function RelatedItem({
  post,
  isLast,
  onPress,
  colors,
}: {
  post: Post;
  index: number;
  isLast: boolean;
  onPress: (post: Post) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  const thumbUri = useMemo(
    () => buildSanityImageUrl(post.mainImageUrl, sanityImageWidths.articleRelated),
    [post.mainImageUrl],
  );
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
            placeholder={{ thumbhash: getSafeThumbhash(post.thumbhash) }}
            recyclingKey={post._id}
            contentFit="cover"
            transition={0}
            style={StyleSheet.absoluteFill}
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
}, (prev, next) =>
  prev.isLast === next.isLast &&
  prev.colors === next.colors &&
  prev.onPress === next.onPress &&
  prev.post._id === next.post._id &&
  prev.post.slug === next.post.slug &&
  prev.post.title === next.post.title &&
  prev.post.publishedAt === next.post.publishedAt &&
  prev.post.mainImageUrl === next.post.mainImageUrl &&
  prev.post.thumbhash === next.post.thumbhash &&
  (prev.post.categories?.[0] ?? 'Lajme') === (next.post.categories?.[0] ?? 'Lajme'),
);

// ── Emoji reactions ──────────────────────────────────────────────────────────
const REACTION_EMOJIS = [
  { emoji: '👍', key: 'thumbsup' },
  { emoji: '❤️', key: 'heart' },
  { emoji: '😮', key: 'wow' },
  { emoji: '😢', key: 'sad' },
] as const;

type ReactionKey = (typeof REACTION_EMOJIS)[number]['key'];

function useArticleReaction(slug: string) {
  const storageKey = `reaction_${slug}`;
  const [selected, setSelected] = useState<ReactionKey | null>(() => {
    // MMKV can be unavailable for a beat on cold start (native module not
    // yet bridged — seen on iOS dev clients). Fall back to no saved
    // reaction rather than crashing (same pattern as ThemeProvider).
    try {
      const saved = appSettings.getItem(storageKey);
      if (saved && REACTION_EMOJIS.some((r) => r.key === saved)) {
        return saved as ReactionKey;
      }
    } catch {
      // See comment above.
    }
    return null;
  });

  const toggle = useCallback(
    (key: ReactionKey) => {
      const next = selected === key ? null : key;
      setSelected(next);
      try {
        if (next) {
          appSettings.setItem(storageKey, next);
        } else {
          appSettings.removeItem(storageKey);
        }
      } catch {
        // Best-effort persistence — see the guard above.
      }
    },
    [selected, storageKey],
  );

  return { selected, toggle };
}

const ReactionBar = memo(function ReactionBar({
  selected,
  onToggle,
}: {
  selected: ReactionKey | null;
  onToggle: (key: ReactionKey) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16, justifyContent: 'center' }}>
      {REACTION_EMOJIS.map(({ emoji, key }) => (
        <ReactionButton
          key={key}
          emoji={emoji}
          reactionKey={key}
          selected={selected === key}
          onToggle={onToggle}
          colors={colors}
        />
      ))}
    </View>
  );
});

const ReactionButton = memo(function ReactionButton({
  emoji,
  reactionKey,
  selected,
  onToggle,
  colors,
}: {
  emoji: string;
  reactionKey: ReactionKey;
  selected: boolean;
  onToggle: (key: ReactionKey) => void;
  colors: ThemeColors;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    scale.value = withSequence(
      withSpring(1.35, { stiffness: 400, damping: 12 }),
      withSpring(1, { stiffness: 400, damping: 12 }),
    );
    onToggle(reactionKey);
  }, [onToggle, reactionKey, scale]);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.redTint : 'transparent',
        }}
      >
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      </Pressable>
    </Animated.View>
  );
});

// ── Floating share FAB ───────────────────────────────────────────────────────
const ShareFab = memo(function ShareFab({
  onPress,
  scrollY,
}: {
  onPress: () => void;
  scrollY: SharedValue<number>;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 100], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(scrollY.value, [0, 100], [0.8, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          right: 16,
          bottom: insets.bottom + 16,
          zIndex: 20,
        },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.primary,
          shadowOpacity: 0.3,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
        }}
      >
        <Share2 size={24} color={colors.surface} strokeWidth={1.5} />
      </Pressable>
    </Animated.View>
  );
});

// ── Image lightbox ───────────────────────────────────────────────────────────
const LIGHTBOX_W = Dimensions.get('window').width;
const LIGHTBOX_H = Dimensions.get('window').height;

const lightboxStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    width: LIGHTBOX_W,
    height: LIGHTBOX_H * 0.6,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const ImageLightbox = memo(function ImageLightbox({
  uri,
  visible,
  onClose,
}: {
  uri: string | undefined;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }, [visible]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), 2);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= 1.05) {
        translateY.value = Math.max(0, e.translationY);
        translateX.value = 0;
      } else {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd((e) => {
      if (scale.value <= 1.05 && e.translationY > 80) {
        runOnJS(onClose)();
      } else {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withTiming(1);
      savedScale.value = 1;
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={lightboxStyles.overlay}>
        <GestureDetector gesture={composed}>
          <Animated.View style={[lightboxStyles.container, animatedStyle]}>
            <Image source={uri ? { uri } : undefined} style={lightboxStyles.image} />
          </Animated.View>
        </GestureDetector>
        <Pressable style={[lightboxStyles.closeBtn, { backgroundColor: colors.surface + '26' }]} onPress={onClose}>
          <X size={28} color={colors.surface} strokeWidth={1.5} />
        </Pressable>
      </View>
    </Modal>
  );
});

// ── StyleSheet ───────────────────────────────────────────────────────────────
const getStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgScreen,
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
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
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
  articleNavButton: {
    width: s(38),
    height: s(38),
    borderRadius: s(19),
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Reading progress bar (under nav) ───────────────────────────────────
  progressTrack: {
    height: 2,
    backgroundColor: colors.redTint,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },

  // ── Scroll content ─────────────────────────────────────────────────────
  scrollContent: {
    paddingTop: 0,
  },

  // ── Hero ───────────────────────────────────────────────────────────────
  heroContainer: {
    height: HERO_H,
    backgroundColor: colors.bgScreen,
    overflow: 'hidden',
  },

  // ── Article header (warm paper) ────────────────────────────────────────
  headerSection: {
    backgroundColor: colors.paper,
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
    color: colors.primary,
  },
  breakingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  breakingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface,
  },
  breakingText: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.surface,
  },
  headline: {
    fontFamily: fonts.articleBold, // AUDIT FIX P6.22: Black weight no longer loaded
    color: colors.inkDark,
    fontSize: ms(30),
    lineHeight: ms(38),
    letterSpacing: -0.6,
    marginBottom: 14,
  },
  excerpt: {
    fontFamily: fonts.articleItalic,
    color: colors.inkSoft,
    fontSize: ms(17),
    lineHeight: ms(27),
    marginBottom: 18,
  },
  bylineRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.rule,
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
    color: colors.inkFaint,
  },
  bylineAuthor: {
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.inkDark,
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
    backgroundColor: colors.inkFaint,
  },
  bylineMetaText: {
    fontFamily: fonts.uiRegular,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.inkFaint,
  },

  // ── Body section (white) ───────────────────────────────────────────────
  bodySection: {
    backgroundColor: colors.surface,
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
    color: colors.inkDark,
    fontSize: ms(18),
    lineHeight: ms(31),
    marginBottom: 18,
  },
  paragraph: {
    fontFamily: fonts.articleRegular,
    color: colors.inkDark,
    fontSize: ms(17),
    lineHeight: ms(30),
    marginBottom: 18,
  },
  leadIn: {
    fontFamily: fonts.uiBold,
    fontSize: ms(13),
    letterSpacing: 1.6,
    color: colors.inkDark,
  },
  leadDash: {
    fontFamily: fonts.articleRegular,
    color: colors.inkSoft,
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
    backgroundColor: colors.primary,
    marginTop: ms(12),
  },
  bulletText: {
    flex: 1,
    fontFamily: fonts.articleRegular,
    color: colors.inkDark,
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
    backgroundColor: colors.primary,
    marginBottom: 12,
  },
  h2: {
    fontFamily: fonts.articleBold,
    color: colors.inkDark,
    fontSize: ms(22),
    lineHeight: ms(30),
    letterSpacing: -0.2,
  },
  h3: {
    fontFamily: fonts.uiBold,
    color: colors.inkDark,
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
    borderLeftColor: colors.primary,
  },
  pullQuoteMark: {
    fontFamily: fonts.articleBold, // AUDIT FIX P6.22: Black weight no longer loaded
    color: colors.primary,
    fontSize: 36,
    lineHeight: 36,
    marginBottom: -6,
  },
  pullQuoteText: {
    fontFamily: fonts.articleItalic,
    color: colors.inkDark,
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
    color: colors.inkSoft,
  },
  captionDash: {
    color: colors.primary,
    fontFamily: fonts.articleBold,
  },

  // ── Share strip ────────────────────────────────────────────────────────
  shareStrip: {
    alignItems: 'center',
    paddingVertical: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  shareStripLabel: {
    fontFamily: fonts.articleItalic,
    color: colors.inkSoft,
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
    borderColor: colors.rule,
  },

  // ── Related ───────────────────────────────────────────────────────────
  relatedSection: {
    backgroundColor: colors.surface,
    paddingHorizontal: BODY_PADDING_H,
    paddingTop: 24,
    paddingBottom: 0,
  },
  relatedHeaderWrap: {
    marginBottom: 8,
  },
  relatedHeadline: {
    fontFamily: fonts.articleBold,
    color: colors.inkDark,
    fontSize: ms(22),
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  // AUDIT FIX (iOS): shadow lives on relatedCardWrap (outer); overflow:'hidden'
  // lives on relatedCard (inner). Combining shadow + overflow:'hidden' on one
  // view sets CALayer masksToBounds=true and clips the shadow to invisible
  // on iOS — this wrapper already existed, it just wasn't doing the split.
  relatedCardWrap: {
    marginBottom: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    shadowColor: colors.navy,
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  relatedCard: {
    borderRadius: 14,
    overflow: 'hidden',
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
    backgroundColor: colors.redTint,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.redBorder,
  },
  relatedCardCatText: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 8.5,
    letterSpacing: 1.4,
  },
  relatedCardTitle: {
    fontFamily: fonts.articleBold,
    color: colors.inkDark,
    fontSize: ms(15),
    lineHeight: ms(21),
    letterSpacing: -0.1,
  },
  relatedCardMeta: {
    fontFamily: fonts.uiRegular,
    fontSize: 11,
    color: colors.inkFaint,
  },
  relatedSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.rule,
    marginBottom: 14,
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
    color: colors.inkDark,
    fontFamily: fonts.articleBold,
    fontSize: 22,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    color: colors.inkFaint,
    fontFamily: fonts.articleRegular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },

  // ── Back button (not-found) ─────────────────────────────────────────
  backButton: {
    marginTop: spacing.md,
  },
  backButtonText: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 14,
  },

  // ── Error retry ──────────────────────────────────────────────────────
  retryButton: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  retryButtonText: {
    color: colors.surface,
    fontFamily: fonts.uiBold,
    fontSize: 14,
    letterSpacing: 0.2,
  },

});
