import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing } from '../constants/tokens';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const headerHeight = insets.top + 52;
  const bottomInsetOffset = insets.bottom + 196;

  return (
    <View style={styles.screen}>
      {/* ── Custom header with back arrow ── */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          hitSlop={10}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Rreth Nesh</Text>
        <View style={styles.backBtnPlaceholder} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerHeight + 12, paddingBottom: bottomInsetOffset },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>RTV Fontana</Text>
          <Text style={styles.heroSubtitle}>Radio lokale me zë modern nga Istogu</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Misioni ynë</Text>
          <Text style={styles.cardText}>
            Të sjellim lajme të verifikuara, muzikë cilësore dhe programe që i japin zë komunitetit.
            Çdo ditë punojmë që përmbajtja jonë të jetë e shpejtë, e saktë dhe e dobishme.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vizioni</Text>
          <Text style={styles.cardText}>
            Të jemi platforma kryesore informative dhe argëtuese për rajonin, duke kombinuar transmetimin
            tradicional me përvojën moderne dixhitale.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vlerat</Text>
          <Text style={styles.cardText}>Integritet editorial, respekt për publikun, transparencë dhe inovacion.</Text>
        </View>

        <View style={styles.legalCard}>
          <Pressable
            onPress={() => Linking.openURL('https://radiofontana.org/privacy').catch(() => undefined)}
            style={({ pressed }) => [styles.legalRow, pressed && styles.legalRowPressed]}
          >
            <View style={styles.legalIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#6D28D9" />
            </View>
            <Text style={styles.legalLabel}>Politika e Privatësisë</Text>
            <Ionicons name="open-outline" size={14} color="#9CA3AF" />
          </Pressable>
          <View style={styles.legalSep} />
          <Pressable
            onPress={() => Linking.openURL('https://radiofontana.org/terms').catch(() => undefined)}
            style={({ pressed }) => [styles.legalRow, pressed && styles.legalRowPressed]}
          >
            <View style={styles.legalIconWrap}>
              <Ionicons name="document-text-outline" size={16} color="#0369A1" />
            </View>
            <Text style={styles.legalLabel}>Kushtet e Shërbimit</Text>
            <Ionicons name="open-outline" size={14} color="#9CA3AF" />
          </Pressable>
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
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    height: undefined,
    paddingBottom: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  backBtnPressed: {
    backgroundColor: '#E5E7EB',
  },
  backBtnPlaceholder: {
    width: 40,
  },
  headerTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 17,
    color: colors.text,
    letterSpacing: -0.2,
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
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.uiMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 20,
    lineHeight: 25,
  },
  cardText: {
    marginTop: 6,
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 15,
    lineHeight: 23,
  },
  legalCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 13,
    borderRadius: 10,
  },
  legalRowPressed: {
    backgroundColor: '#F7F8FA',
  },
  legalIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.uiMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  legalSep: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 10,
  },
});
