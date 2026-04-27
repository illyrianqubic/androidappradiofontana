import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { buildSanityImageUrl, defaultThumbhash, type Post } from '../services/api';
import { colors, fonts } from '../design-tokens';
import { RelativeTime } from './RelativeTime';

type NewsCardProps = {
  post: Post;
  compact?: boolean;
  onPress?: (post: Post) => void;
};

// ── Category accent palette — cycles per category name ───────────────────────
const ACCENT_PALETTE = [
  { bg: '#EEF2FF', text: '#4338CA', bar: '#6366F1' },
  { bg: '#FEF9C3', text: '#92400E', bar: '#F59E0B' },
  { bg: '#ECFDF5', text: '#065F46', bar: '#10B981' },
  { bg: '#FDF2F8', text: '#831843', bar: '#EC4899' },
  { bg: '#E0F2FE', text: '#0C4A6E', bar: '#0EA5E9' },
  { bg: '#FFF7ED', text: '#7C2D12', bar: '#F97316' },
  { bg: '#F5F3FF', text: '#4C1D95', bar: '#8B5CF6' },
] as const;

function categoryAccent(category: string | undefined) {
  const c = category ?? '';
  const sum = [...c].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return ACCENT_PALETTE[sum % ACCENT_PALETTE.length];
}

function NewsCardComponent({ post, compact = false, onPress }: NewsCardProps) {
  const cat = post.categories?.[0] ?? 'Lajme';
  const accent = useMemo(() => categoryAccent(cat), [cat]);

  const imageUri = useMemo(
    () => buildSanityImageUrl(post.mainImageUrl, compact ? 480 : 900),
    [compact, post.mainImageUrl],
  );

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onCardPress = useCallback(() => { onPress?.(post); }, [onPress, post]);

  if (compact) {
    // ── COMPACT — horizontal thumbnail card ─────────────────────────────────
    return (
      <Animated.View style={[S.compactOuter, animStyle]}>
        <Pressable
          onPress={onCardPress}
          onPressIn={() => { scale.value = withSpring(0.974, { damping: 20, stiffness: 400 }); }}
          onPressOut={() => { scale.value = withSpring(1,     { damping: 18, stiffness: 280 }); }}
          style={S.compactInner}
        >
          <View style={S.compactThumbWrap}>
            <Image
              source={imageUri ? { uri: imageUri } : undefined}
              placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
              contentFit="cover"
              transition={200}
              style={S.compactThumb}
            />
            {post.breaking ? (
              <View style={S.compactBreakingDot} />
            ) : null}
          </View>
          <View style={S.compactBody}>
            <View style={[S.compactCatBadge, { backgroundColor: accent.bg }]}>
              <Text style={[S.compactCatText, { color: accent.text }]} numberOfLines={1}>{cat}</Text>
            </View>
            <Text numberOfLines={2} style={S.compactTitle}>{post.title}</Text>
            <View style={S.compactMeta}>
              <Ionicons name="time-outline" size={11} color={colors.textMuted} />
              <RelativeTime timestamp={post.publishedAt} />
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  // ── STANDARD — full-width editorial card ─────────────────────────────────
  return (
    <Animated.View style={[S.outer, animStyle]}>
      <Pressable
        onPress={onCardPress}
        onPressIn={() => { scale.value = withSpring(0.977, { damping: 20, stiffness: 400 }); }}
        onPressOut={() => { scale.value = withSpring(1,     { damping: 18, stiffness: 280 }); }}
        style={S.inner}
      >
        {/* ── Image zone ───────────────────────────────────── */}
        <View style={S.imageZone}>
          <Image
            source={imageUri ? { uri: imageUri } : undefined}
            placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
            contentFit="cover"
            transition={220}
            style={S.image}
          />
          {/* Subtle bottom scrim for visual continuity */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.18)']}
            locations={[0.55, 1]}
            style={S.imageScrim}
          />
          {/* Category floating badge */}
          <View style={[S.catBadge, { backgroundColor: accent.bg }]}>
            <Text style={[S.catBadgeText, { color: accent.text }]} numberOfLines={1}>{cat}</Text>
          </View>
          {/* Breaking ribbon */}
          {post.breaking ? (
            <View style={S.breakingBadge}>
              <View style={S.breakingDot} />
              <Text style={S.breakingText}>LIVE</Text>
            </View>
          ) : null}
        </View>

        {/* ── Content zone ─────────────────────────────────── */}
        <View style={S.content}>
          {/* Accent bar + headline */}
          <View style={S.headlineRow}>
            <View style={[S.accentBar, { backgroundColor: accent.bar }]} />
            <Text numberOfLines={3} style={S.title}>{post.title}</Text>
          </View>

          {post.excerpt ? (
            <Text numberOfLines={2} style={S.excerpt}>{post.excerpt}</Text>
          ) : null}

          {/* Author row */}
          <View style={S.byline}>
            <View style={S.authorDot} />
            <Text numberOfLines={1} style={S.author}>{post.author ?? 'Redaksia Fontana'}</Text>
            <View style={S.bylineSep} />
            <RelativeTime timestamp={post.publishedAt} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const NewsCard = memo(NewsCardComponent);

const S = StyleSheet.create({
  // ── Standard card ──────────────────────────────────────────────────────────
  outer: {
    borderRadius: 18,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  inner: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  imageZone: {
    width: '100%',
    height: 196,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E7EB',
  },
  imageScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  catBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  catBadgeText: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    maxWidth: 120,
  },
  breakingBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  breakingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  breakingText: {
    color: '#FFFFFF',
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 8,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  accentBar: {
    width: 3,
    borderRadius: 2,
    minHeight: 20,
    marginTop: 2,
    alignSelf: 'stretch',
  },
  title: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  excerpt: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    lineHeight: 19,
    marginLeft: 13,
  },
  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 13,
  },
  authorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
  },
  author: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 12,
    flex: 1,
    flexShrink: 1,
  },
  bylineSep: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textMuted,
    opacity: 0.4,
  },

  // ── Compact card ────────────────────────────────────────────────────────────
  compactOuter: {
    width: 240,
    marginRight: 12,
    marginBottom: 0,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  compactInner: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  compactThumbWrap: {
    width: '100%',
    height: 128,
    position: 'relative',
  },
  compactThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E7EB',
  },
  compactBreakingDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  compactBody: {
    padding: 10,
    gap: 5,
  },
  compactCatBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  compactCatText: {
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    maxWidth: 110,
  },
  compactTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  compactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});

