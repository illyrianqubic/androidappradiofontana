module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // No manual reanimated/worklets plugin: babel-preset-expo (SDK 57)
    // auto-detects react-native-worklets (reanimated 4.x) and adds
    // 'react-native-worklets/plugin' itself, exactly once. A manual
    // 'react-native-reanimated/plugin' entry here was the v3 pattern and
    // would double-apply the worklet transform (or break) under v4.
  };
};
