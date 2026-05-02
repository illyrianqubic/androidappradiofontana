import { StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/tokens';

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
  const router = useRouter();

  // Stable tab bar style — recomputed only when bottom inset changes (e.g.
  // device rotation), so screenOptions doesn't allocate a fresh array per route.
  const dynamicTabBarStyle = useMemo(
    () => [
      styles.tabBar,
      {
        height: 72 + insets.bottom,
        paddingBottom: Math.max(insets.bottom, 8),
      },
    ],
    [insets.bottom],
  );

  return (
    <Tabs
      screenListeners={{
        // Lightweight haptic feedback on tab press. Route prefetching was
        // removed here because it ran on every tap (including taps on the
        // already-active tab) and the resulting bundle resolution work
        // showed up as a 30–80 ms hitch on tab switches. expo-router lazily
        // mounts each tab on first focus anyway, which is fast enough.
        tabPress: () => {
          import('expo-haptics')
            .then((Haptics) => Haptics.selectionAsync())
            .catch(() => undefined);
        },
      }}
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: true,
        // AUDIT FIX P1.4: freezeOnBlur stops off-screen tabs from
        // reconciling, animating, and consuming CPU. Critical because tabs
        // stay mounted once visited — without this, Live's 13 EQ bar
        // worklets and News's sticky-header reanimations keep ticking even
        // when the user is on Home.
        freezeOnBlur: true,
        animation: 'none',
        sceneStyle: { backgroundColor: colors.surface },
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: 'rgba(15,23,42,0.40)',
        tabBarActiveBackgroundColor: 'transparent',
        tabBarActiveLabelStyle: { color: colors.navy, fontFamily: fonts.uiBold },
        tabBarInactiveLabelStyle: { color: 'rgba(15,23,42,0.40)' },
        tabBarStyle: dynamicTabBarStyle,
        tabBarItemStyle: styles.tabItem,
        tabBarLabelStyle: styles.tabLabel,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ focused }) => (
          <View style={styles.iconWrap}>
            {focused && <View style={styles.activeIndicator} />}
            <Ionicons
              size={22}
              color={focused ? colors.navy : 'rgba(15,23,42,0.40)'}
              name={
                focused
                  ? (ICONS_ACTIVE[route.name] ?? 'ellipse')
                  : (ICONS_INACTIVE[route.name] ?? 'ellipse-outline')
              }
            />
          </View>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Kryefaqja' }} />
      <Tabs.Screen name="live" options={{ title: 'Live' }} />
      <Tabs.Screen
        name="news"
        options={{ title: 'Lajme' }}
        listeners={{
          // BUGFIX: tapping the Lajme tab must always land on the news
          // listing, never on a previously-opened article.
          tabPress: (event) => {
            event.preventDefault();
            router.replace('/news' as never);
          },
        }}
      />
      <Tabs.Screen name="library" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15,23,42,0.10)',
    paddingTop: 4,
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
    backgroundColor: colors.navy,
    position: 'absolute',
    top: 0,
  },
  tabLabel: {
    fontFamily: fonts.uiMedium,
    fontSize: 10.5,
    marginTop: 2,
    letterSpacing: 0.2,
    color: colors.navy,
  },
});
