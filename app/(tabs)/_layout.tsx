import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { CommonActions } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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
        tabPress: () => {
          Haptics.selectionAsync().catch(() => undefined);
          // AUDIT FIX P8.30: warm adjacent tab routes on press so the next
          // tap is instant. router.prefetch is a no-op if already warm.
          router.prefetch('/(tabs)' as never);
          router.prefetch('/(tabs)/live' as never);
          router.prefetch('/(tabs)/news' as never);
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
        listeners={({ navigation }) => ({
          // Tapping the Lajme tab always resets the nested news Stack to its
          // listing screen, even if the user previously navigated into an
          // article. `navigation.navigate('news', { screen: 'index' })` alone
          // only switches tabs without popping the nested stack — we have to
          // dispatch a reset on the news navigator itself so the [slug] route
          // is removed from history (otherwise back from the listing would
          // exit the app instead of returning to wherever the user came from,
          // and the listing itself wouldn't even render because the [slug]
          // would still be the focused route).
          tabPress: (e) => {
            const parentState = navigation.getState();
            const newsRoute = parentState?.routes.find((r: { name: string }) => r.name === 'news');
            const nested = newsRoute?.state;
            if (nested && typeof nested.index === 'number' && nested.index > 0) {
              e.preventDefault();
              navigation.navigate('news' as never, undefined as never);
              navigation.dispatch({
                ...CommonActions.reset({
                  index: 0,
                  routes: [{ name: 'index' }],
                }),
                target: nested.key,
              });
            }
          },
        })}
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
