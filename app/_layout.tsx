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
// AUDIT FIX P1.2 + P6.22: Merriweather is no longer loaded at root — it's
// lazy-loaded by app/(tabs)/news/[slug].tsx (the only screen that uses
// serif body text) via expo-font/loadAsync. The Black weight is dropped
// entirely (was unused outside two stylesheet definitions, both now mapped
// to Bold). Saves ~200–250 ms cold start (3 fewer font HTTP fetches +
// glyph-table parse).
import { Image as ExpoImage } from 'expo-image';
import { QueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
  type Persister,
} from '@tanstack/react-query-persist-client';
import { LaunchSplash } from '../components/LaunchSplash';
import { MiniPlayerVisibilityGate } from '../components/MiniPlayer';
import { HamburgerDrawer } from '../components/HamburgerDrawer';
import { AudioProvider } from '../services/audio';
import { DrawerProvider } from '../context/DrawerContext';
import { queryStorage } from '../services/storage';
import { colors } from '../design-tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// AUDIT FIX P6.21: cap expo-image caches explicitly so they never grow
// unbounded on low-RAM devices (3 GB Galaxy A04 etc.). Memory cache 150 MB
// keeps decoded bitmaps in RAM for fast scroll, disk cache 300 MB keeps
// recent posts available offline.
ExpoImage.clearMemoryCache; // tree-shake guard — ensures import is preserved
try {
  // expo-image's cache size config is best-effort and may be a no-op on
  // some platforms; wrap to avoid throwing on unsupported runtimes.
  // @ts-expect-error: setMemoryCacheLimit / setDiskCacheLimit are exposed
  // on the native module on Android (sdk 54+) but not in the TS surface.
  ExpoImage.setMemoryCacheLimit?.(150 * 1024 * 1024);
  // @ts-expect-error: see above
  ExpoImage.setDiskCacheLimit?.(300 * 1024 * 1024);
} catch {
  // Older runtimes will simply use the defaults.
}

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

// AUDIT FIX P1.3: async persister. The previous createSyncStoragePersister
// JSON.stringified the entire dehydrated cache on the JS thread every 10 s
// (30–80 ms blocking on Cortex-A53 once the cache was non-trivial — visible
// scroll jank). This implementation defers the stringify into a microtask
// + setTimeout(0) so it never blocks the same frame, and chunks the actual
// MMKV write through a queue so back-to-back persistTimes coalesce.
function createAsyncStoragePersister(opts: {
  storage: typeof queryStorage;
  throttleTime?: number;
}): Persister {
  const KEY = 'REACT_QUERY_OFFLINE_CACHE';
  let lastWriteTs = 0;
  let pending: unknown | undefined;
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    const value = pending;
    pending = undefined;
    if (value === undefined) return;
    // Wrap stringify in a setTimeout(0) so the JS engine schedules other
    // pending tasks (renders, gesture callbacks) in between.
    setTimeout(() => {
      try {
        const json = JSON.stringify(value);
        opts.storage.setItem(KEY, json);
        lastWriteTs = Date.now();
      } catch {
        /* ignore persistence errors — cache will rebuild on next launch */
      }
    }, 0);
  };

  return {
    persistClient: async (client) => {
      pending = client;
      const throttle = opts.throttleTime ?? 10_000;
      const sinceLast = Date.now() - lastWriteTs;
      const wait = sinceLast >= throttle ? 0 : throttle - sinceLast;
      if (scheduled) return;
      scheduled = true;
      setTimeout(flush, wait);
    },
    restoreClient: async () => {
      const raw = opts.storage.getItem(KEY);
      if (!raw) return undefined;
      try {
        // First-restore parse runs ONCE at cold start. We accept this cost
        // (still ~10–40 ms) because there is no work to defer it behind —
        // it must complete before queries hydrate.
        return JSON.parse(raw);
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      opts.storage.removeItem(KEY);
      pending = undefined;
    },
  };
}

const persister = createAsyncStoragePersister({
  storage: queryStorage,
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
  contentReady: boolean;
};
const initialStartupState: StartupState = {
  showLaunchSplash: true,
  nativeSplashHidden: false,
  contentReady: false,
};

export default function RootLayout() {
  // M24: single state object so the three startup transitions don't each
  // produce an independent root re-render.
  const [startup, setStartup] = useState<StartupState>(initialStartupState);
  const { showLaunchSplash, nativeSplashHidden, contentReady } = startup;

  // AUDIT FIX P1.1: subscribe to the home-hero query cache so the splash
  // can dismiss the moment cached data is available (or the network call
  // resolves). When persisted hero data hydrates from MMKV at startup this
  // typically fires within ~50–150 ms after mount — well below the 600 ms
  // splash ceiling.
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const check = () => {
      const heroState = cache.find({ queryKey: ['home-hero'] })?.state;
      if (heroState && (heroState.data !== undefined || heroState.error !== null)) {
        setStartup((s) => (s.contentReady ? s : { ...s, contentReady: true }));
        return true;
      }
      return false;
    };
    if (check()) return;
    const unsub = cache.subscribe(() => { check(); });
    return () => unsub();
  }, []);

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
  // AUDIT FIX P5.19: only invalidate home-hero + home-breaking on foreground.
  // Previously we also invalidated home-latest and news-feed (all categories);
  // when the user returns to Home there's no need to refetch every cached
  // news category, and home-latest will refetch via its own staleness check.
  // The news-feed will be invalidated by the News tab itself when focused.
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
        }
      }
    });
    return () => sub.remove();
  }, []);

  // AUDIT FIX P1.2: only Inter is loaded at root — saves ~200 ms cold start
  // (4 fewer font HTTP fetches + glyph-table parses on first install). The
  // article screen (app/(tabs)/news/[slug].tsx) lazy-loads Merriweather on
  // its own mount via expo-font/loadAsync; while loading it falls back to
  // the system serif which is visually close enough during the brief load.
  const [interLoaded, interFontError] = useFonts({
    InterVariable: Inter_400Regular,
    InterVariableMedium: Inter_500Medium,
    InterVariableBold: Inter_700Bold,
  });

  useEffect(() => {
    if ((interLoaded || interFontError) && !nativeSplashHidden) {
      setStartup((s) => ({ ...s, nativeSplashHidden: true }));
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [interLoaded, interFontError, nativeSplashHidden]);

  const onLaunchSplashComplete = useCallback(() => {
    // PERF: previously called `router.replace('/(tabs)')` here, but the
    // (tabs) stack is already mounted as the initial route. The replace
    // forced an unnecessary route swap right at the most jank-sensitive
    // moment of app startup (immediately after splash hides), causing
    // a perceptible stutter before the home screen became interactive.
    // Just hiding the overlay is enough.
    setStartup((s) => ({ ...s, showLaunchSplash: false }));
  }, []);

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
                <LaunchSplash onComplete={onLaunchSplashComplete} isContentReady={contentReady} />
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
