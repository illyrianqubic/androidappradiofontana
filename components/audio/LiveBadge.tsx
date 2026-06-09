import { StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { fonts, radius, spacing } from '../../constants/tokens';
import { useTheme } from '../../providers/ThemeProvider';
import type { ThemeColors } from '../../providers/ThemeProvider';
import { LiveDot } from './LiveDot';

type LiveBadgeVariant = 'solid' | 'outlined' | 'transparent-over-image';

type LiveBadgeProps = {
  label?: string;
  variant?: LiveBadgeVariant;
  withDot?: boolean;
};

export function LiveBadge({ label = 'LIVE', variant = 'solid', withDot = false }: LiveBadgeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const variantStyle = VARIANT_MAP[variant](colors);
  const textVariantStyle = TEXT_VARIANT_MAP[variant];

  return (
    <View style={[styles.base, variantStyle]}>
      {withDot ? <LiveDot /> : null}
      <Text style={[styles.text, textVariantStyle]}>{label}</Text>
    </View>
  );
}

const VARIANT_MAP: Record<LiveBadgeVariant, (colors: ThemeColors) => { backgroundColor: string; borderColor: string }> = {
  solid: (colors) => ({
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  }),
  outlined: (colors) => ({
    backgroundColor: colors.redTint,
    borderColor: colors.primary,
  }),
  'transparent-over-image': () => ({
    backgroundColor: 'rgba(17,24,39,0.6)',
    borderColor: 'rgba(255,255,255,0.22)',
  }),
};

const TEXT_VARIANT_MAP: Record<LiveBadgeVariant, { color: string }> = {
  solid: { color: '#ffffff' },
  outlined: { color: '#dc2626' },
  'transparent-over-image': { color: '#ffffff' },
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
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
