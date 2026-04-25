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

      <Text style={styles.stationName}>Radio Fontana</Text>
      <Text style={styles.stationFrequency}>98.8 FM</Text>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 120,
    paddingHorizontal: 24,
  },
  logoWrap: {
    width: 144,
    height: 144,
    borderRadius: 30,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 118,
    height: 118,
    borderRadius: 24,
  },
  stationName: {
    marginTop: 22,
    color: '#ffffff',
    fontFamily: fonts.uiBold,
    fontSize: 30,
    letterSpacing: -0.3,
  },
  stationFrequency: {
    marginTop: 4,
    color: '#ffffff',
    fontFamily: fonts.uiMedium,
    fontSize: 20,
    letterSpacing: 0.4,
  },
  progressTrack: {
    marginTop: 28,
    width: 240,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#262626',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#dc2626',
  },
});