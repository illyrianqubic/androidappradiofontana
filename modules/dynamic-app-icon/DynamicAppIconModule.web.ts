import { DynamicAppIconModuleType } from './DynamicAppIcon.types';

const noopModule: DynamicAppIconModuleType = {
  setAppIcon: async () => {
    // No-op on web
  },
};

export default noopModule;
