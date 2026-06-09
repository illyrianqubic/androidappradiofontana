import { Platform } from 'react-native';
import { appSettings } from '../storage';

const APP_ICON_KEY = 'app_icon_preference';

let setAppIconNative: ((iconName: 'light' | 'dark') => Promise<void>) | null = null;

function getNativeModule() {
  if (setAppIconNative) return setAppIconNative;
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
  const saved = appSettings.getItem(APP_ICON_KEY);
  return saved === 'light' ? 'light' : 'dark';
}

export function saveAppIconPreference(icon: 'light' | 'dark') {
  appSettings.setItem(APP_ICON_KEY, icon);
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
