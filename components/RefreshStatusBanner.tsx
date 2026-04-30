import { memo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fonts } from '../design-tokens';

type RefreshStatusBannerProps = {
  visible: boolean;
  title: string;
  subtitle: string;
  style?: StyleProp<ViewStyle>;
};

export const RefreshStatusBanner = memo(function RefreshStatusBanner({
  visible,
  title,
  subtitle,
  style,
}: RefreshStatusBannerProps) {
  if (!visible) return null;

  return (
    <View accessibilityRole="progressbar" style={[styles.wrap, style]}>
      <View style={styles.indicator}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.16)',
    backgroundColor: '#FFF7F7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  indicator: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(220,38,38,0.20)',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
});
