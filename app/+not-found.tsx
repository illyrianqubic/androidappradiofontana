import { Redirect } from 'expo-router';

// Catch-all for any unmatched URL. The OS may deliver odd deep links to the
// app's `radiofontana://` scheme — for example `radiofontana://notification.click`
// when the user taps the media-notification on some Android skins (Samsung One UI,
// MIUI). Without this file Expo Router would render its built-in
// "Unmatched Route" error screen. Since these synthetic links always come from
// the playback notification, bounce the user straight to the Live radio tab.
export default function NotFound() {
  return <Redirect href={'/(tabs)/live' as never} />;
}
