import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullPlayer } from '../components/FullPlayer';
import { colors, fonts, radius, spacing } from '../design-tokens';

export default function PlayerModalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top + spacing.xs,
          paddingBottom: insets.bottom + spacing.sm,
        },
      ]}
    >
      <View style={styles.sheetHandle} />

      <Pressable onPress={() => router.back()} style={styles.closeButton}>
        <Text style={styles.closeLabel}>Mbyll</Text>
      </Pressable>

      <FullPlayer isExpanded />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  sheetHandle: {
    width: 46,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  closeButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeLabel: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 14,
  },
});
