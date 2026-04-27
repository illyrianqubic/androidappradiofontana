import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, usePathname, useRouter } from 'expo-router';
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
  Merriweather_700Bold,
} from '@expo-google-fonts/merriweather';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
} from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { LaunchSplash } from '../components/LaunchSplash';
import { MiniPlayer } from '../components/MiniPlayer';
import { HamburgerDrawer } from '../components/HamburgerDrawer';
import { AudioProvider } from '../services/audio';
import { DrawerProvider } from '../context/DrawerContext';
import { queryStorage } from '../services/storage';
import { fetchLatestPosts } from '../services/api';
import { colors } from '../design-tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Fired once inside PersistQueryClientProvider so useQueryClient() is available.
// Prefetches the default news feed so the first visit is instant (served from cache).
function PrefetchOnMount() {
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ['news-feed', '', ''],
      queryFn: () => fetchLatestPosts('', '', 40),
      staleTime: 1000 * 60 * 5,
    }).catch(() => undefined);
  // Intentionally runs once on mount only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      networkMode: 'offlineFirst',
      retry: 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: queryStorage,
});

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [showLaunchSplash, setShowLaunchSplash] = useState(true);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);

  // Load Inter (UI) and Merriweather (article bodies) in parallel.
  // We do NOT block rendering on Merriweather — articles are never the first screen.
  const [interLoaded] = useFonts({
    InterVariable: Inter_400Regular,
    InterVariableMedium: Inter_500Medium,
    InterVariableBold: Inter_700Bold,
  });

  // Merriweather is only needed when reading an article. Load it opportunistically
  // in the background so it's ready when the user first opens an article.
  useFonts({
    MerriweatherVariable: Merriweather_400Regular,
    MerriweatherVariableBold: Merriweather_700Bold,
  });

  // Kick off the native splash hide as soon as Inter (UI fonts) are ready.
  useEffect(() => {
    if (interLoaded && !nativeSplashHidden) {
      setNativeSplashHidden(true);
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [interLoaded, nativeSplashHidden]);

  const onLaunchSplashComplete = useCallback(() => {
    setShowLaunchSplash(false);
    router.replace('/(tabs)' as never);
  }, [router]);

  // Don't block the tree on Inter either — show LaunchSplash over the top
  // so the user sees the branded screen immediately while fonts finish loading.
  if (!interLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 1000 * 60 * 60 * 24,
          }}
        >
          <AudioProvider>
            <DrawerProvider>
              <StatusBar style="dark" />
              <PrefetchOnMount />

              <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.surface } }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="article/[slug]"
                  options={{
                    animation: 'slide_from_right',
                    contentStyle: { backgroundColor: colors.surface },
                  }}
                />
                <Stack.Screen name="rreth-nesh" />
                <Stack.Screen name="na-kontakto" />
                <Stack.Screen name="programi" />
                <Stack.Screen
                  name="player"
                  options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                    gestureEnabled: true,
                  }}
                />
              </Stack>

              {pathname !== '/player' ? (
                <MiniPlayer onOpenPlayer={() => router.push('/player' as never)} />
              ) : null}

              {showLaunchSplash ? (
                <LaunchSplash onComplete={onLaunchSplashComplete} />
              ) : null}

              <HamburgerDrawer />
            </DrawerProvider>
          </AudioProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
