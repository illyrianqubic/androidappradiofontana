import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
type UIContextValue = {
  /** When true, MiniPlayer slides off-screen (e.g. while reading an article). */
  miniPlayerHidden: boolean;
  hideMiniPlayer: () => void;
  showMiniPlayer: () => void;
};

// ── Context ────────────────────────────────────────────────────────────────────
const UIContext = createContext<UIContextValue>({
  miniPlayerHidden: false,
  hideMiniPlayer: () => {},
  showMiniPlayer: () => {},
});

// ── Provider ───────────────────────────────────────────────────────────────────
export function UIProvider({ children }: { children: ReactNode }) {
  const [miniPlayerHidden, setMiniPlayerHidden] = useState(false);

  const hideMiniPlayer = useCallback(() => setMiniPlayerHidden(true), []);
  const showMiniPlayer = useCallback(() => setMiniPlayerHidden(false), []);

  return (
    <UIContext.Provider value={{ miniPlayerHidden, hideMiniPlayer, showMiniPlayer }}>
      {children}
    </UIContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useUI() {
  return useContext(UIContext);
}
