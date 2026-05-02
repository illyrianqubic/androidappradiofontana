import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { buildSanityImageUrl, defaultThumbhash, sanityImageWidths, type Post } from '../../services/api';
import { colors, fonts } from '../../constants/tokens';
import { RelativeTime } from '../ui/RelativeTime';
import { isBreakingBadgeVisible } from '../../lib/breakingBadge';

type NewsCardProps = {
  post: Post;
  compact?: boolean;
  onPress?: (post: Post) => void;
};

function NewsCardComponent({ post, compact = false, onPress }: NewsCardProps) {
  const cat = post.categories?.[0] ?? 'Lajme';

  const imageUri = useMemo(
    () => buildSanityImageUrl(
      post.mainImageUrl,
      compact ? sanityImageWidths.feedThumb : sanityImageWidths.feedCard,
    ),
    [compact, post.mainImageUrl],
  );

  const onCardPress = useCallback(() => { onPress?.(post); }, [onPress, post]);

  if (compact) {
    return (
      <View style={S.cOuter}>
        <Pressable
          onPress={onCardPress}
          style={S.cInner}
        >
          <View style={S.cImgWrap}>
            <Image
              source={imageUri ? { uri: imageUri } : undefined}
              placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
              recyclingKey={post._id}
              contentFit="cover"
              transition={0}
              style={S.cImg}
            />
          </View>
          <View style={S.cBody}>
            <Text style={S.cCat} numberOfLines={1}>{cat.toUpperCase()}</Text>
            <Text numberOfLines={3} style={S.cTitle}>{post.title}</Text>
            <RelativeTime timestamp={post.publishedAt} style={S.cTime} />
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={S.outer}>
      <Pressable
        onPress={onCardPress}
        style={S.inner}
      >
        {/* Full-bleed 16:9 image — no text overlay */}
        <View style={S.imgWrap}>
          <Image
            source={imageUri ? { uri: imageUri } : undefined}
            placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
            recyclingKey={post._id}
            contentFit="cover"
            transition={0}
            style={S.img}
          />
        </View>

        {/* Content panel — always below image */}
        <View style={S.body}>
          {isBreakingBadgeVisible(post.breaking, post.publishedAt) ? (
            <View style={S.badge}>
              <Text style={S.badgeText}>LAJM I FUNDIT</Text>
            </View>
          ) : null}
          <Text style={S.cat} numberOfLines={1}>{cat.toUpperCase()}</Text>
          <Text numberOfLines={2} style={S.headline}>{post.title}</Text>
          <RelativeTime timestamp={post.publishedAt} style={S.time} />
        </View>
      </Pressable>
    </View>
  );
}

function sameVisiblePost(a: Post, b: Post): boolean {
  return (
    a._id === b._id &&
    a.slug === b.slug &&
    a.title === b.title &&
    a.excerpt === b.excerpt &&
    a.publishedAt === b.publishedAt &&
    a.breaking === b.breaking &&
    a.mainImageUrl === b.mainImageUrl &&
    a.thumbhash === b.thumbhash &&
    a.author === b.author &&
    (a.categories?.[0] ?? 'Lajme') === (b.categories?.[0] ?? 'Lajme')
  );
}

export const NewsCard = memo(
  NewsCardComponent,
  (prev, next) =>
    prev.compact === next.compact &&
    prev.onPress === next.onPress &&
    sameVisiblePost(prev.post, next.post),
);

// ─── Palette ─────────────────────────────────────────────────────────────────
const INK     = '#0F172A';
const DUST    = '#64748B';
const CRIMSON = '#DC2626';
const PAPER   = '#FFFFFF';

const S = StyleSheet.create({
  // ── Standard card ──────────────────────────────────────────────────────────
  outer: {
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: PAPER,
    shadowColor: INK,
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  inner: {
    borderRadius: 8,
    overflow: 'hidden',
  },

  imgWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#E2E8F0',
  },
  img: {
    width: '100%',
    height: '100%',
  },

  body: {
    paddingHorizontal: 11,
    paddingTop: 9,
    paddingBottom: 10,
    gap: 3,
  },

  badge: {
    alignSelf: 'flex-start',
    backgroundColor: CRIMSON,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginBottom: 1,
  },
  badgeText: {
    color: PAPER,
    fontFamily: fonts.uiBold,
    fontSize: 8.5,
    letterSpacing: 1.4,
  },

  cat: {
    color: CRIMSON,
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 2.0,
  },
  headline: {
    color: INK,
    fontFamily: fonts.uiBold,
    fontSize: 14.5,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  time: {
    color: DUST,
    fontFamily: fonts.uiRegular,
    fontSize: 9.5,
    marginTop: 1,
  },

  // ── Compact card (horizontal rail) ─────────────────────────────────────────
  cOuter: {
    width: 185,
    borderRadius: 8,
    marginRight: 9,
    backgroundColor: PAPER,
    shadowColor: INK,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cInner: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  cImgWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#E2E8F0',
  },
  cImg: {
    width: '100%',
    height: '100%',
  },
  cBody: {
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 8,
    gap: 3,
  },
  cCat: {
    color: CRIMSON,
    fontFamily: fonts.uiBold,
    fontSize: 8.5,
    letterSpacing: 1.7,
  },
  cTitle: {
    color: INK,
    fontFamily: fonts.uiBold,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.15,
  },
  cTime: {
    color: DUST,
    fontFamily: fonts.uiRegular,
    fontSize: 9.5,
    marginTop: 1,
  },

  // Legacy alias kept so callers using compactOuter-etc. don't break
  compactOuter: { width: 0, height: 0 },
});
