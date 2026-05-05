import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing } from '../constants/tokens';
import {
  STATIC_PAGE_BOTTOM_BAR_BASE_HEIGHT,
  STATIC_PAGE_HEADER_ROW_HEIGHT,
  STATIC_PAGE_MIN_BOTTOM_SAFE_AREA,
  StaticPageBottomBar,
  StaticPageHeader,
} from '../components/ui/StaticPageChrome';

const CONTACT_ITEMS = [
  {
    label: 'Telefon',
    value: '+383 44 150 027',
    helper: 'Redaksia dhe studio',
    action: 'Telefono',
    url: 'tel:+38344150027',
  },
  {
    label: 'Telefon alternativ',
    value: '+383 44 141 294',
    helper: 'Bashkëpunime dhe reklama',
    action: 'Telefono',
    url: 'tel:+38344141294',
  },
  {
    label: 'Email',
    value: 'rtvfontana@gmail.com',
    helper: 'Lajme, njoftime dhe pyetje',
    action: 'Shkruaj',
    url: 'mailto:rtvfontana@gmail.com',
  },
  {
    label: 'Vendndodhja',
    value: 'Istog, Kosovë',
    helper: 'Shiko në hartë',
    action: 'Hartë',
    url: 'https://maps.app.goo.gl/HckE6N4qVKsWjMzy6',
  },
] as const;

const SOCIAL_ITEMS = [
  { label: 'Facebook', url: 'https://www.facebook.com/rtvfontanalive' },
  { label: 'Instagram', url: 'https://www.instagram.com/rtvfontana/' },
  { label: 'YouTube', url: 'https://www.youtube.com/@RTVFontana' },
  { label: 'TikTok', url: 'https://www.tiktok.com/@rtvfontanalive' },
] as const;

const openURL = (url: string) => Linking.openURL(url).catch(() => undefined);

export default function ContactScreen() {
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, STATIC_PAGE_MIN_BOTTOM_SAFE_AREA);
  const topBarH = insets.top + STATIC_PAGE_HEADER_ROW_HEIGHT;
  const bottomBarH = STATIC_PAGE_BOTTOM_BAR_BASE_HEIGHT + safeBottom;

  return (
    <View style={S.screen}>
      <StaticPageHeader title="Na Kontakto" topInset={insets.top} />

      <ScrollView
        contentContainerStyle={[
          S.scroll,
          {
            paddingTop: topBarH + spacing.md,
            paddingBottom: bottomBarH + spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ top: topBarH, bottom: bottomBarH }}
        showsVerticalScrollIndicator={false}
      >
        <View style={S.hero}>
          <Text style={S.heroTitle}>Kanale zyrtare për publikun.</Text>
          <Text style={S.heroSub}>
            Për lajme, reklama, bashkëpunime ose pyetje rreth radios, ekipi ynë
            mund të arrihet direkt nga kanalet zyrtare.
          </Text>
        </View>

        <View style={S.availabilityCard}>
          <View style={S.availabilityText}>
            <Text style={S.availabilityTitle}>Orari i punës</Text>
            <Text style={S.availabilitySub}>08:00 - 20:00 · E hënë - e shtunë</Text>
          </View>
          <View style={S.openBadge}>
            <Text style={S.openBadgeText}>AKTIV</Text>
          </View>
        </View>

        <View style={S.section}>
          <Text style={S.sectionKicker}>Kontakt i shpejtë</Text>
          <View style={S.contactList}>
            {CONTACT_ITEMS.map((item) => (
              <Pressable
                key={item.value}
                style={({ pressed }) => [S.contactCard, pressed && S.cardPressed]}
                onPress={() => openURL(item.url)}
              >
                <View style={S.contactBody}>
                  <Text style={S.contactLabel}>{item.label}</Text>
                  <Text style={S.contactValue}>{item.value}</Text>
                  <Text style={S.contactHelper}>{item.helper}</Text>
                </View>
                <Text style={S.contactAction}>{item.action}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={S.section}>
          <Text style={S.sectionKicker}>Na ndiqni</Text>
          <View style={S.socialGrid}>
            {SOCIAL_ITEMS.map((item) => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [S.socialButton, pressed && S.socialPressed]}
                onPress={() => openURL(item.url)}
              >
                <Text style={S.socialLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

      </ScrollView>

      <StaticPageBottomBar bottomInset={insets.bottom} />
    </View>
  );
}

const S = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },
  scroll: {
    paddingHorizontal: spacing.md,
  },
  hero: {
    borderRadius: 24,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    marginBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroRule: {
    width: 52,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    marginBottom: spacing.lg,
  },
  heroKicker: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  heroTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  heroSub: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 15,
    lineHeight: 23,
  },
  availabilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  availabilityText: {
    flex: 1,
  },
  availabilityTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 16,
  },
  availabilitySub: {
    marginTop: 3,
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  openBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.redTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.redBorder,
  },
  openBadgeText: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionKicker: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 12,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  contactList: {
    gap: spacing.sm,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  cardPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  contactBody: {
    flex: 1,
  },
  contactLabel: {
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 12,
  },
  contactValue: {
    marginTop: 2,
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 16,
    lineHeight: 21,
  },
  contactHelper: {
    marginTop: 2,
    color: colors.textTertiary,
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    lineHeight: 17,
  },
  contactAction: {
    minWidth: 66,
    textAlign: 'right',
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 13,
  },
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  socialButton: {
    minWidth: '46%',
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  socialPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  socialLabel: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 14,
  },
  copyright: {
    color: colors.textTertiary,
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
