import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useEffect, useMemo } from 'react';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Home, Newspaper, Radio } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { motion } from '../../constants/tokens';
import { useTheme } from '../../providers/ThemeProvider';
import type { ThemeColors } from '../../providers/ThemeProvider';

const TAB_ROUTES = ['index', 'live', 'news'] as const;
type TabRoute = (typeof TAB_ROUTES)[number];

const TAB_ICONS: Record<TabRoute, LucideIcon> = {
  index: Home,
  live: Radio,
  news: Newspaper,
};

const TAB_COUNT = TAB_ROUTES.length;
const BAR_HEIGHT = 56;
const DIVIDER_HEIGHT = 0.5;
const ICON_ZONE_HEIGHT = BAR_HEIGHT - DIVIDER_HEIGHT;
const ICON_SIZE = 24;
const LABEL_FONT_SIZE = 10;
const LABEL_MARGIN_TOP = 2;
const INDICATOR_HEIGHT = 4;
const INDICATOR_MARGIN_BOTTOM = 4;

// Vertical layout of the tab content (indicator + icon + label), centered in the icon zone.
const COLUMN_HEIGHT =
  INDICATOR_HEIGHT + INDICATOR_MARGIN_BOTTOM + ICON_SIZE + LABEL_MARGIN_TOP + LABEL_FONT_SIZE;
const COLUMN_TOP = (ICON_ZONE_HEIGHT - COLUMN_HEIGHT) / 2;
const ICON_TOP = COLUMN_TOP + INDICATOR_HEIGHT + INDICATOR_MARGIN_BOTTOM;

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const safeBottom = Math.max(insets.bottom, 10);
  const styles = useMemo(() => getStyles(colors), [colors]);
  const activeColor = isDark ? '#FFFFFF' : colors.navy;

  const tabWidth = screenWidth / TAB_COUNT;
  const indicatorWidth = tabWidth * 0.5;
  const activeIndex = state.index;

  // notchX tracks the horizontal centre of the active tab for the indicator.
  const notchX = useSharedValue(activeIndex * tabWidth + tabWidth / 2);
  useEffect(() => {
    notchX.value = withSpring(activeIndex * tabWidth + tabWidth / 2, {
      stiffness: motion.springSnappy.stiffness,
      damping: motion.springSnappy.damping,
      mass: motion.springSnappy.mass,
    });
  }, [activeIndex, tabWidth, notchX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: notchX.value - indicatorWidth / 2 }],
  }), [indicatorWidth]);

  return (
    <View
      style={[
        styles.tabBarContainer,
        { height: BAR_HEIGHT + safeBottom, width: screenWidth },
      ]}
    >
      {/* Top divider line */}
      <View style={[styles.divider, { width: screenWidth }]} />

      {/* Icon zone */}
      <View style={[styles.iconZone, { width: screenWidth, height: ICON_ZONE_HEIGHT }]}>
        {/* Animated active indicator line */}
        <Animated.View
          style={[
            styles.indicator,
            indicatorStyle,
            { backgroundColor: activeColor, width: indicatorWidth, top: 0 },
          ]}
          pointerEvents="none"
        />

        {state.routes.map((route, index) => {
          const name = route.name as TabRoute;
          if (!TAB_ROUTES.includes(name)) return null;

          const focused = state.index === index;
          const Icon = TAB_ICONS[name];
          const tint = focused ? activeColor : colors.textMuted;

          const onPress = () => {
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
              style={styles.tabItem}
              android_ripple={{ color: 'transparent' }}
            >
              <View style={styles.tabContent}>
                <Icon size={ICON_SIZE} color={tint} strokeWidth={1.5} />
                <Text style={[styles.label, { color: tint, marginTop: LABEL_MARGIN_TOP }]}>
                  {route.name === 'index' ? 'Kryefaqja' : route.name === 'live' ? 'Live' : 'Lajme'}
                </Text>
              </View>
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
    flexDirection: 'row',
  },
  indicator: {
    position: 'absolute',
    top: COLUMN_TOP,
    left: 0,
    height: INDICATOR_HEIGHT,
    borderRadius: INDICATOR_HEIGHT / 2,
    backgroundColor: colors.primary,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingTop: ICON_TOP,
  },
  tabContent: {
    alignItems: 'center',
    transform: [{ translateY: -4 }],
  },
  label: {
    fontSize: LABEL_FONT_SIZE,
    lineHeight: LABEL_FONT_SIZE + 2,
    fontFamily: 'InterVariable',
  },
});
