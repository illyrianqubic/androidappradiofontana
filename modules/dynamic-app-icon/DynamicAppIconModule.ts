import { requireNativeModule } from 'expo-modules-core';
import { DynamicAppIconModuleType } from './DynamicAppIcon.types';

const DynamicAppIcon = requireNativeModule<DynamicAppIconModuleType>('DynamicAppIcon');

export function setAppIcon(iconName: 'light' | 'dark'): Promise<void> {
  return DynamicAppIcon.setAppIcon(iconName);
}

export default DynamicAppIcon;
