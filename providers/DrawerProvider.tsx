import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

type DrawerContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  // Slide progress lives in the provider so the animation can be kicked off
  // synchronously from the press handler — bypassing React's render cycle.
  // Without this, withTiming was scheduled inside HamburgerDrawer's useEffect
  // (which only fires AFTER React commits the isOpen change). On a busy home
  // screen React 19's concurrent renderer can defer that commit by seconds,
  // producing a long freeze between tap and animation start.
  progress: SharedValue<number>;
};

const OPEN_DURATION = 220;
const CLOSE_DURATION = 160;
const OPEN_EASING = Easing.out(Easing.poly(4));
const CLOSE_EASING = Easing.in(Easing.cubic);

const noopSv = { value: 0 } as unknown as SharedValue<number>;

const DrawerContext = createContext<DrawerContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
  progress: noopSv,
});

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const progress = useSharedValue(0);
  // We need to know the current open state in the toggle worklet without
  // depending on stale closures. A ref keeps it always-current.
  const isOpenRef = useRef(false);

  const open = useCallback(() => {
    if (isOpenRef.current) return;
    isOpenRef.current = true;
    cancelAnimation(progress);
    progress.value = withTiming(1, { duration: OPEN_DURATION, easing: OPEN_EASING });
    setIsOpen(true);
  }, [progress]);

  const close = useCallback(() => {
    if (!isOpenRef.current) return;
    isOpenRef.current = false;
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: CLOSE_DURATION, easing: CLOSE_EASING });
    setIsOpen(false);
  }, [progress]);

  const toggle = useCallback(() => {
    if (isOpenRef.current) {
      close();
    } else {
      open();
    }
  }, [open, close]);

  // H-B4: stable context value. Without useMemo every DrawerProvider render
  // produced a fresh object, busting React.memo on every consumer on every
  // parent re-render.
  const value = useMemo<DrawerContextValue>(
    () => ({ isOpen, open, close, toggle, progress }),
    [isOpen, open, close, toggle, progress],
  );

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer() {
  return useContext(DrawerContext);
}
