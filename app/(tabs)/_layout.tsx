import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../../design-tokens';

const iconByRoute: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  live: 'radio-outline',
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
        tabBarInactiveTintColor: colors.textMuted,
        tabBarActiveBackgroundColor: colors.redTint,
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
        tabBarIcon: ({ color }) => (
          <View style={styles.iconWrap}>
            <Ionicons
              size={24}
              color={color}
              name={iconByRoute[route.name] ?? 'ellipse-outline'}
            />
          </View>
        ),
        animation: 'shift',
      })}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Kryefaqja',
        }}
      />

      <Tabs.Screen
        name="live"
        options={{
          title: 'Drejtpërdrejt',
        }}
      />

      <Tabs.Screen
        name="news"
        options={{
          title: 'Lajme',
        }}
      />

      <Tabs.Screen
        name="library"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 6,
  },
  tabItem: {
    marginHorizontal: 6,
    borderRadius: radius.pill,
    paddingTop: 3,
  },
  iconWrap: {
    minWidth: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  tabLabel: {
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    marginTop: 4,
  },
});
