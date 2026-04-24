import { Platform } from 'react-native';

export const colors = {
  primary: '#dc2626',
  primaryPressed: '#b91c1c',
  surface: '#FFFFFF',
  surfaceSubtle: '#FAFAFA',
  border: '#E5E7EB',
  text: '#111827',
  textMuted: '#6B7280',
  textTertiary: '#9CA3AF',
  redTint: '#fef2f2',
} as const;

export const radius = {
  card: 14,
  button: 11,
  pill: 9999,
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
  tap: 150,
  ui: 250,
  screen: 450,
  spring: {
    stiffness: 300,
    damping: 30,
    mass: 1,
  },
} as const;

export const fonts = {
  uiRegular: 'InterVariable',
  uiMedium: 'InterVariableMedium',
  uiBold: 'InterVariableBold',
  articleRegular: 'MerriweatherVariable',
  articleBold: 'MerriweatherVariableBold',
} as const;

export const appIdentity = {
  name: 'Radio Fontana',
  stationName: 'Radio Fontana 98.8 FM',
  location: 'Istog, Kosovë',
  frequency: '98.8 FM',
  streamUrl: 'https://live.radiostreaming.al:8010/stream.mp3',
  logo: require('./assets/applogortvfontana.jpg'),
} as const;

export const elevation = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  floating: {
    shadowColor: '#000000',
    shadowOpacity: Platform.select({ ios: 0.15, android: 0.18, default: 0.12 }),
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;
