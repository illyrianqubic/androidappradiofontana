import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../design-tokens';

const ICONS_ACTIVE: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  live: 'pulse',
  news: 'newspaper',
};
const ICONS_INACTIVE: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  live: 'pulse-outline',
  news: 'newspaper-outline',
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          Haptics.selectionAsync().catch(() => undefined);
        },
      }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.42)',
        tabBarActiveBackgroundColor: 'transparent',
        tabBarStyle: [
          styles.tabBar,
          {
            height: 72 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ],
        tabBarItemStyle: styles.tabItem,
        tabBarLabelStyle: styles.tabLabel,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, focused }) => (
          <View style={styles.iconWrap}>
            {focused && <View style={styles.activeIndicator} />}
            <Ionicons
              size={22}
              color={color}
              name={
                focused
                  ? (ICONS_ACTIVE[route.name] ?? 'ellipse')
                  : (ICONS_INACTIVE[route.name] ?? 'ellipse-outline')
              }
            />
          </View>
        ),
        animation: 'shift',
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Kryefaqja' }} />
      <Tabs.Screen name="live" options={{ title: 'Live' }} />
      <Tabs.Screen name="news" options={{ title: 'Lajme' }} />
      <Tabs.Screen name="library" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.navy,
    borderTopWidth: 0,
    paddingTop: 4,
    // Android elevation
    elevation: 0,
  },
  tabItem: {
    marginHorizontal: 4,
    paddingTop: 0,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    gap: 4,
    minWidth: 44,
  },
  activeIndicator: {
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 3,
    backgroundColor: colors.primary,
    position: 'absolute',
    top: 0,
    shadowColor: colors.primary,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  tabLabel: {
    fontFamily: fonts.uiMedium,
    fontSize: 10.5,
    marginTop: 2,
    letterSpacing: 0.2,
  },
});
