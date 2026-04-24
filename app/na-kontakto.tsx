import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StickyTopBar } from '../components/StickyTopBar';
import { colors, fonts, radius, spacing } from '../design-tokens';

type ContactAction = {
  label: string;
  value: string;
  href: string;
};

const CONTACT_ACTIONS: ContactAction[] = [
  { label: 'Telefon', value: '+383 49 000 000', href: 'tel:+38349000000' },
  { label: 'Email', value: 'info@rtvfontana.com', href: 'mailto:info@rtvfontana.com' },
  { label: 'Facebook', value: 'facebook.com/rtvfontana', href: 'https://facebook.com' },
  { label: 'Instagram', value: '@rtvfontana', href: 'https://instagram.com' },
];

export default function ContactScreen() {
  const insets = useSafeAreaInsets();
  const topInsetOffset = insets.top + 86;
  const bottomInsetOffset = insets.bottom + 196;

  const openLink = useCallback(async (href: string) => {
    try {
      const supported = await Linking.canOpenURL(href);
      if (supported) {
        await Linking.openURL(href);
      }
    } catch {
      // Ignore link launch failures in unsupported environments.
    }
  }, []);

  return (
    <View style={styles.screen}>
      <StickyTopBar title="Na Kontakto" subtitle="Jemi gjithmonë pranë jush" topInset={insets.top} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInsetOffset, paddingBottom: bottomInsetOffset },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Kontakti i Redaksisë</Text>
          <Text style={styles.heroSubtitle}>
            Për lajme, reklama dhe bashkëpunime, na kontaktoni në kanalet më poshtë.
          </Text>
        </View>

        {CONTACT_ACTIONS.map((action) => (
          <Pressable
            key={action.label}
            onPress={() => openLink(action.href)}
            style={({ pressed }) => [styles.contactCard, pressed && styles.contactCardPressed]}
          >
            <Text style={styles.contactLabel}>{action.label}</Text>
            <Text style={styles.contactValue}>{action.value}</Text>
          </Pressable>
        ))}

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>Adresa</Text>
          <Text style={styles.footerText}>Istog, Kosovë</Text>
        </View>
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
  heroCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  heroTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  contactCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  contactCardPressed: {
    backgroundColor: colors.redTint,
    borderColor: colors.primary,
  },
  contactLabel: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 13,
  },
  contactValue: {
    marginTop: 4,
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  footerCard: {
    marginTop: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  footerTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 18,
  },
  footerText: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 14,
  },
});
