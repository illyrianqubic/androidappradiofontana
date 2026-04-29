import { Platform } from 'react-native';

export const colors = {
  // ── Brand accent ────────────────────────────────────────────────────────────
  primary: '#dc2626',
  primaryPressed: '#991b1b',
  primaryDeep: '#b91c1c',
  redTint: '#fef2f2',
  redBorder: 'rgba(220,38,38,0.18)',

  // ── Dark navy (premium dark accent) ─────────────────────────────────────────
  navy: '#0f172a',
  navyMid: '#1e293b',
  navyLight: '#334155',
  navyMuted: '#64748b',
  navyTint: '#f1f5ff',

  // ── Surface ──────────────────────────────────────────────────────────────────
  surface: '#FFFFFF',
  surfaceSubtle: '#F8FAFC',
  surfaceElevated: '#F1F5F9',

  // ── Borders ──────────────────────────────────────────────────────────────────
  border: '#E2E8F0',
  borderSubtle: '#F1F5F9',

  // ── Text ─────────────────────────────────────────────────────────────────────
  text: '#0f172a',
  textSecondary: '#374151',
  textMuted: '#64748b',
  textTertiary: '#94a3b8',
  textFaint: '#cbd5e1',

  // ── Legacy compat ────────────────────────────────────────────────────────────
  surfaceSubtleOld: '#FAFAFA',
} as const;

export const radius = {
  card: 16,
  cardLarge: 22,
  button: 12,
  pill: 9999,
  sm: 8,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
} as const;

export const motion = {
  tap: 130,
  ui: 220,
  screen: 420,
  spring: {
    stiffness: 340,
    damping: 28,
    mass: 1,
  },
  springSnappy: {
    stiffness: 480,
    damping: 32,
    mass: 0.9,
  },
} as const;

export const fonts = {
  uiRegular: 'InterVariable',
  uiMedium: 'InterVariableMedium',
  uiBold: 'InterVariableBold',
  articleRegular: 'MerriweatherVariable',
  articleItalic: 'MerriweatherVariableItalic',
  articleBold: 'MerriweatherVariableBold',
  articleBlack: 'MerriweatherVariableBlack',
} as const;

export const appIdentity = {
  name: 'Radio Fontana',
  stationName: 'Radio Fontana 98.8 FM',
  location: 'Istog, Kosovë',
  frequency: '98.8 FM',
  streamUrl: 'https://live.radiostreaming.al:8010/stream.mp3',
  logo: require('./assets/logoandroid.jpg'),
} as const;

export const elevation = {
  card: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardStrong: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.13,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  floating: {
    shadowColor: '#000000',
    shadowOpacity: Platform.select({ ios: 0.15, android: 0.20, default: 0.14 }),
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
} as const;
