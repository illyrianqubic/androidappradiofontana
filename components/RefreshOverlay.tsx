import { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { fonts } from '../design-tokens';
import { PULL_BAR_H, PULL_THRESHOLD, type RefreshPhase } from '../lib/usePullToRefresh';

/**
 * RefreshBar — premium 3-phase pull-to-refresh banner.
 *
 *  PULL    : ring rotates with pull amount, bar grows with finger
 *  LOADING : spinning red arc + "Duke u rifreskuar…"
 *  SUCCESS : green check + "U rifreskua!" (800ms)
 *
 * `pullProgress` (px) drives bar height. `phaseValue` (0|1|2) cross-fades
 * between the pull / loading / success content. All on UI thread.
 */

type Props = {
  pullProgress: SharedValue<number>;
  phaseValue: SharedValue<number>;
  phase: RefreshPhase;
  label?: string;
  successLabel?: string;
};

const ACCENT = '#DC2626';   // red
const SUCCESS = '#10B981';  // emerald

export function RefreshBar({
  pullProgress,
  phaseValue,
  phase,
  label = 'Duke u rifreskuar…',
  successLabel = 'U rifreskua!',
}: Props) {
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);

  // Spinner + pulsing dot loops while loading
  useEffect(() => {
    if (phase === 'loading') {
      spin.value = 0;
      spin.value = withRepeat(
        withTiming(1, { duration: 800, easing: Easing.linear }),
        -1,
        false,
      );
      pulse.value = withRepeat(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(spin);
      cancelAnimation(pulse);
      if (phase !== 'success') {
        spin.value = 0;
        pulse.value = 0;
      }
    }
    return () => {
      cancelAnimation(spin);
      cancelAnimation(pulse);
    };
  }, [phase, spin, pulse]);

  // Container height bound to pullProgress
  const containerStyle = useAnimatedStyle(() => ({
    height: pullProgress.value,
    opacity: interpolate(pullProgress.value, [0, 12], [0, 1], 'clamp'),
  }));

  // PULL phase content (visible when phaseValue ≈ 0)
  const pullContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(phaseValue.value, [0, 0.5], [1, 0], 'clamp'),
    transform: [
      { translateY: interpolate(phaseValue.value, [0, 1], [0, -6]) },
      { scale: interpolate(phaseValue.value, [0, 1], [1, 0.92]) },
    ],
  }));

  // LOADING phase content (visible when phaseValue ≈ 1)
  const loadingContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(phaseValue.value, [0.4, 1, 1.5], [0, 1, 0], 'clamp'),
    transform: [
      { translateY: interpolate(phaseValue.value, [0.5, 1], [4, 0]) },
    ],
  }));

  // SUCCESS phase content (visible when phaseValue ≈ 2)
  const successContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(phaseValue.value, [1.5, 2], [0, 1], 'clamp'),
    transform: [
      { translateY: interpolate(phaseValue.value, [1.5, 2], [4, 0]) },
      { scale: interpolate(phaseValue.value, [1.5, 1.85, 2], [0.7, 1.08, 1]) },
    ],
  }));

  // Pull-phase ring rotates with pull amount
  const pullRingStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(pullProgress.value, [0, PULL_THRESHOLD], [0, 270], 'clamp')}deg`,
      },
    ],
  }));

  // Loading-phase spinner
  const spinRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  // Pulsing dot beside the loading label
  const pulseDotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.4, 1]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.8, 1.15]) }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Center stack — three phase layers absolutely positioned */}
      <View style={styles.stack}>
        {/* PULL phase */}
        <Animated.View style={[styles.row, pullContentStyle]} pointerEvents="none">
          <View style={styles.ringTrack}>
            <Animated.View style={[styles.ring, pullRingStyle]} />
          </View>
        </Animated.View>

        {/* LOADING phase */}
        <Animated.View style={[styles.row, loadingContentStyle]} pointerEvents="none">
          <View style={styles.ringTrack}>
            <Animated.View style={[styles.ring, spinRingStyle]} />
          </View>
          <Animated.View style={[styles.pulseDot, pulseDotStyle]} />
          <Text style={styles.label}>{label}</Text>
        </Animated.View>

        {/* SUCCESS phase */}
        <Animated.View style={[styles.row, successContentStyle]} pointerEvents="none">
          <View style={styles.checkBubble}>
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
          </View>
          <Text style={styles.successLabel}>{successLabel}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// Backwards-compat alias
export const RefreshOverlay = RefreshBar;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
    overflow: 'hidden',
  },
  stack: {
    flex: 1,
    minHeight: PULL_BAR_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 10,
  },
  ringTrack: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(220, 38, 38, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: ACCENT,
    borderRightColor: ACCENT,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  label: {
    color: '#0F172A',
    fontFamily: fonts.uiBold,
    fontSize: 12.5,
    letterSpacing: 0.2,
  },
  checkBubble: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: SUCCESS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successLabel: {
    color: SUCCESS,
    fontFamily: fonts.uiBold,
    fontSize: 13,
    letterSpacing: 0.2,
  },
});
