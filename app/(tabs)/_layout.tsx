import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useRef } from 'react';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { Home, Newspaper, Radio } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import type { ThemeColors } from '../../providers/ThemeProvider';

const TAB_ROUTES = ['index', 'live', 'news'] as const;
type TabRoute = (typeof TAB_ROUTES)[number];

const TAB_ICONS: Record<TabRoute, LucideIcon> = {
  index: Home,
  live: Radio,
  news: Newspaper,
};

const BAR_HEIGHT = 56;
const DIVIDER_HEIGHT = 0.5;
const ICON_ZONE_HEIGHT = BAR_HEIGHT - DIVIDER_HEIGHT;
const ICON_SIZE = 24;
const LABEL_FONT_SIZE = 10;
const LABEL_MARGIN_TOP = 2;

const SPRING_CONFIG = { stiffness: 260, damping: 28, mass: 0.8 } as const;

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 10);
  const styles = useMemo(() => getStyles(colors), [colors]);

  // ── Press scale animation (UI thread) ────────────────────────────────
  const scaleIndex = useSharedValue(1);
  const scaleLive = useSharedValue(1);
  const scaleNews = useSharedValue(1);
  const scales = [scaleIndex, scaleLive, scaleNews] as const;

  const animatedStyles = [
    useAnimatedStyle(() => ({ transform: [{ scale: scaleIndex.value }] })),
    useAnimatedStyle(() => ({ transform: [{ scale: scaleLive.value }] })),
    useAnimatedStyle(() => ({ transform: [{ scale: scaleNews.value }] })),
  ] as const;

  // Bounce the newly active tab on switch (skip first render).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    scales[state.index].value = withSequence(
      withSpring(1.12, SPRING_CONFIG),
      withSpring(1.0, SPRING_CONFIG),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index]);

  return (
    <View
      style={[
        styles.tabBarContainer,
        { height: BAR_HEIGHT + safeBottom },
      ]}
    >
      {/* Top divider line */}
      <View style={styles.divider} />

      {/* Icon zone */}
      <View style={[styles.iconZone, { height: ICON_ZONE_HEIGHT }]}>

        {state.routes.map((route, index) => {
          const name = route.name as TabRoute;
          if (!TAB_ROUTES.includes(name)) return null;

          const focused = state.index === index;
          const Icon = TAB_ICONS[name];
          const tint = focused ? colors.primary : colors.textMuted;

          const onPress = () => {
            // Press animation — runs on UI thread.
            scales[index].value = withSequence(
              withSpring(1.12, SPRING_CONFIG),
              withSpring(1.0, SPRING_CONFIG),
            );

            import('expo-haptics')
              .then((Haptics) => Haptics.selectionAsync())
              .catch(() => undefined);

            if (name === 'news') {
              navigation.navigate('news', { screen: 'index' });
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
              style={({ pressed }) => [
                styles.tabItem,
                pressed && Platform.OS === 'ios' && { opacity: 0.7 },
              ]}
              android_ripple={{ color: 'transparent' }}
            >
              <Animated.View style={[styles.tabContent, animatedStyles[index]]}>
                <Icon size={ICON_SIZE} color={tint} strokeWidth={1.5} />
                <Text style={[styles.label, { color: tint, marginTop: LABEL_MARGIN_TOP }]}>
                  {route.name === 'index' ? 'Kryefaqja' : route.name === 'live' ? 'Live' : 'Lajme'}
                </Text>
              </Animated.View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = BAR_HEIGHT + Math.max(insets.bottom, 10);

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        animation: 'none',
        sceneStyle: { backgroundColor: colors.surface },
        tabBarStyle: { height: tabBarHeight },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Kryefaqja' }} />
      <Tabs.Screen name="live" options={{ title: 'Live' }} />
      <Tabs.Screen name="news" options={{ title: 'Lajme' }} />
    </Tabs>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  tabBarContainer: {
    position: 'relative',
    backgroundColor: colors.surface,
  },
  divider: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: DIVIDER_HEIGHT,
    backgroundColor: colors.border,
  },
  iconZone: {
    position: 'absolute',
    top: DIVIDER_HEIGHT,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    alignItems: 'center',
  },
  label: {
    fontSize: LABEL_FONT_SIZE,
    lineHeight: LABEL_FONT_SIZE + 2,
    fontFamily: 'InterVariable',
  },
});
