import { StyleSheet, Text, View } from 'react-native';
import { type ReactNode } from 'react';
import { colors, fonts, spacing } from '../design-tokens';

type StickyTopBarProps = {
  title: string;
  subtitle?: string;
  topInset: number;
  rightElement?: ReactNode;
};

export function StickyTopBar({ title, subtitle, topInset, rightElement }: StickyTopBarProps) {
  return (
    <View style={[styles.container, { paddingTop: topInset + spacing.xs }]}>
      <View style={styles.row}>
        <View style={styles.textBlock}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightElement ? <View style={styles.rightSlot}>{rightElement}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: 'rgba(249, 250, 251, 0.98)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textBlock: {
    flex: 1,
  },
  rightSlot: {
    marginLeft: 8,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 12,
  },
});
