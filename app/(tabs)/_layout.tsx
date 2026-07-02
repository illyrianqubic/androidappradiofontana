import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useEffect, useMemo } from 'react';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
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

const TAB_COUNT = TAB_ROUTES.length;
const BAR_HEIGHT = 72;

const LABELS: Record<TabRoute, string> = {
  index: 'Kryefaqja',
  live: 'Live',
  news: 'Lajme',
};

const TAB_A11Y_LABELS: Record<TabRoute, string> = {
  index: 'Kryefaqja',
  live: 'Drejtpërdrejt Live',
  news: 'Lajme',
};
const BUBBLE_SIZE = 56;
const NOTCH_WIDTH = 64;
const NOTCH_DEPTH = 28;
const CORNER_RADIUS = 20;
const NOTCH_STROKE_WIDTH = 2;

// ─── SVG notch stroke path builder ───────────────────────────────────────────
// Draws only the top edge of the bar (rounded corners + downward U notch) so
// the curve is visible as a subtle border/stroke instead of an invisible fill.
function buildNotchStrokePath(notchCx: number, barW: number): string {
  const R = CORNER_RADIUS;
  const halfW = NOTCH_WIDTH / 2;
  const depth = NOTCH_DEPTH;
  const nL = notchCx - halfW;
  const nR = notchCx + halfW;
  // Inset the stroke slightly so it sits fully inside the bar clip.
  const y = NOTCH_STROKE_WIDTH / 2;

  return [
    `M 0 ${R + y}`,
    `A ${R} ${R} 0 0 1 ${R} ${y}`,
    `H ${nL}`,
    `C ${nL} ${depth + y}, ${notchCx - halfW / 2} ${depth + y}, ${notchCx} ${depth + y}`,
    `C ${notchCx + halfW / 2} ${depth + y}, ${nR} ${depth + y}, ${nR} ${y}`,
    `H ${barW - R}`,
    `A ${R} ${R} 0 0 1 ${barW} ${R + y}`,
  ].join(' ');
}

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const safeBottom = Math.max(insets.bottom, 10);
  const styles = useMemo(() => getStyles(colors), [colors]);

  const tabWidth = screenWidth / TAB_COUNT;
  const activeIndex = state.index;

  // SVG is 2x screen width so the notch can translate to any tab position
  // without revealing the SVG edge.
  const svgWidth = screenWidth * 2;
  const svgNotchCx = svgWidth / 2;

  // notchX is the horizontal centre of the active tab.
  const notchX = useSharedValue(activeIndex * tabWidth + tabWidth / 2);
  useEffect(() => {
    notchX.value = withSpring(activeIndex * tabWidth + tabWidth / 2, {
      stiffness: motion.springSnappy.stiffness,
      damping: motion.springSnappy.damping,
      mass: motion.springSnappy.mass,
    });
  }, [activeIndex, tabWidth, notchX]);

  // Translate the SVG so its centre-notch aligns with the active tab centre.
  const barSvgStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: notchX.value - svgNotchCx }],
  }));

  // Bubble translation — same X as the active tab centre.
  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: notchX.value - BUBBLE_SIZE / 2 }],
  }));

  const notchPath = useMemo(
    () => buildNotchStrokePath(svgNotchCx, svgWidth),
    [svgNotchCx, svgWidth],
  );

  return (
    <View
      style={[
        styles.tabBarContainer,
        { height: BAR_HEIGHT + safeBottom, backgroundColor: colors.surface },
      ]}
    >
      <View style={[styles.bar, { width: screenWidth, height: BAR_HEIGHT }]}>
        {/* SVG notch stroke — behind tabs and bubble */}
        <View style={[styles.svgClip, { width: screenWidth, height: BAR_HEIGHT }]}>
          <Animated.View style={barSvgStyle}>
            <Svg
              width={svgWidth}
              height={BAR_HEIGHT}
              viewBox={`0 0 ${svgWidth} ${BAR_HEIGHT}`}
            >
              <Path
                d={notchPath}
                fill="none"
                stroke={colors.border}
                strokeWidth={NOTCH_STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Animated.View>
        </View>

        {/* Tab pressables — icon + label per tab */}
        <View style={[styles.tabsRow, { width: screenWidth, height: BAR_HEIGHT }]}>
          {state.routes.map((route, index) => {
            const name = route.name as TabRoute;
            if (!TAB_ROUTES.includes(name)) return null;

            const focused = state.index === index;
            const iconName = focused ? ICONS_ACTIVE[name] : ICONS_INACTIVE[name];
            const iconColor = focused ? colors.surface : colors.textMuted;
            const labelColor = focused ? colors.navy : colors.textMuted;

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
                accessibilityRole="tab"
                accessibilityLabel={TAB_A11Y_LABELS[name]}
              >
                <View style={styles.tabItemInner}>
                  {focused ? null : (
                    <Ionicons name={iconName} size={22} color={iconColor} />
                  )}
                  <Text style={[styles.tabLabel, { color: labelColor }]}>
                    {LABELS[name]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Active bubble — single navy circle centered inside the bar */}
        <Animated.View
          style={[styles.bubbleWrap, bubbleStyle]}
          pointerEvents="none"
        >
          <View style={styles.bubble}>
            <Ionicons
              name={ICONS_ACTIVE[TAB_ROUTES[activeIndex]]}
              size={24}
              color={colors.surface}
            />
          </View>
        </Animated.View>
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
    width: '100%',
    overflow: 'hidden',
    borderTopLeftRadius: CORNER_RADIUS,
    borderTopRightRadius: CORNER_RADIUS,
  },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: CORNER_RADIUS,
    borderTopRightRadius: CORNER_RADIUS,
    overflow: 'visible',
  },
  svgClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: BAR_HEIGHT,
    overflow: 'hidden',
    borderTopLeftRadius: CORNER_RADIUS,
    borderTopRightRadius: CORNER_RADIUS,
  },
  tabsRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: BAR_HEIGHT,
    flexDirection: 'row',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: fonts.uiMedium,
    marginTop: 2,
  },

  // ── Active bubble ─────────────────────────────────────────────────────
  bubbleWrap: {
    position: 'absolute',
    top: (BAR_HEIGHT - BUBBLE_SIZE) / 2,
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
  },
});
