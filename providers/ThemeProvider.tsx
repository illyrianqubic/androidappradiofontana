import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { appSettings } from '../services/storage';
import { colors as lightColors } from '../constants/tokens';

type Theme = 'light' | 'dark';

export type ThemeColors = Record<keyof typeof lightColors, string>;

const THEME_KEY = 'app_theme';

const darkColors: ThemeColors = {
  primary: '#dc2626',
  primaryPressed: '#991b1b',
  primaryDeep: '#b91c1c',
  redTint: 'rgba(220,38,38,0.15)',
  redBorder: 'rgba(220,38,38,0.30)',
  navyFixed: '#0f172a',
  navy: '#f1f5f9',
  navyMid: '#cbd5e1',
  navyLight: '#94a3b8',
  navyMuted: '#64748b',
  navyTint: '#0f172a',
  surface: '#111A2E',
  surfaceSubtle: '#0B1220',
  surfaceElevated: '#1A2438',
  border: '#243049',
  borderSubtle: '#1e293b',
  text: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textTertiary: '#64748b',
  textFaint: '#94a3b8',
  bgScreen: '#0B1220',
  inkDark: '#f1f5f9',
  inkSoft: '#94a3b8',
  inkFaint: '#94a3b8',
  paper: '#1e293b',
  rule: '#334155',
};

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = appSettings.getItem(THEME_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    appSettings.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const setThemeExplicit = useCallback((t: Theme) => {
    setTheme(t);
  }, []);

  const isDark = theme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: setThemeExplicit, isDark, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
