import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { appIdentity, colors, fonts, radius, spacing } from '../design-tokens';
import { useAudio } from '../services/audio';
import { DAYS, schedule } from '../constants/schedule';
import { EqualizerBars } from './EqualizerBars';
import { LiveBadge } from './LiveBadge';

function getTodaySchedule() {
  const now = new Date();
  const dayIndex = now.getDay();
  const lookup = [
    'E Diel',
    'E Hënë',
    'E Martë',
    'E Mërkurë',
    'E Enjte',
    'E Premte',
    'E Shtunë',
  ] as const;

  const dayName = lookup[dayIndex] ?? DAYS[0];
  return {
    dayName,
    slots: schedule[dayName] ?? schedule[DAYS[0]],
  };
}

type FullPlayerProps = {
  isExpanded?: boolean;
};

export function FullPlayer({ isExpanded = true }: FullPlayerProps) {
  const { isPlaying, isReconnecting, metadata, toggle } = useAudio();
  const [renderedTitle, setRenderedTitle] = useState(metadata.title);
  const [renderedArtist, setRenderedArtist] = useState(metadata.artist);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const titleOpacity = useSharedValue(1);

  const todaysSchedule = useMemo(() => getTodaySchedule(), []);

  useEffect(() => {
    titleOpacity.value = withTiming(0, { duration: 150 }, (finished) => {
      if (!finished) {
        return;
      }

      runOnJS(setRenderedTitle)(metadata.title);
      runOnJS(setRenderedArtist)(metadata.artist);
      titleOpacity.value = withTiming(1, { duration: 200 });
    });
  }, [metadata.artist, metadata.title, titleOpacity]);

  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick(Date.now());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const currentTime = useMemo(
    () =>
      new Intl.DateTimeFormat('sq-AL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(clockTick)),
    [clockTick],
  );

  const metadataStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
  }));

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      style={styles.container}
    >
      <View style={styles.heroBlock}>
        <Image source={appIdentity.logo} contentFit="cover" style={styles.logo} />
        <EqualizerBars bars={5} playing={isPlaying} variant="full" />

        <Text style={styles.station}>{appIdentity.stationName}</Text>
        <Text style={styles.location}>{appIdentity.location}</Text>

        {isExpanded ? <Text style={styles.clockText}>{currentTime}</Text> : null}

        <Animated.View style={[styles.metadataWrap, metadataStyle]}>
          <Text numberOfLines={1} style={styles.songTitle}>
            {isReconnecting ? 'Po lidhet...' : renderedTitle}
          </Text>
          <Text numberOfLines={1} style={styles.songArtist}>
            {renderedArtist || appIdentity.location}
          </Text>
        </Animated.View>

        <View style={styles.liveRow}>
          {isPlaying ? <LiveBadge withDot variant="solid" /> : <LiveBadge label="Offline" variant="outlined" />}
        </View>

        <Pressable
          onPress={toggle}
          style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
        >
          <Text style={styles.playIcon}>{isPlaying ? 'II' : isReconnecting ? '···' : '▶'}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Orari i emisioneve</Text>
        <Text style={styles.sectionSubtitle}>{todaysSchedule.dayName}</Text>

        <View style={styles.scheduleCard}>
          {todaysSchedule.slots.slice(0, 8).map((slot) => (
            <View key={`${slot.time}-${slot.title}`} style={styles.slotRow}>
              <Text style={styles.slotTime}>{slot.time}</Text>
              <View style={styles.slotTextWrap}>
                <Text style={styles.slotTitle}>{slot.title}</Text>
                {slot.host ? <Text style={styles.slotHost}>{slot.host}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  heroBlock: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  logo: {
    width: 200,
    height: 200,
    borderRadius: 20,
    backgroundColor: colors.surfaceSubtle,
  },
  station: {
    marginTop: spacing.sm,
    fontFamily: fonts.uiBold,
    fontSize: 28,
    lineHeight: 33,
    color: colors.text,
    textAlign: 'center',
  },
  location: {
    fontFamily: fonts.uiRegular,
    fontSize: 16,
    color: colors.textMuted,
  },
  clockText: {
    marginTop: 2,
    fontFamily: fonts.uiBold,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  metadataWrap: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  songTitle: {
    fontFamily: fonts.uiBold,
    color: colors.text,
    fontSize: 17,
    textAlign: 'center',
  },
  songArtist: {
    marginTop: 2,
    fontFamily: fonts.uiRegular,
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  liveRow: {
    alignItems: 'center',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  playButtonTransitioning: {
    opacity: 0.6,
  },
  playIcon: {
    color: colors.surface,
    fontFamily: fonts.uiBold,
    fontSize: 24,
    lineHeight: 24,
    marginLeft: 2,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontFamily: fonts.uiBold,
    color: colors.text,
    fontSize: 22,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontFamily: fonts.uiRegular,
    color: colors.textMuted,
    fontSize: 14,
  },
  scheduleCard: {
    marginTop: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
  },
  slotRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
    gap: spacing.md,
  },
  slotTime: {
    width: 56,
    fontFamily: fonts.uiBold,
    color: colors.text,
    fontSize: 13,
  },
  slotTextWrap: {
    flex: 1,
  },
  slotTitle: {
    fontFamily: fonts.uiMedium,
    color: colors.text,
    fontSize: 14,
  },
  slotHost: {
    marginTop: 1,
    fontFamily: fonts.uiRegular,
    color: colors.textMuted,
    fontSize: 12,
  },
});
