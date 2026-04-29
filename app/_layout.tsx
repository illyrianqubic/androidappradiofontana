import { Component, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  Merriweather_400Regular,
  Merriweather_400Regular_Italic,
  Merriweather_700Bold,
  Merriweather_900Black,
} from '@expo-google-fonts/merriweather';
import { QueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
} from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { LaunchSplash } from '../components/LaunchSplash';
import { MiniPlayerVisibilityGate } from '../components/MiniPlayer';
import { HamburgerDrawer } from '../components/HamburgerDrawer';
import { AudioProvider } from '../services/audio';
import { DrawerProvider } from '../context/DrawerContext';
import { queryStorage } from '../services/storage';
import { colors } from '../design-tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// ── Error boundary — catches any render crash and shows a readable message ────
type EBState = { error: string | null };
class RootErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err: unknown): EBState {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return { error: msg };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={ebStyles.wrap}>
          <Text style={ebStyles.title}>App crashed on startup</Text>
          <Text style={ebStyles.msg}>{this.state.error}</Text>
        </View>
      );
    }
    return this.props.children as React.ReactElement;
  }
}
const ebStyles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#dc2626', marginBottom: 12 },
  msg: { fontSize: 13, color: '#374151', textAlign: 'center', lineHeight: 20 },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      // H-B11: 1h gcTime instead of 24h. After dropping a screen, cached
      // payloads stay long enough for back-navigation hits but don't pin
      // multi-MB of stale post bodies / feeds in the V8 heap for the entire
      // session (a 30-min binge accumulated 2–4 MB before).
      gcTime: 1000 * 60 * 60,
      networkMode: 'offlineFirst',
      retry: 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: queryStorage,
  // C4: throttle persists to once per 10s instead of the 1s default. The
  // sync persister JSON.stringifies the entire dehydrated cache on the JS
  // thread (50–150ms on Cortex-A53 once the cache is non-trivial), so we
  // batch aggressively rather than write after every prefetch.
  throttleTime: 10_000,
});

// C4: skip persisting heavy / per-tab queries that bloat the cache and add
// nothing the app cannot recompute on next open.
//   - article body (`post-detail`) is up to 100KB+ of portable text
//   - per-category news feeds (`news-feed`) accumulate ~60KB per tab visited
//   - related posts re-derive instantly from cached categories
//   - secondary home rails (`home-popular`, `home-local`, `home-latest`)
//     refetch fast and don't need to survive cold start
//   - weather is a 30-min cached external API; refetching on cold start is fine
// R-2 / X-4: `home-hero` and `home-breaking` ARE persisted — they're tiny
// (~3 KB and ~8 KB respectively) and let cold start show real content in
// place of skeletons. The bulky home rails (latest/popular/local) are NOT
// persisted to keep the cache file small and JSON.parse fast on resume.
// C-A6: Set lookup is O(1) vs Array.includes O(n). The dehydrate predicate
// runs on every cache mutation across the entire cache.
const SKIP_PERSIST_KEYS: ReadonlySet<string> = new Set([
  'post-detail',
  'news-feed',
  'related-posts',
  'home-popular',
  'home-local',
  'home-latest',
  'weather-istog',
]);

// Stable references — moved out of render to prevent provider/navigator
// children from invalidating on every root re-render.
const PERSIST_OPTIONS = {
  persister,
  // X-7: persister.maxAge is the eviction TTL for the on-disk cache. Set to
  // 2× the in-memory gcTime (1 h) so a query stays on disk slightly longer
  // than it would in memory. Setting them equal made eviction order race-y
  // — a query could be GC'd from memory before the persister's next snapshot
  // wrote, leaving a stale on-disk entry past its in-memory lifetime.
  maxAge: 1000 * 60 * 60 * 2,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }) => {
      const root = query.queryKey[0];
      if (typeof root !== 'string') return true;
      return !SKIP_PERSIST_KEYS.has(root);
    },
  },
} as const;

const ROOT_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  animation: 'fade',
  contentStyle: { backgroundColor: colors.surface },
} as const;

const PLAYER_SCREEN_OPTIONS = {
  presentation: 'modal',
  animation: 'slide_from_bottom',
  gestureEnabled: true,
} as const;

// MiniPlayer host — isolates `usePathname()` so route changes only re-render
// the visibility gate (and not the audio-driven MiniPlayer body).
function MiniPlayerHost() {
  const router = useRouter();
  const onOpen = useCallback(() => router.push('/player' as never), [router]);
  return <MiniPlayerVisibilityGate onOpenPlayer={onOpen} />;
}

type StartupState = {
  showLaunchSplash: boolean;
  nativeSplashHidden: boolean;
};
const initialStartupState: StartupState = {
  showLaunchSplash: true,
  nativeSplashHidden: false,
};

export default function RootLayout() {
  const router = useRouter();
  // M24: single state object so the three startup transitions don't each
  // produce an independent root re-render.
  const [startup, setStartup] = useState<StartupState>(initialStartupState);
  const { showLaunchSplash, nativeSplashHidden } = startup;

  // S-3: NetInfo wiring removed — the @react-native-community/netinfo native
  // module isn't linked in Expo Go and even a guarded require() throws
  // synchronously from its top-level init. React Query's default always-
  // online mode is fine; refetchOnReconnect simply becomes a no-op until a
  // custom dev client / production build with the native module is used.

  // S-2: refetchOnAppForeground. When the user returns to the app after >5 min
  // in the background, invalidate the home queries so freshly published
  // breaking news appears. We track the timestamp the app went to background
  // and only invalidate if the gap exceeds the threshold — brief tab swaps
  // (notification shade, sharing) don't trigger network work.
  const backgroundedAtRef = useRef<number | null>(null);
  useEffect(() => {
    const FIVE_MIN = 5 * 60 * 1000;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        backgroundedAtRef.current = Date.now();
      } else if (next === 'active') {
        const since = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (since !== null && Date.now() - since > FIVE_MIN) {
          queryClient.invalidateQueries({ queryKey: ['home-hero'] });
          queryClient.invalidateQueries({ queryKey: ['home-breaking'] });
          queryClient.invalidateQueries({ queryKey: ['home-latest'] });
          queryClient.invalidateQueries({ queryKey: ['news-feed'] });
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Editorial article body uses Merriweather (loaded here so the article
  // detail screen can render its serif headlines + body without FOUT).
  const [interLoaded, interFontError] = useFonts({
    InterVariable: Inter_400Regular,
    InterVariableMedium: Inter_500Medium,
    InterVariableBold: Inter_700Bold,
    MerriweatherVariable: Merriweather_400Regular,
    MerriweatherVariableItalic: Merriweather_400Regular_Italic,
    MerriweatherVariableBold: Merriweather_700Bold,
    MerriweatherVariableBlack: Merriweather_900Black,
  });

  useEffect(() => {
    if ((interLoaded || interFontError) && !nativeSplashHidden) {
      setStartup((s) => ({ ...s, nativeSplashHidden: true }));
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [interLoaded, interFontError, nativeSplashHidden]);

  const onLaunchSplashComplete = useCallback(() => {
    setStartup((s) => ({ ...s, showLaunchSplash: false }));
    router.replace('/(tabs)' as never);
  }, [router]);

  if (!interLoaded && !interFontError) {
    return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
  }

  return (
    <RootErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={PERSIST_OPTIONS}>
          <AudioProvider>
            <DrawerProvider>
              <StatusBar style="dark" />

              <Stack screenOptions={ROOT_STACK_SCREEN_OPTIONS}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="rreth-nesh" />
                <Stack.Screen name="na-kontakto" />
                <Stack.Screen name="player" options={PLAYER_SCREEN_OPTIONS} />
              </Stack>

              <MiniPlayerHost />

              {showLaunchSplash ? (
                <LaunchSplash onComplete={onLaunchSplashComplete} />
              ) : null}

              <HamburgerDrawer />
            </DrawerProvider>
          </AudioProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
