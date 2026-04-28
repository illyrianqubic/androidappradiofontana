import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { SkeletonCard } from '../../components/SkeletonCard';
import { RelativeTime } from '../../components/RelativeTime';
import { colors, fonts, radius, spacing } from '../../design-tokens';
import {
  clearListeningHistory,
  getListeningHistory,
  getSavedArticles,
  storageKeys,
  subscribeToStorageKey,
  type ListeningHistoryItem,
  type SavedArticle,
} from '../../services/storage';

const LOADING_ROWS = [1, 2, 3];

export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
  const [history, setHistory] = useState<ListeningHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const topInsetOffset = insets.top + spacing.sm;
  const bottomInsetOffset = insets.bottom + 196;

  const refreshLocalData = useCallback(() => {
    setSavedArticles(getSavedArticles());
    setHistory(getListeningHistory());
    setIsLoading(false);
  }, []);

  // H16: subscribe to MMKV change events instead of re-reading on every focus.
  // Initial read on mount; thereafter only react to writes from elsewhere
  // (article save/unsave, history append, history clear).
  useEffect(() => {
    refreshLocalData();
    const unsubBookmarks = subscribeToStorageKey(storageKeys.bookmarks, () => {
      setSavedArticles(getSavedArticles());
    });
    const unsubHistory = subscribeToStorageKey(storageKeys.listeningHistory, () => {
      setHistory(getListeningHistory());
    });
    return () => {
      unsubBookmarks();
      unsubHistory();
    };
  }, [refreshLocalData]);

  const onClearHistory = useCallback(async () => {
    clearListeningHistory();
    setHistory([]);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const onOpenSavedArticle = useCallback(
    (item: SavedArticle) => {
      router.push({ pathname: '/news/[slug]' as never, params: { slug: item.slug } as never });
    },
    [router],
  );

  const renderSavedItem = useCallback(
    ({ item }: { item: SavedArticle }) => (
      <Pressable onPress={() => onOpenSavedArticle(item)} style={styles.savedCard}>
        <Text style={styles.savedCategory}>{item.category ?? 'Lajme'}</Text>
        <Text numberOfLines={2} style={styles.savedTitle}>
          {item.title}
        </Text>
        <View style={styles.savedMeta}>
          <Text style={styles.savedAuthor}>{item.author ?? 'Redaksia Fontana'}</Text>
          <RelativeTime timestamp={item.publishedAt} />
        </View>
      </Pressable>
    ),
    [onOpenSavedArticle],
  );

  const renderHistoryItem = useCallback(
    ({ item }: { item: ListeningHistoryItem }) => (
      <View style={styles.historyCard}>
        <Text numberOfLines={2} style={styles.historyTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.historyArtist}>
          {item.artist ?? 'Radio Fontana'}
        </Text>
        <RelativeTime timestamp={item.listenedAt} />
      </View>
    ),
    [],
  );

  const listHeader = useMemo(
    () => (
      <View>
        <Text style={styles.pageTitle}>Biblioteka</Text>

        <Text style={styles.sectionTitle}>Historia e dëgjimit</Text>
        {history.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.historyRail}
          >
            {history.map((item, index) =>
              renderHistoryItem({ item, index, target: 'Cell' as never } as never),
            )}
          </ScrollView>
        ) : (
          <Text style={styles.emptyText}>Nuk ka histori dëgjimi ende.</Text>
        )}

        <View style={styles.settingsCard}>
          <Text style={styles.settingsTitle}>Cilësimet</Text>

          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Njoftime për lajme të fundit</Text>
            <Text style={styles.settingsValue}>Aktive</Text>
          </View>

          <Pressable onPress={onClearHistory} style={styles.settingsAction}>
            <Text style={styles.settingsActionText}>Pastro historinë e dëgjimit</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Artikuj të ruajtur</Text>

        {!savedArticles.length ? <Text style={styles.emptyText}>Ende nuk keni ruajtur artikuj.</Text> : null}
      </View>
    ),
    [history, onClearHistory, renderHistoryItem, savedArticles.length],
  );

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <FlashList
          data={LOADING_ROWS}
          keyExtractor={(item) => String(item)}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: topInsetOffset, paddingBottom: bottomInsetOffset },
          ]}
          renderItem={() => <SkeletonCard height={160} />}
          ListHeaderComponent={
            <View>
              <SkeletonCard height={46} style={{ marginBottom: spacing.md }} />
              <SkeletonCard height={120} style={{ marginBottom: spacing.md }} />
            </View>
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlashList
        data={savedArticles}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: topInsetOffset, paddingBottom: bottomInsetOffset },
        ]}
        renderItem={renderSavedItem}
        ListHeaderComponent={listHeader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  listContent: {
    paddingHorizontal: spacing.md,
  },
  pageTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 30,
    marginBottom: spacing.md,
    letterSpacing: -0.3,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 22,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  historyRail: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  historyCard: {
    width: 230,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    marginRight: spacing.sm,
    gap: 5,
  },
  historyTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  historyArtist: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
  },
  settingsCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  settingsTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 18,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsLabel: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 14,
  },
  settingsValue: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 13,
  },
  settingsAction: {
    alignSelf: 'flex-start',
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  settingsActionText: {
    color: colors.text,
    fontFamily: fonts.uiMedium,
    fontSize: 13,
  },
  savedCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  savedCategory: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  savedTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  savedMeta: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedAuthor: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
  },
});
