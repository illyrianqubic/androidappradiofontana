import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StickyTopBar } from '../components/StickyTopBar';
import { DAYS, schedule } from '../constants/schedule';
import { colors, fonts, radius, spacing } from '../design-tokens';

type ProgramRow = {
  time: string;
  title: string;
  host?: string;
};

export default function ProgramScreen() {
  const insets = useSafeAreaInsets();
  const topInsetOffset = insets.top + 86;
  const bottomInsetOffset = insets.bottom + 196;

  const weeklySchedule = useMemo(
    () =>
      DAYS.map((day) => ({
        day,
        programs: (schedule[day] ?? []) as ProgramRow[],
      })),
    [],
  );

  return (
    <View style={styles.screen}>
      <StickyTopBar title="Programi" subtitle="Orari i emisioneve" topInset={insets.top} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInsetOffset, paddingBottom: bottomInsetOffset },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {weeklySchedule.map((daySection) => (
          <View key={daySection.day} style={styles.dayCard}>
            <Text style={styles.dayTitle}>{daySection.day}</Text>

            {!daySection.programs.length ? (
              <Text style={styles.emptyText}>Nuk ka emisione të publikuara për këtë ditë.</Text>
            ) : (
              daySection.programs.map((item) => (
                <View key={`${daySection.day}-${item.time}-${item.title}`} style={styles.row}>
                  <Text style={styles.time}>{item.time}</Text>
                  <View style={styles.rowBody}>
                    <Text style={styles.programTitle}>{item.title}</Text>
                    {item.host ? <Text style={styles.host}>{item.host}</Text> : null}
                  </View>
                </View>
              ))
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: spacing.md,
  },
  dayCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  dayTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 22,
    lineHeight: 28,
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  time: {
    width: 58,
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    lineHeight: 20,
  },
  rowBody: {
    flex: 1,
  },
  programTitle: {
    color: colors.text,
    fontFamily: fonts.uiMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  host: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
  },
});
