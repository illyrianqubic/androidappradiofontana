import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { appIdentity, colors, fonts, radius, spacing } from '../design-tokens';
import { SkeletonCard } from './SkeletonCard';

export function AppBootSkeleton() {
  return (
    <View style={styles.screen}>
      <View style={styles.logoWrap}>
        <Image source={appIdentity.logo} contentFit="contain" style={styles.logo} />
      </View>

      <Text style={styles.title}>RTV Fontana</Text>

      <View style={styles.placeholderWrap}>
        <SkeletonCard height={46} style={styles.line} />
        <SkeletonCard height={180} style={styles.card} />
        <SkeletonCard height={180} style={styles.card} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  logoWrap: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  logo: {
    width: 170,
    height: 170,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  title: {
    marginTop: spacing.md,
    textAlign: 'center',
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 24,
    letterSpacing: -0.2,
  },
  placeholderWrap: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  line: {
    borderRadius: radius.button,
  },
  card: {
    borderRadius: radius.card,
  },
});
