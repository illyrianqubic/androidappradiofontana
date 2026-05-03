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

const STORY_POINTS = [
  {
    index: '01',
    title: 'Lajm i verifikuar',
    text: 'Informacion i saktë, i shpejtë dhe i dobishëm për njerëzit e Istogut dhe mërgatën.',
  },
  {
    index: '02',
    title: 'Zëri i komunitetit',
    text: 'Vend për qytetarë, kulturë, sport, biznes lokal dhe histori që meritojnë vëmendje.',
  },
  {
    index: '03',
    title: 'Përvojë moderne',
    text: 'Radio live, lajme ditore dhe përmbajtje digjitale në një aplikacion të pastër e të shpejtë.',
  },
] as const;

const VALUE_PILLS = ['Integritet', 'Transparencë', 'Komunitet', 'Ritëm modern'];

const openURL = (url: string) => Linking.openURL(url).catch(() => undefined);

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, STATIC_PAGE_MIN_BOTTOM_SAFE_AREA);
  const headerHeight = insets.top + STATIC_PAGE_HEADER_ROW_HEIGHT;
  const bottomBarHeight = STATIC_PAGE_BOTTOM_BAR_BASE_HEIGHT + safeBottom;

  return (
    <View style={styles.screen}>
      <StaticPageHeader title="Rreth Nesh" topInset={insets.top} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: headerHeight + spacing.md,
            paddingBottom: bottomBarHeight + spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ top: headerHeight, bottom: bottomBarHeight }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroRule} />
          <Text style={styles.heroKicker}>RTV FONTANA · 98.8 FM</Text>
          <Text style={styles.heroTitle}>Media lokale me standard editorial.</Text>
          <Text style={styles.heroText}>
            Radio Fontana lidh ritmin e radios live me lajme të përditshme,
            rrëfime lokale dhe një përvojë digjitale të ndërtuar për përdorim të përditshëm.
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>Live</Text>
              <Text style={styles.statLabel}>radio</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>Daily</Text>
              <Text style={styles.statLabel}>lajme</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>Istog</Text>
              <Text style={styles.statLabel}>Kosovë</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionKicker}>Kush jemi</Text>
          <Text style={styles.sectionTitle}>Një platformë që ruan afërsinë lokale me ritëm digjital dhe identitet të qartë.</Text>
        </View>

        <View style={styles.storyStack}>
          {STORY_POINTS.map((point) => (
            <View key={point.index} style={styles.storyCard}>
              <Text style={styles.storyIndex}>{point.index}</Text>
              <View style={styles.storyBody}>
                <Text style={styles.storyTitle}>{point.title}</Text>
                <Text style={styles.storyText}>{point.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.statementCard}>
          <Text style={styles.statementTitle}>Vlerat tona</Text>
          <Text style={styles.statementText}>
            Besimi ndërtohet çdo ditë me raportim të ndershëm, respekt për publikun
            dhe përmbajtje që i shërben komunitetit.
          </Text>
          <View style={styles.pillRow}>
            {VALUE_PILLS.map((value) => (
              <View key={value} style={styles.valuePill}>
                <Text style={styles.valuePillText}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.legalCard}>
          <Pressable
            onPress={() => openURL('https://radiofontana.org/privacy')}
            style={({ pressed }) => [styles.legalRow, pressed && styles.legalRowPressed]}
          >
            <View style={styles.legalTextWrap}>
              <Text style={styles.legalTitle}>Politika e Privatësisë</Text>
              <Text style={styles.legalSub}>Si i mbrojmë të dhënat dhe përvojën tuaj.</Text>
            </View>
            <Text style={styles.legalAction}>Lexo</Text>
          </Pressable>
          <View style={styles.legalSep} />
          <Pressable
            onPress={() => openURL('https://radiofontana.org/terms')}
            style={({ pressed }) => [styles.legalRow, pressed && styles.legalRowPressed]}
          >
            <View style={styles.legalTextWrap}>
              <Text style={styles.legalTitle}>Kushtet e Shërbimit</Text>
              <Text style={styles.legalSub}>Rregullat bazë për përdorimin e aplikacionit.</Text>
            </View>
            <Text style={styles.legalAction}>Kushtet</Text>
          </Pressable>
        </View>
      </ScrollView>

      <StaticPageBottomBar bottomInset={insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },
  content: {
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
    fontSize: 31,
    lineHeight: 38,
    letterSpacing: 0,
  },
  heroText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 15,
    lineHeight: 23,
  },
  statsRow: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statItem: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 16,
  },
  statLabel: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  sectionHeader: {
    marginBottom: spacing.md,
  },
  sectionKicker: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 12,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 21,
    lineHeight: 28,
    letterSpacing: 0,
  },
  storyStack: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  storyCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  storyIndex: {
    width: 38,
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  storyBody: {
    flex: 1,
  },
  storyTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 16,
    lineHeight: 21,
  },
  storyText: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 14,
    lineHeight: 21,
  },
  statementCard: {
    padding: spacing.lg,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  statementTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 20,
    lineHeight: 26,
  },
  statementText: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 14,
    lineHeight: 22,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  valuePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.redTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.redBorder,
  },
  valuePillText: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 13,
  },
  legalCard: {
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  legalRowPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  legalTextWrap: {
    flex: 1,
  },
  legalTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 15,
  },
  legalSub: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    lineHeight: 17,
  },
  legalAction: {
    minWidth: 54,
    textAlign: 'right',
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 13,
  },
  legalSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.md,
  },
});
