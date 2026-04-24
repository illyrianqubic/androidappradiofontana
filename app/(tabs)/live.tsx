import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { EqualizerBars } from '../../components/EqualizerBars';
import { LiveBadge } from '../../components/LiveBadge';
import { SkeletonCard } from '../../components/SkeletonCard';
import { StickyTopBar } from '../../components/StickyTopBar';
import { DAYS, schedule } from '../../constants/schedule';
import { appIdentity, colors, fonts, radius, spacing } from '../../design-tokens';
import { useAudio } from '../../services/audio';
import { fetchLiveStream } from '../../services/api';

type ProgramItem = {
  time: string;
  title: string;
  host?: string;
};

export default function LiveScreen() {
  const insets = useSafeAreaInsets();
  const { isPlaying, isReconnecting, toggle } = useAudio();
  const liveQuery = useQuery({ queryKey: ['live-stream'], queryFn: fetchLiveStream });
  const topInsetOffset = insets.top + 84;
  const bottomInsetOffset = insets.bottom + 196;

  const todaysSchedule = useMemo(() => {
    const dayIndex = new Date().getDay();
    const dayKey = [
      'E Diel',
      'E Hënë',
      'E Martë',
      'E Mërkurë',
      'E Enjte',
      'E Premte',
      'E Shtunë',
    ][dayIndex] as (typeof DAYS)[number];

    return {
      label: dayKey,
      data: (schedule[dayKey] ?? []) as ProgramItem[],
    };
  }, []);

  const liveData = liveQuery.data;
  const programData = useMemo(() => todaysSchedule.data, [todaysSchedule.data]);

  const renderProgramItem = useCallback(
    ({ item }: ListRenderItemInfo<ProgramItem>) => (
      <View style={styles.programRow}>
        <Text style={styles.programTime}>{item.time}</Text>
        <View style={styles.programTextWrap}>
          <Text style={styles.programTitle}>{item.title}</Text>
          {item.host ? <Text style={styles.programHost}>{item.host}</Text> : null}
        </View>
      </View>
    ),
    [],
  );

  const listHeader = useMemo(
    () => (
      <View>
        <View style={styles.heroSection}>
          <Image source={appIdentity.logo} contentFit="cover" style={styles.logo} />
          <EqualizerBars bars={5} playing={isPlaying} variant="full" />

          <Text style={styles.stationTitle}>Radio Fontana 98.8 FM</Text>
          <Text style={styles.stationSubtitle}>Istog, Kosovë</Text>

          <Pressable
            onPress={toggle}
            style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
          >
            <Text style={styles.playButtonIcon}>{isPlaying ? 'II' : '▶'}</Text>
          </Pressable>

          {isPlaying ? (
            <View style={styles.liveBadgeRow}>
              <LiveBadge withDot variant="solid" />
            </View>
          ) : null}
        </View>

        {isReconnecting ? <SkeletonCard height={74} style={{ marginBottom: spacing.md }} /> : null}

        {liveData?.isLive && liveData.facebookUrl ? (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Facebook Live</Text>
            <View style={styles.embedCard}>
              <WebView source={{ uri: liveData.facebookUrl }} style={styles.webView} />
            </View>
          </View>
        ) : null}

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Orari i emisioneve</Text>
          <Text style={styles.sectionSubtitle}>{todaysSchedule.label}</Text>
        </View>
      </View>
    ),
    [isPlaying, isReconnecting, liveData?.facebookUrl, liveData?.isLive, todaysSchedule.label, toggle],
  );

  if (liveQuery.isLoading && !liveData) {
    return (
      <View style={styles.screen}>
        <StickyTopBar title="Drejtpërdrejt" subtitle="Transmetimi live" topInset={insets.top} />
        <FlashList
          data={[1, 2, 3, 4]}
          keyExtractor={(item) => String(item)}
          contentContainerStyle={[
            styles.content,
            { paddingTop: topInsetOffset, paddingBottom: bottomInsetOffset },
          ]}
          renderItem={() => <SkeletonCard height={120} />}
          ListHeaderComponent={
            <View style={styles.heroSection}>
              <Image source={appIdentity.logo} contentFit="cover" style={styles.logo} />
              <SkeletonCard height={40} style={{ width: 220 }} />
            </View>
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StickyTopBar title="Drejtpërdrejt" subtitle="Transmetimi live" topInset={insets.top} />
      <FlashList
        data={programData}
        keyExtractor={(item) => `${item.time}-${item.title}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInsetOffset, paddingBottom: bottomInsetOffset },
        ]}
        renderItem={renderProgramItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<SkeletonCard height={300} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  heroSection: {
    alignItems: 'center',
    gap: spacing.md,
  },
  logo: {
    width: 200,
    height: 200,
    borderRadius: 20,
    backgroundColor: colors.surfaceSubtle,
  },
  stationTitle: {
    marginTop: spacing.sm,
    fontFamily: fonts.uiBold,
    fontSize: 33,
    lineHeight: 38,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  stationSubtitle: {
    marginTop: -2,
    fontFamily: fonts.uiRegular,
    fontSize: 15,
    color: colors.textMuted,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  playButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  playButtonIcon: {
    color: colors.surface,
    fontFamily: fonts.uiBold,
    fontSize: 25,
    lineHeight: 25,
    marginLeft: 2,
  },
  liveBadgeRow: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  sectionBlock: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.uiBold,
    color: colors.text,
    fontSize: 22,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    marginTop: 2,
    marginBottom: spacing.sm,
    fontFamily: fonts.uiRegular,
    color: colors.textMuted,
    fontSize: 14,
  },
  embedCard: {
    height: 240,
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  webView: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
  },
  programRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  programTime: {
    width: 55,
    fontFamily: fonts.uiBold,
    color: colors.text,
    fontSize: 13,
  },
  programTextWrap: {
    flex: 1,
  },
  programTitle: {
    fontFamily: fonts.uiMedium,
    color: colors.text,
    fontSize: 14,
  },
  programHost: {
    marginTop: 2,
    fontFamily: fonts.uiRegular,
    color: colors.textMuted,
    fontSize: 12,
  },
});
