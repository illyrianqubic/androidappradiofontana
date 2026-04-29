import { useCallback, useEffect, useRef, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

/**
 * usePullToRefresh — premium gesture-driven pull-to-refresh.
 *
 * Phases (drives `phase` SharedValue, 0 = idle, 1 = loading, 2 = success):
 *  - PULL  : pullProgress follows finger 1:1 up to threshold, rubber-band beyond
 *  - ARMED : threshold crossed → bounce spring engage + haptic + start refetch
 *  - LOAD  : bar held at full height while data refetches (min 2.5s)
 *  - DONE  : 800ms success state ("U rifreskua!" + checkmark)
 *  - CLOSE : soft spring back to 0
 */

export const PULL_THRESHOLD = 80;
export const PULL_BAR_H = 56;
export const PULL_MAX = 160;
export const MIN_LOADING_MS = 2500;
export const SUCCESS_MS = 800;

// Spring tunings
const ENGAGE_SPRING    = { damping: 14, stiffness: 220, mass: 0.5 } as const; // soft bounce
const SNAP_BACK_SPRING = { damping: 22, stiffness: 260, mass: 0.4 } as const; // crisp cancel
const CLOSE_SPRING     = { damping: 18, stiffness: 140, mass: 0.6 } as const; // gentle close

export type RefreshPhase = 'idle' | 'pulling' | 'loading' | 'success';

export type PullToRefreshHandle = {
  panGesture: ReturnType<typeof Gesture.Pan>;
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  pullProgress: SharedValue<number>;
  /** 0=idle 1=loading 2=success — drives RefreshOverlay's UI swap */
  phaseValue: SharedValue<number>;
  phase: RefreshPhase;
  refreshing: boolean;
  /** Increments each time a refresh completes — bind to a content fade key */
  refreshNonce: number;
};

export function usePullToRefresh(
  onRefresh: () => Promise<unknown> | unknown,
): PullToRefreshHandle {
  const [phase, setPhase] = useState<RefreshPhase>('idle');
  const [refreshNonce, setRefreshNonce] = useState(0);

  // UI-thread state
  const scrollY = useSharedValue(0);
  const pullProgress = useSharedValue(0);
  const armed = useSharedValue(false);
  const phaseValue = useSharedValue(0); // 0=idle 1=loading 2=success

  const refreshingRef = useRef(false);

  const fireHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, []);

  const fireSuccessHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);

  const triggerRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setPhase('loading');
    phaseValue.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) });
    fireHaptic();
    const startedAt = Date.now();
    try {
      await onRefresh();
    } finally {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
      if (remaining > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      }
      // Switch to success phase: checkmark + "U rifreskua!" for 800ms
      setPhase('success');
      phaseValue.value = withTiming(2, { duration: 220, easing: Easing.out(Easing.cubic) });
      fireSuccessHaptic();
      setRefreshNonce((n) => n + 1);
      await new Promise<void>((resolve) => setTimeout(resolve, SUCCESS_MS));
      // Close
      setPhase('idle');
      phaseValue.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) });
      pullProgress.value = withSpring(0, CLOSE_SPRING);
      armed.value = false;
      refreshingRef.current = false;
    }
  }, [onRefresh, pullProgress, armed, phaseValue, fireHaptic, fireSuccessHaptic]);

  // Live scroll offset
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // Pan gesture
  const panGesture = Gesture.Pan()
    .activeOffsetY([-9999, 8])
    .failOffsetX([-15, 15])
    .onUpdate((e) => {
      'worklet';
      if (armed.value) return;
      if (scrollY.value > 0.5 || e.translationY <= 0) {
        if (pullProgress.value > 0) pullProgress.value = 0;
        return;
      }
      const t = e.translationY;
      const progress = t <= PULL_THRESHOLD
        ? t
        : PULL_THRESHOLD + (t - PULL_THRESHOLD) * 0.5;
      pullProgress.value = Math.min(progress, PULL_MAX);

      if (pullProgress.value >= PULL_THRESHOLD) {
        armed.value = true;
        // Engage with a brief overshoot bounce, then settle to bar height
        pullProgress.value = withSequence(
          withSpring(PULL_BAR_H + 10, ENGAGE_SPRING),
          withSpring(PULL_BAR_H, ENGAGE_SPRING),
        );
        runOnJS(triggerRefresh)();
      }
    })
    .onEnd(() => {
      'worklet';
      if (!armed.value && pullProgress.value > 0) {
        pullProgress.value = withSpring(0, SNAP_BACK_SPRING);
      }
    })
    .onFinalize(() => {
      'worklet';
      if (!armed.value && pullProgress.value > 0) {
        pullProgress.value = withSpring(0, SNAP_BACK_SPRING);
      }
    });

  // Safety net: if phase resets to idle externally (shouldn't happen), close.
  useEffect(() => {
    if (phase === 'idle' && !armed.value && pullProgress.value > 0 && !refreshingRef.current) {
      pullProgress.value = withSpring(0, CLOSE_SPRING);
    }
  }, [phase, armed, pullProgress]);

  return {
    panGesture,
    scrollHandler,
    pullProgress,
    phaseValue,
    phase,
    refreshing: phase === 'loading' || phase === 'success',
    refreshNonce,
  };
}
