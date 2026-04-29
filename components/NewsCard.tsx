import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { buildSanityImageUrl, defaultThumbhash, type Post } from '../services/api';
import { colors, fonts } from '../design-tokens';
import { RelativeTime } from './RelativeTime';

type NewsCardProps = {
  post: Post;
  compact?: boolean;
  onPress?: (post: Post) => void;
};

// Estimate reading time from excerpt (≈220 words/min). Falls back to 2 min
// when no excerpt is available so the metadata row stays visually balanced.
function estimateReadingTime(excerpt: string | null | undefined, title: string): number {
  const text = `${title ?? ''} ${excerpt ?? ''}`.trim();
  if (!text) return 2;
  const words = text.split(/\s+/).length;
  // Multiply by 4 because excerpt + title is a small fraction of the article.
  return Math.max(2, Math.ceil((words * 4) / 220));
}

// Pull the first letter of the author name for the avatar fallback.
function authorInitial(author: string | null | undefined): string {
  const name = (author ?? 'Redaksia Fontana').trim();
  return name.charAt(0).toUpperCase() || 'R';
}

function NewsCardComponent({ post, compact = false, onPress }: NewsCardProps) {
  const cat = post.categories?.[0] ?? 'Lajme';

  const imageUri = useMemo(
    () => buildSanityImageUrl(post.mainImageUrl, compact ? 480 : 900),
    [compact, post.mainImageUrl],
  );

  const readingMin = useMemo(
    () => estimateReadingTime(post.excerpt, post.title),
    [post.excerpt, post.title],
  );

  const initial = useMemo(() => authorInitial(post.author), [post.author]);

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onCardPress = useCallback(() => { onPress?.(post); }, [onPress, post]);

  if (compact) {
    // Compact horizontal thumb card (kept for future use)
    return (
      <Animated.View style={[S.compactOuter, animStyle]}>
        <Pressable
          onPress={onCardPress}
          onPressIn={() => { scale.value = withSpring(0.97, { damping: 22, stiffness: 440 }); }}
          onPressOut={() => { scale.value = withSpring(1,    { damping: 20, stiffness: 300 }); }}
          style={S.compactInner}
        >
          <View style={S.compactThumbWrap}>
            <Image
              source={imageUri ? { uri: imageUri } : undefined}
              placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
              contentFit="cover"
              transition={0}
              style={S.compactThumb}
            />
          </View>
          <View style={S.compactBody}>
            <Text style={S.compactCat} numberOfLines={1}>{cat.toUpperCase()}</Text>
            <Text numberOfLines={2} style={S.compactTitle}>{post.title}</Text>
            <RelativeTime timestamp={post.publishedAt} style={S.compactTime} />
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STANDARD — editorial-grade card. Magazine-quality typography on white.
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Animated.View style={[S.outer, animStyle]}>
      <Pressable
        onPress={onCardPress}
        onPressIn={() => { scale.value = withSpring(0.985, { damping: 24, stiffness: 460 }); }}
        onPressOut={() => { scale.value = withSpring(1,    { damping: 20, stiffness: 300 }); }}
        style={S.inner}
      >
        {/* ── Image: clean, full-bleed, no overlays ─────────────────────── */}
        <View style={S.imageZone}>
          <Image
            source={imageUri ? { uri: imageUri } : undefined}
            placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
            contentFit="cover"
            transition={0}
            style={S.image}
          />
          {/* Hairline divider between image and content for crispness */}
          <View style={S.imageDivider} />
        </View>

        {/* ── White editorial content panel ─────────────────────────────── */}
        <View style={S.content}>
          {/* Breaking — dramatic full-width pill above category */}
          {post.breaking ? (
            <View style={S.breakingRow}>
              <View style={S.breakingPulse} />
              <Text style={S.breakingText}>LAJM I FUNDIT</Text>
            </View>
          ) : null}

          {/* Category — minimal: red dot + uppercase tracked label */}
          <View style={S.kickerRow}>
            <View style={S.kickerDot} />
            <Text style={S.kicker} numberOfLines={1}>{cat.toUpperCase()}</Text>
          </View>

          {/* Headline — editorial serif (Merriweather), tight leading */}
          <Text numberOfLines={3} style={S.headline}>
            {post.title}
          </Text>

          {/* Excerpt — lighter sans, breathable */}
          {post.excerpt ? (
            <Text numberOfLines={2} style={S.deck}>{post.excerpt}</Text>
          ) : null}

          {/* Hairline rule above byline for editorial structure */}
          <View style={S.bylineRule} />

          {/* Byline — avatar + author + reading time + relative time */}
          <View style={S.byline}>
            <View style={S.avatar}>
              <Text style={S.avatarText}>{initial}</Text>
            </View>
            <View style={S.bylineCol}>
              <Text numberOfLines={1} style={S.author}>
                {post.author ?? 'Redaksia Fontana'}
              </Text>
              <View style={S.metaRow}>
                <Text style={S.metaText}>{readingMin} min lexim</Text>
                <View style={S.metaSep} />
                <RelativeTime timestamp={post.publishedAt} style={S.metaText} />
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const NewsCard = memo(NewsCardComponent);

// ─── DESIGN TOKENS (local to card) ──────────────────────────────────────────
const INK         = '#0A0F1C';   // headline ink
const INK_BODY    = '#3C4358';   // body / deck
const INK_MUTED   = '#7A8294';   // metadata
const INK_FAINT   = '#B5BAC8';   // separators
const PAPER       = '#FFFFFF';
const HAIRLINE    = '#EEF0F4';   // ultra-light divider
const ACCENT      = '#DC2626';   // brand red

const S = StyleSheet.create({
  // ── Card shell ─────────────────────────────────────────────────────────────
  outer: {
    borderRadius: 18,
    marginBottom: 18,
    backgroundColor: PAPER,
    // Two-tier shadow: soft ambient + tight contact = depth without mud
    shadowColor: '#0A0F1C',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  inner: {
    borderRadius: 18,
    overflow: 'hidden',
  },

  // ── Image zone ────────────────────────────────────────────────────────────
  imageZone: {
    width: '100%',
    aspectRatio: 16 / 10, // slightly taller than 16:9 = more cinematic
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

  // ── Content panel ──────────────────────────────────────────────────────────
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
  },

  // ── Breaking strip ─────────────────────────────────────────────────────────
  breakingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: ACCENT,
    borderRadius: 4,
    marginBottom: 10,
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
    fontSize: 9.5,
    letterSpacing: 1.6,
  },

  // ── Kicker (category) — minimal, editorial ────────────────────────────────
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 10,
  },
  kickerDot: {
    width: 5,
    height: 5,
    borderRadius: 1, // tiny square, not pill — feels intentional
    backgroundColor: ACCENT,
  },
  kicker: {
    color: ACCENT,
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2.0,
  },

  // ── Headline — editorial serif, tight leading ─────────────────────────────
  headline: {
    color: INK,
    fontFamily: fonts.articleBold, // Merriweather Bold
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.3,
  },

  // ── Deck (excerpt) — lighter, breathable ──────────────────────────────────
  deck: {
    color: INK_BODY,
    fontFamily: fonts.uiRegular,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 8,
  },

  // ── Byline structure ───────────────────────────────────────────────────────
  bylineRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: HAIRLINE,
    marginTop: 14,
    marginBottom: 12,
  },
  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: ACCENT,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    letterSpacing: -0.2,
  },
  bylineCol: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
  },
  author: {
    color: INK,
    fontFamily: fonts.uiBold,
    fontSize: 12.5,
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: INK_MUTED,
    fontFamily: fonts.uiRegular,
    fontSize: 11.5,
  },
  metaSep: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: INK_FAINT,
  },

  // ── Compact (kept for future use) ──────────────────────────────────────────
  compactOuter: {
    width: 220,
    marginRight: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    shadowColor: colors.navy,
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  compactInner: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  compactThumbWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  compactThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceElevated,
  },
  compactBody: {
    padding: 11,
    gap: 4,
  },
  compactCat: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1.1,
  },
  compactTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.15,
  },
  compactTime: {
    color: colors.textTertiary,
    fontFamily: fonts.uiRegular,
    fontSize: 11,
  },
});
