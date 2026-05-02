import { useCallback, useEffect, useState } from 'react';
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
import { QueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
  type Persister,
} from '@tanstack/react-query-persist-client';
import { LaunchSplash } from '../components/ui/LaunchSplash';
import { HamburgerDrawer } from '../components/ui/HamburgerDrawer';
import { AudioProvider } from '../services/audio';
import { DrawerProvider } from '../providers/DrawerProvider';
import { queryStorage } from '../services/storage';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60,
      networkMode: 'offlineFirst',
      retry: 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});

function createAsyncStoragePersister(opts: {
  storage: typeof queryStorage;
  throttleTime?: number;
}): Persister {
  const KEY = 'REACT_QUERY_OFFLINE_CACHE';
  const MAX_RESTORE_CHARS = 250_000;
  let lastWriteTs = 0;
  let pending: unknown | undefined;
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    const value = pending;
    pending = undefined;
    if (value === undefined) return;

    setTimeout(() => {
      try {
        opts.storage.setItem(KEY, JSON.stringify(value));
        lastWriteTs = Date.now();
      } catch {
        // Persistence is an optimization; queries can always refetch.
      }
    }, 0);
  };

  return {
    persistClient: async (client) => {
      pending = client;
      if (scheduled) return;
      const throttle = opts.throttleTime ?? 10_000;
      const sinceLast = Date.now() - lastWriteTs;
      scheduled = true;
      setTimeout(flush, sinceLast >= throttle ? 0 : throttle - sinceLast);
    },
    restoreClient: async () => {
      const raw = opts.storage.getItem(KEY);
      if (!raw) return undefined;
      if (raw.length > MAX_RESTORE_CHARS) {
        opts.storage.removeItem(KEY);
        return undefined;
      }
      try {
        return JSON.parse(raw);
      } catch {
        opts.storage.removeItem(KEY);
        return undefined;
      }
    },
    removeClient: async () => {
      pending = undefined;
      opts.storage.removeItem(KEY);
    },
  };
}

const persister = createAsyncStoragePersister({
  storage: queryStorage,
  throttleTime: 10_000,
});

const SKIP_PERSIST_KEYS: ReadonlySet<string> = new Set([
  'post-detail',
  'news-feed',
  'related-posts',
  'home-popular',
  'home-local',
  'home-latest',
  'weather-istog',
]);

const PERSIST_OPTIONS = {
  persister,
  maxAge: 1000 * 60 * 60 * 2,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }) => {
      const root = query.queryKey[0];
      if (typeof root !== 'string') return true;
      return !SKIP_PERSIST_KEYS.has(root);
    },
  },
} as const;

const ROOT_STACK_SCREEN_OPTIONS = { headerShown: false, animation: 'fade' } as const;

const PLAYER_SCREEN_OPTIONS = {
  presentation: 'modal',
  animation: 'slide_from_bottom',
  gestureEnabled: true,
} as const;

export default function RootLayout() {
  const [showLaunchSplash, setShowLaunchSplash] = useState(true);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);

  const [interLoaded] = useFonts({
    InterVariable: Inter_400Regular,
    InterVariableMedium: Inter_500Medium,
    InterVariableBold: Inter_700Bold,
  });

  useEffect(() => {
    if (interLoaded && !nativeSplashHidden) {
      setNativeSplashHidden(true);
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [interLoaded, nativeSplashHidden]);

  const onLaunchSplashComplete = useCallback(() => {
    setShowLaunchSplash(false);
  }, []);

  if (!interLoaded) {
    return null;
  }

  return (
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

              {showLaunchSplash ? (
                <LaunchSplash
                  onComplete={onLaunchSplashComplete}
                />
              ) : null}

              <HamburgerDrawer />
            </DrawerProvider>
          </AudioProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
