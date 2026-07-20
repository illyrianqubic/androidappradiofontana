// SDK 57: the standalone expo-modules-core package is no longer installed —
// the expo package re-exports the same API.
import { requireNativeModule } from 'expo';
import { DynamicAppIconModuleType } from './DynamicAppIcon.types';

const DynamicAppIcon = requireNativeModule<DynamicAppIconModuleType>('DynamicAppIcon');

export function setAppIcon(iconName: 'light' | 'dark'): Promise<void> {
  return DynamicAppIcon.setAppIcon(iconName);
}

export default DynamicAppIcon;
