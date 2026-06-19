import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useEffect, useMemo } from 'react';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
// A-3: deep import skips loading all other icon sets' glyph maps.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, motion } from '../../constants/tokens';
import { useTheme } from '../../providers/ThemeProvider';
import type { ThemeColors } from '../../providers/ThemeProvider';

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

const TAB_COUNT = TAB_ROUTES.length;
const BAR_HEIGHT = 64;
const BUBBLE_SIZE = 56;
const BUBBLE_ELEVATION = 14;

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const safeBottom = Math.max(insets.bottom, 10);
  const styles = useMemo(() => getStyles(colors), [colors]);

  const tabWidth = screenWidth / TAB_COUNT;
  const activeIndex = state.index;

  // Animated notch position — glides to the active tab centre.
  const notchX = useSharedValue(activeIndex * tabWidth + tabWidth / 2);
  useEffect(() => {
    notchX.value = withSpring(activeIndex * tabWidth + tabWidth / 2, {
      stiffness: motion.springSnappy.stiffness,
      damping: motion.springSnappy.damping,
      mass: motion.springSnappy.mass,
    });
  }, [activeIndex, tabWidth, notchX]);

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: notchX.value - BUBBLE_SIZE / 2 }],
  }));

  return (
    <View style={[styles.tabBar, { height: BAR_HEIGHT + safeBottom, paddingBottom: safeBottom }]}>
      {/* Elevated active bubble — coloured circle rising above the bar */}
      <Animated.View style={[styles.bubbleWrap, bubbleStyle]}>
        <View style={styles.bubble}>
          <Ionicons
            name={ICONS_ACTIVE[TAB_ROUTES[activeIndex]]}
            size={24}
            color={colors.surface}
          />
        </View>
      </Animated.View>

      {/* Tab pressables — sit on top so they receive touches */}
      {state.routes.map((route, index) => {
        const name = route.name as TabRoute;
        if (!TAB_ROUTES.includes(name)) return null;

        const focused = state.index === index;
        const iconName = focused ? ICONS_ACTIVE[name] : ICONS_INACTIVE[name];
        const iconColor = focused ? colors.surface : colors.textMuted;

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
            {/* Icon slot — empty when active (the bubble provides the icon) */}
            <View style={styles.iconSlot}>
              {focused ? null : <Ionicons name={iconName} size={22} color={iconColor} />}
            </View>

            <Text style={[styles.label, focused && styles.labelFocused]}>
              {TAB_LABELS[name]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
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

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    overflow: 'visible',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  iconSlot: {
    width: BUBBLE_SIZE,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.uiMedium,
    fontSize: 10.5,
    letterSpacing: 0.3,
    color: colors.textMuted,
    marginBottom: 4,
  },
  labelFocused: {
    fontFamily: fonts.uiBold,
    color: colors.navy,
  },

  // ── Elevated bubble ───────────────────────────────────────────────────
  bubbleWrap: {
    position: 'absolute',
    top: -(BUBBLE_SIZE / 2) + BUBBLE_ELEVATION,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  bubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.navy,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
