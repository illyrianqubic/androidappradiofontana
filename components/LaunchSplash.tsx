import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { appIdentity, fonts } from '../design-tokens';

type LaunchSplashProps = {
  onReady: () => void;
  onComplete: () => void;
};

const ANIMATION_DURATION_MS = 2000;

export function LaunchSplash({ onReady, onComplete }: LaunchSplashProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const layoutReportedRef = useRef(false);

  useEffect(() => {
    progress.setValue(0);

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: ANIMATION_DURATION_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished) {
        onComplete();
      }
    });

    return () => {
      animation.stop();
    };
  }, [onComplete, progress]);

  const onLayout = useCallback(() => {
    if (layoutReportedRef.current) {
      return;
    }

    layoutReportedRef.current = true;
    onReady();
  }, [onReady]);

  const progressWidth = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
      }),
    [progress],
  );

  return (
    <View onLayout={onLayout} style={styles.screen}>
      <View style={styles.logoWrap}>
        <Image source={appIdentity.logo} contentFit="cover" style={styles.logo} />
      </View>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      <Text style={styles.loadingText}>Po ngarkohet...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 120,
    paddingHorizontal: 24,
  },
  logoWrap: {
    width: 220,
    height: 220,
    borderRadius: 44,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 200,
    height: 200,
    borderRadius: 38,
  },
  progressTrack: {
    marginTop: 28,
    width: 240,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#60a5fa',
  },
  loadingText: {
    marginTop: 12,
    color: '#9ca3af',
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    letterSpacing: 0.2,
  },
});