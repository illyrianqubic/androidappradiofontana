import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/tokens';

const TAB_ROUTES = ['index', 'live', 'news'] as const;
type TabRoute = (typeof TAB_ROUTES)[number];

const ICONS_ACTIVE: Record<TabRoute, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  live: 'radio',
  news: 'newspaper',
};
const ICONS_INACTIVE: Record<TabRoute, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  live: 'radio',
  news: 'newspaper-outline',
};

const TAB_LABELS: Record<TabRoute, string> = {
  index: 'Kryefaqja',
  live: 'Live',
  news: 'Lajme',
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const safeBottom = Math.max(insets.bottom, 10);

  return (
    <View style={[styles.tabBar, { paddingBottom: safeBottom, height: 64 + safeBottom }]}>
      {state.routes.map((route, index) => {
        const name = route.name as TabRoute;
        if (!TAB_ROUTES.includes(name)) return null;

        const focused = state.index === index;
        const iconName = focused ? ICONS_ACTIVE[name] : ICONS_INACTIVE[name];
        const iconColor = focused ? colors.navy : 'rgba(15,23,42,0.35)';

        const onPress = () => {
          import('expo-haptics')
            .then((Haptics) => Haptics.selectionAsync())
            .catch(() => undefined);

          // BUGFIX: Lajme tab must always land on listing, not a previously-opened article.
          if (name === 'news') {
            router.replace('/news' as never);
            return;
          }

          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={styles.tabItem}
            android_ripple={{ color: 'transparent' }}
          >
            {/* Indicator track — always rendered so icons stay vertically aligned */}
            <View style={styles.indicatorTrack}>
              <View style={[styles.indicatorPill, focused && styles.indicatorPillActive]} />
            </View>

            {/* Icon + label — centered in the remaining space below the indicator */}
            <View style={styles.iconLabel}>
              <Ionicons name={iconName} size={22} color={iconColor} />
              <Text style={[styles.label, focused && styles.labelFocused]}>
                {TAB_LABELS[name]}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        // AUDIT FIX P1.4: freezeOnBlur stops off-screen tabs from
        // reconciling, animating, and consuming CPU.
        freezeOnBlur: true,
        animation: 'none',
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Kryefaqja' }} />
      <Tabs.Screen name="live" options={{ title: 'Live' }} />
      <Tabs.Screen name="news" options={{ title: 'Lajme' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15,23,42,0.10)',
    elevation: 0,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  // Always-present track reserves the 3px indicator slot so every tab's
  // icon sits at the same vertical position regardless of active state.
  indicatorTrack: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 0,
  },
  indicatorPill: {
    width: 70,
    height: 3,
    borderRadius: 3,
    backgroundColor: 'rgba(15,23,42,0.07)',
  },
  indicatorPillActive: {
    backgroundColor: colors.navy,
  },
  iconLabel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingBottom: 2,
  },
  label: {
    fontFamily: fonts.uiMedium,
    fontSize: 10.5,
    letterSpacing: 0.3,
    color: 'rgba(15,23,42,0.35)',
  },
  labelFocused: {
    fontFamily: fonts.uiBold,
    color: colors.navy,
  },
});
