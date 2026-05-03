import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts } from '../../constants/tokens';

export const STATIC_PAGE_HEADER_ROW_HEIGHT = 66;
export const STATIC_PAGE_BOTTOM_BAR_BASE_HEIGHT = 64;
export const STATIC_PAGE_MIN_BOTTOM_SAFE_AREA = 10;

type StaticPageHeaderProps = {
  title: string;
  topInset: number;
};

export function StaticPageHeader({ title, topInset }: StaticPageHeaderProps) {
  const router = useRouter();

  return (
    <View style={[styles.header, { paddingTop: topInset }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {title}
        </Text>
        <View style={styles.sidePlaceholder} />
      </View>
    </View>
  );
}

type StaticPageBottomBarProps = {
  bottomInset: number;
};

export function StaticPageBottomBar({ bottomInset }: StaticPageBottomBarProps) {
  const safeBottom = Math.max(bottomInset, STATIC_PAGE_MIN_BOTTOM_SAFE_AREA);

  return (
    <View
      pointerEvents="none"
      style={[styles.bottomBar, { height: STATIC_PAGE_BOTTOM_BAR_BASE_HEIGHT + safeBottom }]}
    >
      <View style={styles.bottomHandle} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.10)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  headerRow: {
    height: STATIC_PAGE_HEADER_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  backButtonPressed: {
    backgroundColor: colors.redTint,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 17,
    letterSpacing: 0,
  },
  sidePlaceholder: {
    width: 40,
    height: 40,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 35,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15,23,42,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 0,
  },
  bottomHandle: {
    width: 46,
    height: 4,
    borderRadius: 999,
    marginTop: 11,
    backgroundColor: 'rgba(15,23,42,0.16)',
  },
});
