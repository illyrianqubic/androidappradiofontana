import { Platform } from 'react-native';
import { appSettings } from '../storage';

const APP_ICON_KEY = 'app_icon_preference';

let setAppIconNative: ((iconName: 'light' | 'dark') => Promise<void>) | null = null;

function getNativeModule() {
  if (setAppIconNative) return setAppIconNative;
  // Icon switching works on Android (activity-alias) and iOS
  // (UIApplication.setAlternateIconName with the LightIcon appiconset that
  // plugins/with-dynamic-app-icon.js installs into Images.xcassets and
  // declares via ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES — actool
  // generates the CFBundleAlternateIcons plist entry at build time).
  // Web has no native module at all.
  if (Platform.OS === 'web') return null;
  try {
    const DynamicAppIcon = require('../../modules/dynamic-app-icon').default;
    if (DynamicAppIcon?.setAppIcon) {
      setAppIconNative = DynamicAppIcon.setAppIcon.bind(DynamicAppIcon);
      return setAppIconNative;
    }
  } catch {
    // Module not available (Expo Go, web, or missing native build)
  }
  return null;
}

export function getSavedAppIcon(): 'light' | 'dark' {
  // MMKV can be unavailable for a beat on cold start (native module not yet
  // bridged — seen on iOS dev clients). Fall back to the default icon rather
  // than crashing (same pattern as ThemeProvider's theme read).
  try {
    const saved = appSettings.getItem(APP_ICON_KEY);
    return saved === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveAppIconPreference(icon: 'light' | 'dark') {
  try {
    appSettings.setItem(APP_ICON_KEY, icon);
  } catch {
    // Best-effort persistence — see the guard above.
  }
}

export async function setAppIcon(icon: 'light' | 'dark'): Promise<boolean> {
  saveAppIconPreference(icon);
  const nativeSetAppIcon = getNativeModule();
  if (!nativeSetAppIcon) return false;
  try {
    await nativeSetAppIcon(icon);
    return true;
  } catch {
    return false;
  }
}

export function isAppIconSwitchingAvailable(): boolean {
  return getNativeModule() !== null;
}
