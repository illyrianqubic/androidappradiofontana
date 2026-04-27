import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { buildSanityImageUrl, defaultThumbhash, type Post } from '../services/api';
import { colors, elevation, fonts, radius, spacing } from '../design-tokens';
import { LiveBadge } from './LiveBadge';
import { RelativeTime } from './RelativeTime';

type NewsCardProps = {
  post: Post;
  compact?: boolean;
  onPress?: (post: Post) => void;
};

function NewsCardComponent({ post, compact = false, onPress }: NewsCardProps) {
  const imageUri = useMemo(
    () => buildSanityImageUrl(post.mainImageUrl, compact ? 480 : 720),
    [compact, post.mainImageUrl],
  );

  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onCardPress = useCallback(() => {
    onPress?.(post);
  }, [onPress, post]);

  return (
    <Animated.View style={[styles.cardOuter, compact && styles.compactCardOuter, animStyle]}>
      <Pressable
        onPress={onCardPress}
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 18, stiffness: 380, mass: 0.6 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 16, stiffness: 260 }); }}
        style={[styles.card, compact && styles.compactCard]}
      >
      <Image
        source={imageUri ? { uri: imageUri } : undefined}
        placeholder={{ thumbhash: post.thumbhash || defaultThumbhash }}
        transition={220}
        contentFit="cover"
        style={[styles.image, compact && styles.compactImage]}
      />

      <View style={styles.content}>
        <View style={styles.metaRow}>
          <View style={styles.categoryBadge}>
            <Text style={styles.category}>{post.categories?.[0] ?? 'Lajme'}</Text>
          </View>
          {post.breaking ? <LiveBadge label="Lajm i fundit" variant="outlined" /> : null}
        </View>

        <Text numberOfLines={compact ? 2 : 3} style={styles.title}>
          {post.title}
        </Text>

        {post.excerpt ? (
          <Text numberOfLines={2} style={styles.excerpt}>
            {post.excerpt}
          </Text>
        ) : null}

        <View style={styles.bottomRow}>
          <Text numberOfLines={1} style={styles.author}>
            {post.author ?? 'Redaksia Fontana'}
          </Text>
          <RelativeTime timestamp={post.publishedAt} />
        </View>
      </View>
      </Pressable>
    </Animated.View>
  );
}

export const NewsCard = memo(NewsCardComponent);

const styles = StyleSheet.create({
  // Outer wrapper: carries scale transform + shadow + margin
  // No overflow:hidden here so the shadow renders on Android
  cardOuter: {
    borderRadius: radius.card,
    marginBottom: spacing.md,
    ...elevation.card,
  },
  compactCardOuter: {
    width: 270,
    marginRight: spacing.sm,
    marginBottom: 0,
  },
  // Inner Pressable: clips content with overflow:hidden
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  compactCard: {
    // width and margin live on cardOuter for compact
  },
  image: {
    width: '100%',
    height: 190,
    backgroundColor: colors.surfaceSubtle,
  },
  compactImage: {
    height: 148,
  },
  content: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    overflow: 'hidden',
  },
  category: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  categoryBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.redTint,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '55%',
    flexShrink: 1,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  excerpt: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    lineHeight: 19,
    marginTop: -1,
    flexShrink: 1,
  },
  bottomRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  author: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    flex: 1,
    marginRight: spacing.sm,
    flexShrink: 1,
  },
});
