import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../../constants/tokens';
import { LiveDot } from './LiveDot';

type LiveBadgeVariant = 'solid' | 'outlined' | 'transparent-over-image';

type LiveBadgeProps = {
  label?: string;
  variant?: LiveBadgeVariant;
  withDot?: boolean;
};

export function LiveBadge({ label = 'LIVE', variant = 'solid', withDot = false }: LiveBadgeProps) {
  return (
    <View style={[styles.base, variantStyles[variant]]}>
      {withDot ? <LiveDot /> : null}
      <Text style={[styles.text, textVariantStyles[variant]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  text: {
    fontFamily: fonts.uiBold,
    fontSize: 11,
    lineHeight: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});

const variantStyles = StyleSheet.create({
  solid: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  outlined: {
    backgroundColor: colors.redTint,
    borderColor: colors.primary,
  },
  'transparent-over-image': {
    backgroundColor: 'rgba(17,24,39,0.6)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
});

const textVariantStyles = StyleSheet.create({
  solid: {
    color: colors.surface,
  },
  outlined: {
    color: colors.primary,
  },
  'transparent-over-image': {
    color: colors.surface,
  },
});
