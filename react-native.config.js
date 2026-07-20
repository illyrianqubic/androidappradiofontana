// react-native-track-player is Android-only in this app. iOS playback uses
// expo-audio (services/audio/index.ios.ts), and RNTP's iOS pod
// (SwiftAudioEx 1.1.0, Swift 4.2-era sources) was repeatedly incriminated in
// this project's iOS startup-crash investigation (see git history). Excluding
// it from iOS autolinking keeps an unused, unmaintained native module out of
// every iOS binary — while Android keeps full RNTP functionality.
module.exports = {
  dependencies: {
    'react-native-track-player': {
      platforms: {
        ios: null,
      },
    },
  },
};
