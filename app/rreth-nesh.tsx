import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StickyTopBar } from '../components/StickyTopBar';
import { colors, fonts, radius, spacing } from '../design-tokens';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const topInsetOffset = insets.top + 86;
  const bottomInsetOffset = insets.bottom + 196;

  return (
    <View style={styles.screen}>
      <StickyTopBar title="Rreth Nesh" subtitle="Kush jemi dhe çfarë përfaqësojmë" topInset={insets.top} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInsetOffset, paddingBottom: bottomInsetOffset },
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
});
