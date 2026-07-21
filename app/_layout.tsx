import { Component, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
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
// lazy-loaded by app/article/[slug].tsx (the only screen that uses
// serif body text) via expo-font/loadAsync. The Black weight is dropped
// entirely (was unused outside two stylesheet definitions, both now mapped
// to Bold). Saves ~200–250 ms cold start (3 fewer font HTTP fetches +
// glyph-table parse).
import { Image as ExpoImage } from 'expo-image';
import { QueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
  type Persister,
  type PersistedClient,
} from '@tanstack/react-query-persist-client';
import { LaunchSplash } from '../components/ui/LaunchSplash';
import { HamburgerDrawer } from '../components/ui/HamburgerDrawer';
import { AudioProvider } from '../services/audio';
import { DrawerProvider } from '../providers/DrawerProvider';
import { appSettings, queryStorage } from '../services/storage';
import { ThemeProvider, useTheme } from '../providers/ThemeProvider';
import * as StoreReview from 'expo-store-review';

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
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children as React.ReactElement;
  }
}

function ErrorFallback({ error }: { error: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.primary, marginBottom: 12 }}>App crashed on startup</Text>
      <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>{error}</Text>
    </View>
  );
}

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
  // Old app versions persisted article bodies and every news category. Some
  // devices may still have a 500KB+ dehydrated blob on disk; parsing that on
  // startup blocks Hermes long before React can paint. If we see a legacy
  // oversized cache, drop it and let the small allowlisted cache rebuild.
  const MAX_RESTORE_CHARS = 250_000;
  let lastWriteTs = 0;
  let pending: unknown | undefined;
  let scheduled = false;

  // A query dehydrated while its fetch was still in flight (`status:
  // 'pending'`) carries a live `promise` field (see dehydrateQuery in
  // @tanstack/query-core). JSON.stringify has no way to serialize a Promise
  // — it round-trips to `{}` — so after JSON.parse, `promise` is a plain
  // object with no `.then`. TanStack's hydrate() calls `promise.then(...)`
  // unconditionally whenever that field is present, which throws
  // "promise.then is not a function" and aborts the whole restore (crash
  // seen on iOS right after the splash screen, when a query — e.g.
  // home-hero — happened to be persisted mid-fetch). Stripping the field
  // here means hydrate() always takes its `promise === undefined` path: the
  // query still hydrates with whatever data/state it had, just without an
  // in-flight refetch — which is fine, since the mounted component re-fires
  // its own query anyway.
  const stripUnresolvablePromises = (parsed: unknown): PersistedClient | undefined => {
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const clientState = (parsed as { clientState?: unknown }).clientState;
    if (typeof clientState !== 'object' || clientState === null) return undefined;
    const queries = (clientState as { queries?: unknown }).queries;
    if (Array.isArray(queries)) {
      for (const query of queries) {
        if (query && typeof query === 'object' && 'promise' in query) {
          delete (query as { promise?: unknown }).promise;
        }
      }
    }
    return parsed as PersistedClient;
  };

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
      if (!raw) {
        return undefined;
      }
      if (raw.length > MAX_RESTORE_CHARS) {
        opts.storage.removeItem(KEY);
        return undefined;
      }
      try {
        // First-restore parse runs ONCE at cold start. We accept this cost
        // (still ~10–40 ms) because there is no work to defer it behind —
        // it must complete before queries hydrate.
        const parsed = JSON.parse(raw);
        return stripUnresolvablePromises(parsed);
      } catch (error) {
        // Corrupted cache file (rare — happens after force-kill mid-write or
        // an unclean OTA update). Drop it so the next write replaces it with
        // a clean payload; surface in dev only.
        if (__DEV__) console.warn('[query-cache] restore parse failed; dropping cache', error);
        opts.storage.removeItem(KEY);
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
//   - article body (`post`) is up to 100KB+ of portable text
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
  'post',
  'news-feed',
  'related-posts',
  'home-popular',
  'home-local',
  'home-latest',
  'weather-istog',
]);

// Bump this if the persisted cache shape ever changes in a way old on-disk
// data can't safely hydrate into (e.g. a future TanStack Query major bump).
// persistQueryClientRestore compares this against the persisted value BEFORE
// calling hydrate(), so a version mismatch discards the cache up front
// instead of risking a hydrate-time crash.
const CACHE_BUSTER = 'v1';

// Stable references — moved out of render to prevent provider/navigator
// children from invalidating on every root re-render.
const PERSIST_OPTIONS = {
  persister,
  buster: CACHE_BUSTER,
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



// +not-found should never be visible — it just <Redirect>s to home. Disabling
// the animation prevents a brief flash of an empty fade transition when the
// OS delivers an unhandled deep link.
const NOT_FOUND_SCREEN_OPTIONS = {
  animation: 'none',
} as const;

type StartupState = {
  showLaunchSplash: boolean;
  nativeSplashHidden: boolean;
  contentReady: boolean;
};

const HOME_SHELL_READY_FALLBACK_MS = 120;

const initialStartupState: StartupState = {
  showLaunchSplash: true,
  nativeSplashHidden: false,
  contentReady: false,
};

export default function RootLayout() {
  return (
    <RootErrorBoundary>
      <ThemeProvider>
        <RootLayoutInner />
      </ThemeProvider>
    </RootErrorBoundary>
  );
}

function RootLayoutInner() {
  const { colors, isDark } = useTheme();
  // M24: single state object so the three startup transitions don't each
  // produce an independent root re-render.
  const [startup, setStartup] = useState<StartupState>(initialStartupState);
  const { showLaunchSplash, nativeSplashHidden, contentReady } = startup;

  const ROOT_STACK_SCREEN_OPTIONS = {
    headerShown: false,
    animation: 'fade',
    contentStyle: { backgroundColor: colors.surface },
  } as const;

  // Mark the root/Home visual shell as safe to reveal. A warm home-hero cache
  // can settle quickly, and the fallback keeps this gate network-independent so
  // the splash never waits for Sanity/weather/audio data.
  useEffect(() => {
    const setContentReady = () => {
      setStartup((s) => {
        if (s.contentReady) return s;
        return { ...s, contentReady: true };
      });
    };
    const cache = queryClient.getQueryCache();
    const check = () => {
      const heroState = cache.find({ queryKey: ['home-hero'] })?.state;
      if (heroState && (heroState.data !== undefined || heroState.error !== null)) {
        setContentReady();
        return true;
      }
      return false;
    };
    if (check()) return;
    // queryCache.subscribe fires synchronously inside TanStack's
    // getOptimisticResult, which runs during another component's render
    // (e.g. ArticleDetailScreen's useQuery). Calling setState directly from
    // there triggers React's "Cannot update a component while rendering a
    // different component" warning. Defer to a microtask so the state
    // update lands after the in-flight render commits.
    const unsub = cache.subscribe(() => {
      queueMicrotask(() => { check(); });
    });
    // Cold-start fallback: if MMKV cache is empty (first install), do not wait
    // for a Sanity response before the splash can exit. Unblock quickly so Home
    // renders with skeletons and data fills in as requests land.
    const fallback = setTimeout(() => {
      setContentReady();
    }, HOME_SHELL_READY_FALLBACK_MS);
    return () => {
      unsub();
      clearTimeout(fallback);
    };
  }, []);

  // S-3: NetInfo wiring removed — the @react-native-community/netinfo native
  // module isn't linked in Expo Go and even a guarded require() throws
  // synchronously from its top-level init. React Query's default always-
  // online mode is fine; refetchOnReconnect simply becomes a no-op until a
  // custom dev client / production build with the native module is used.
  //
  // AUDIT FIX (iOS): covers both focus-refetch and reconnect-refetch since
  // focusManager and onlineManager are not wired to AppState/NetInfo. A user
  // who was backgrounded long enough to plausibly have lost and regained
  // connectivity (subway, elevator) gets a full cache invalidation below,
  // not just the two home queries — everything currently mounted refetches
  // if it's stale. This piggybacks on the SAME >5 min gate as S-2 below
  // (not a new unconditional trigger): P5.19 deliberately narrowed this
  // effect to avoid invalidating on brief tab swaps (notification shade,
  // quick app-switcher peeks), and a blanket invalidateQueries() on every
  // 'active' transition would undo that — a quick swap to Messages and back
  // while reading an article would needlessly refetch it. Reconnect-after-
  // absence and foreground-after-absence are the same signal here, so they
  // share the same threshold.

  // S-2: refetchOnAppForeground. When the user returns to the app after >5 min
  // in the background, invalidate all queries so any content that went stale
  // while away (and any connectivity change) is caught. We track the
  // timestamp the app went to background and only invalidate if the gap
  // exceeds the threshold — brief tab swaps (notification shade, sharing)
  // don't trigger network work.
  // AUDIT FIX P5.19: only invalidate home-hero + home-breaking on foreground.
  // Previously we also invalidated home-latest and news-feed (all categories);
  // when the user returns to Home there's no need to refetch every cached
  // news category, and home-latest will refetch via its own staleness check.
  // The news-feed will be invalidated by the News tab itself when focused.
  // AUDIT FIX (iOS): broadened back to invalidateQueries() with no filter —
  // see the reconnect-coverage comment above. This still only fires past the
  // 5-minute threshold, so it isn't the same over-eager pattern P5.19 fixed;
  // it also doesn't force an immediate refetch of screens that aren't
  // mounted (invalidateQueries only marks cached data stale — a query only
  // refetches once something is actually observing it, e.g. the News tab
  // invalidating its own feed the next time it's focused).
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
          queryClient.invalidateQueries();
        }
      }
    });
    return () => sub.remove();
  }, []);

  // AUDIT FIX P1.2: only Inter is loaded at root — saves ~200 ms cold start
  // (4 fewer font HTTP fetches + glyph-table parses on first install). The
  // article screen (app/article/[slug].tsx) lazy-loads Merriweather on
  // its own mount via expo-font/loadAsync; while loading it falls back to the
  // system serif which is visually close enough during the brief load.
  const [interLoaded, interFontError] = useFonts({
    InterVariable: Inter_400Regular,
    InterVariableMedium: Inter_500Medium,
    InterVariableBold: Inter_700Bold,
  });

  useEffect(() => {
    if ((interLoaded || interFontError) && !nativeSplashHidden) {
      setStartup((s) => ({ ...s, nativeSplashHidden: true }));
    }
  }, [interLoaded, interFontError, nativeSplashHidden]);

  // Fires once LaunchSplash's root view has actually laid out on the native
  // side, instead of hideAsync() firing on font-load alone — closes the gap
  // where the native splash could be removed before LaunchSplash has painted
  // a replacement frame.
  const onNativeSplashReady = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  const contentOpacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const onLaunchSplashExitStart = useCallback(() => {
    if (reducedMotion) {
      contentOpacity.value = 1;
      return;
    }
    const t = setTimeout(() => {
      contentOpacity.value = withTiming(1, {
        duration: 350,
        easing: Easing.out(Easing.quad),
      });
    }, 100);
    return () => clearTimeout(t);
  }, [contentOpacity, reducedMotion]);

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const onLaunchSplashComplete = useCallback(() => {
    // PERF: previously called `router.replace('/(tabs)')` here, but the
    // (tabs) stack is already mounted as the initial route. The replace
    // forced an unnecessary route swap right at the most jank-sensitive
    // moment of app startup (immediately after splash hides), causing
    // a perceptible stutter before the home screen became interactive.
    // Just hiding the overlay is enough.
    setStartup((s) => ({ ...s, showLaunchSplash: false }));
  }, []);

  // Rate-app prompt: count opens and request a review after 5 launches.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      const count = parseInt(appSettings.getItem('app_open_count') ?? '0', 10);
      appSettings.setItem('app_open_count', String(count + 1));
    } catch {
      // Silently ignore storage errors.
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (showLaunchSplash) return;
    void (async () => {
      try {
        const count = parseInt(appSettings.getItem('app_open_count') ?? '0', 10);
        const alreadyShown = appSettings.getItem('rate_prompt_shown') === 'true';
        if (count >= 5 && !alreadyShown) {
          const available = await StoreReview.isAvailableAsync();
          if (available) {
            await StoreReview.requestReview();
          }
          appSettings.setItem('rate_prompt_shown', 'true');
        }
      } catch {
        // Silently ignore — rate prompt is best-effort.
      }
    })();
  }, [showLaunchSplash]);

  if (!interLoaded && !interFontError) {
    // Hardcoded (not colors.bgScreen) so this matches the native splash's
    // #0B1220 background in light theme too, not just dark.
    return <View style={{ flex: 1, backgroundColor: '#0B1220' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgScreen }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={PERSIST_OPTIONS}
        >
          <AudioProvider>
            <DrawerProvider>
              {/* AUDIT FIX (iOS): LaunchSplash's background always starts at the
                  same dark navy as the native splash (see LaunchSplash.tsx),
                  regardless of the saved theme — that's needed for a seamless
                  native->JS splash handoff with no visible color jump. But a
                  light-theme user's StatusBar would otherwise switch to 'dark'
                  (dark icons) immediately on mount, rendering dark-on-dark and
                  nearly invisible for the full splash duration. Force 'light'
                  while the splash is up; resume theme-driven style once it exits. */}
              <StatusBar style={showLaunchSplash ? 'light' : (isDark ? 'light' : 'dark')} />

              <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>
                <Stack screenOptions={ROOT_STACK_SCREEN_OPTIONS}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="rreth-nesh" />
                  <Stack.Screen name="na-kontakto" />
                  <Stack.Screen
                    name="article/[slug]"
                    options={{ headerShown: false, animation: 'slide_from_right', animationDuration: 200 }}
                  />
                  {/* Catch-all for OS-delivered deep links the app does not handle
                      (e.g. rtvfontana://notification.click on Samsung One UI).
                      The +not-found route silently redirects to home. */}
                  <Stack.Screen name="+not-found" options={NOT_FOUND_SCREEN_OPTIONS} />
                </Stack>

                <HamburgerDrawer />
              </Animated.View>

              {showLaunchSplash ? (
                <LaunchSplash
                  onComplete={onLaunchSplashComplete}
                  onExitStart={onLaunchSplashExitStart}
                  onNativeSplashReady={onNativeSplashReady}
                  isContentReady={contentReady}
                />
              ) : null}
            </DrawerProvider>
          </AudioProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
