import { memo, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, fonts } from '../../constants/tokens';

type RefreshStatusBannerProps = {
  visible: boolean;
  title: string;
  subtitle: string;
  style?: StyleProp<ViewStyle>;
};

const ENTER_MS = 420;
const EXIT_MS = 260;

export const RefreshStatusBanner = memo(function RefreshStatusBanner({
  visible,
  title,
  subtitle,
  style,
}: RefreshStatusBannerProps) {
  const [shouldRender, setShouldRender] = useState(visible);
  // Track shouldRender in a ref so the effect doesn't re-run (and cancel animations)
  // when setShouldRender triggers a re-render. Without this, the exit animation's
  // `finished` callback fires as false (cancelled) and setShouldRender(false) is never called.
  const shouldRenderRef = useRef(visible);
  const opacity = useSharedValue(visible ? 1 : 0);
  const translateY = useSharedValue(visible ? 0 : -8);
  const scale = useSharedValue(visible ? 1 : 0.985);

  useEffect(() => {
    if (visible) {
      if (!shouldRenderRef.current) {
        shouldRenderRef.current = true;
        opacity.value = 0;
        translateY.value = -8;
        scale.value = 0.985;
        setShouldRender(true);
      }
      opacity.value = withTiming(1, {
        duration: ENTER_MS,
        easing: Easing.out(Easing.cubic),
      });
      translateY.value = withTiming(0, {
        duration: ENTER_MS,
        easing: Easing.out(Easing.cubic),
      });
      scale.value = withTiming(1, {
        duration: ENTER_MS,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    if (!shouldRenderRef.current) return;
    opacity.value = withTiming(0, {
      duration: EXIT_MS,
      easing: Easing.in(Easing.quad),
    }, (finished) => {
      if (finished) {
        shouldRenderRef.current = false;
        runOnJS(setShouldRender)(false);
      }
    });
    translateY.value = withTiming(-6, {
      duration: EXIT_MS,
      easing: Easing.in(Easing.quad),
    });
    scale.value = withTiming(0.99, {
      duration: EXIT_MS,
      easing: Easing.in(Easing.quad),
    });
  // shouldRender intentionally excluded — use shouldRenderRef to avoid
  // re-running this effect (and cancelling in-flight animations) on state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, opacity, scale, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!shouldRender) return null;

  return (
    <Animated.View accessibilityRole="progressbar" style={[styles.wrap, style, animatedStyle]}>
      <View style={styles.indicator}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.16)',
    backgroundColor: '#FFF7F7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  indicator: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(220,38,38,0.20)',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
});
