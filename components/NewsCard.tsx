import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { buildSanityImageUrl, defaultThumbhash, type Post } from '../services/api';
import { colors, fonts } from '../design-tokens';
import { s } from '../lib/responsive';
import { RelativeTime } from './RelativeTime';

type NewsCardProps = {
  post: Post;
  compact?: boolean;
  onPress?: (post: Post) => void;
};

function NewsCardComponent({ post, compact = false, onPress }: NewsCardProps) {
  const cat = post.categories?.[0] ?? 'Lajme';

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
            {post.breaking ? <View style={S.compactLiveDot} /> : null}
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

  // ── STANDARD — full-width editorial card ─────────────────────────────────
  return (
    <Animated.View style={[S.outer, animStyle]}>
      <Pressable
        onPress={onCardPress}
        onPressIn={() => { scale.value = withSpring(0.975, { damping: 22, stiffness: 440 }); }}
        onPressOut={() => { scale.value = withSpring(1,     { damping: 20, stiffness: 300 }); }}
        style={S.inner}
      >
        {/* ── Image ─────────────────────────────────────────── */}
        <View style={S.imageZone}>
          <Image
            source={imageUri ? { uri: imageUri } : undefined}
            placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
            contentFit="cover"
            transition={0}
            style={S.image}
          />
          {post.breaking ? (
            <View style={S.liveBadge}>
              <View style={S.liveDot} />
              <Text style={S.liveText}>LIVE</Text>
            </View>
          ) : null}
        </View>

        {/* ── Content ───────────────────────────────────────── */}
        <View style={S.content}>
          <Text style={S.cat} numberOfLines={1}>{cat.toUpperCase()}</Text>
          <Text numberOfLines={3} style={S.title}>{post.title}</Text>
          {post.excerpt ? (
            <Text numberOfLines={2} style={S.excerpt}>{post.excerpt}</Text>
          ) : null}
          <View style={S.byline}>
            <Text numberOfLines={1} style={S.author}>{post.author ?? 'Redaksia Fontana'}</Text>
            <View style={S.bylineDot} />
            <RelativeTime timestamp={post.publishedAt} style={S.time} />
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
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
    shadowColor: colors.navy,
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  inner: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  imageZone: {
    width: '100%',
    height: s(192),
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceElevated,
  },
  liveBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 9,
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
    fontSize: 10,
    letterSpacing: 1.2,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 14,
    gap: 6,
  },
  cat: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 9.5,
    letterSpacing: 1.1,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.35,
  },
  excerpt: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    lineHeight: 19,
  },
  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 2,
  },
  author: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 12,
    flex: 1,
    flexShrink: 1,
  },
  bylineDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textTertiary,
    flexShrink: 0,
  },
  time: {
    color: colors.textTertiary,
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    flexShrink: 0,
  },

  // ── Compact card ────────────────────────────────────────────────────────────
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
    position: 'relative',
  },
  compactThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceElevated,
  },
  compactLiveDot: {
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
