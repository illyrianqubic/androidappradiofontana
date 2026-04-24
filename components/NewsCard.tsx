import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
    () => buildSanityImageUrl(post.mainImageUrl, compact ? 700 : 1200),
    [compact, post.mainImageUrl],
  );

  const onCardPress = useCallback(() => {
    onPress?.(post);
  }, [onPress, post]);

  return (
    <Pressable
      onPress={onCardPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.compactCard,
        pressed && styles.cardPressed,
      ]}
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
          <Text numberOfLines={compact ? 2 : 3} style={styles.excerpt}>
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
  );
}

export const NewsCard = memo(NewsCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...elevation.card,
  },
  compactCard: {
    width: 270,
    marginRight: spacing.sm,
  },
  cardPressed: {
    opacity: 0.92,
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
  },
  category: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  categoryBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.redTint,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  excerpt: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    lineHeight: 19,
    marginTop: -1,
  },
  bottomRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  author: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    flex: 1,
    marginRight: spacing.sm,
  },
});
