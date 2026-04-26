import { useEffect, useState } from 'react';
import {
  BackHandler,
  Dimensions,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeInRight,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAudio } from '../services/audio';
import { useDrawer } from '../context/DrawerContext';
import { LiveDot } from './LiveDot';
import { appIdentity, colors, fonts, radius, spacing } from '../design-tokens';

const LAJME_CATEGORIES = [
  { label: 'Politikë', slug: 'politike' },
  { label: 'Sport', slug: 'sport' },
  { label: 'Teknologji', slug: 'teknologji' },
  { label: 'Showbiz', slug: 'showbiz' },
  { label: 'Shëndetësi', slug: 'shendetesi' },
  { label: 'Nga Bota', slug: 'nga-bota' },
  { label: 'Biznes', slug: 'biznes' },
];

const CATEGORY_ITEM_H = 52;
const DROPDOWN_FULL_H = LAJME_CATEGORIES.length * CATEGORY_ITEM_H;

type SocialLink = { icon: string; color: string; url: string };
const SOCIAL_LINKS: SocialLink[] = [
  { icon: 'facebook', color: '#1877F2', url: 'https://www.facebook.com/rtvfontana' },
  { icon: 'instagram', color: '#E4405F', url: 'https://www.instagram.com/rtvfontana' },
  { icon: 'youtube', color: '#FF0000', url: 'https://www.youtube.com/@rtvfontana' },
  { icon: 'tiktok', color: '#010101', url: 'https://www.tiktok.com/@rtvfontana' },
];

export function HamburgerDrawer() {
  const { isOpen, close } = useDrawer();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { isPlaying } = useAudio();

  const drawerWidth = Math.round(windowWidth * 0.88);

  const [isVisible, setIsVisible] = useState(false);
  const [lajmeExpanded, setLajmeExpanded] = useState(false);

  // Start off-screen to the right (full window width so nothing bleeds on screen)
  const translateX = useSharedValue(windowWidth);
  const backdropOpacity = useSharedValue(0);
  const dropdownHeight = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      translateX.value = withSpring(0, { damping: 22, stiffness: 200, mass: 1 });
      backdropOpacity.value = withTiming(1, { duration: 300 });
    } else if (isVisible) {
      const targetX = windowWidth;
      translateX.value = withTiming(
        targetX,
        { duration: 250, easing: Easing.in(Easing.ease) },
        (finished) => {
          if (finished) runOnJS(setIsVisible)(false);
        },
      );
      backdropOpacity.value = withTiming(0, { duration: 250 });
      setLajmeExpanded(false);
      dropdownHeight.value = withTiming(0, { duration: 200 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, windowWidth]);

  // Android hardware back button
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, close]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.55,
  }));

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const dropdownStyle = useAnimatedStyle(() => ({
    height: dropdownHeight.value,
    overflow: 'hidden',
  }));

  const navigate = (path: string) => {
    close();
    router.push(path as never);
  };

  const toggleLajme = () => {
    const next = !lajmeExpanded;
    setLajmeExpanded(next);
    dropdownHeight.value = withTiming(next ? DROPDOWN_FULL_H : 0, {
      duration: 260,
      easing: next ? Easing.out(Easing.ease) : Easing.in(Easing.ease),
    });
  };

  const isHomeActive = pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/';
  const isLiveActive = pathname.includes('/live');
  const isNewsActive = pathname.includes('/news');

  if (!isVisible) return null;

  // Stagger counter — reset each render, consistent ordering
  let si = 0;
  const s = (extra = 0) => (si++ + extra) * 48;

  return (
    // Clipping container: positioned between status bar and tab bar
    <View
      style={[
        styles.container,
        {
          top: insets.top,
          width: windowWidth,
          height: windowHeight - insets.top - (72 + insets.bottom),
        },
      ]}
      pointerEvents="box-none"
    >
      {/* Dimming backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        pointerEvents="auto"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[styles.panel, { width: drawerWidth }, drawerStyle]}
        pointerEvents="auto"
      >
        {/* Bottom shadow strip — casts shadow toward the tab bar */}
        <View style={styles.panelBottomShadow} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: 20, paddingBottom: 24 },
          ]}
        >
          {/* ── DRAWER HEADER ── */}
          <Animated.View entering={FadeIn.delay(s()).duration(220)} style={styles.drawerHeader}>
            <Image source={appIdentity.logo} contentFit="cover" style={styles.headerLogo} />
            <View style={styles.headerTextBlock}>
              <Text style={styles.headerStationName}>{appIdentity.stationName}</Text>
              <Text style={styles.headerLocation}>{appIdentity.location}</Text>
            </View>
            {isPlaying && (
              <View style={styles.liveDotWrap}>
                <LiveDot size={10} />
                <Text style={styles.liveDotLabel}>LIVE</Text>
              </View>
            )}
          </Animated.View>

          <View style={styles.divider} />

          {/* ── NAVIGATION ── */}
          <Animated.View entering={FadeInRight.delay(s()).duration(180)}>
            <Text style={styles.sectionLabel}>NAVIGIMI</Text>
          </Animated.View>

          {/* Kryefaqja */}
          <Animated.View entering={FadeInRight.delay(s()).duration(180)}>
            <Pressable
              onPress={() => navigate('/(tabs)')}
              style={[styles.navItem, isHomeActive && styles.navItemActive]}
            >
              {isHomeActive && <View style={styles.activeBar} />}
              <Ionicons
                name="home-outline"
                size={22}
                color={isHomeActive ? colors.primary : colors.textMuted}
                style={styles.navIcon}
              />
              <Text style={[styles.navLabel, isHomeActive && styles.navLabelActive]}>
                Kryefaqja
              </Text>
            </Pressable>
          </Animated.View>

          {/* Drejtpërdrejt */}
          <Animated.View entering={FadeInRight.delay(s()).duration(180)}>
            <Pressable
              onPress={() => navigate('/(tabs)/live')}
              style={[styles.navItem, isLiveActive && styles.navItemActive]}
            >
              {isLiveActive && <View style={styles.activeBar} />}
              <Ionicons
                name="radio-outline"
                size={22}
                color={isLiveActive ? colors.primary : colors.textMuted}
                style={styles.navIcon}
              />
              <Text style={[styles.navLabel, isLiveActive && styles.navLabelActive]}>
                Drejtpërdrejt
              </Text>
            </Pressable>
          </Animated.View>

          {/* Lajme + dropdown toggle */}
          <Animated.View entering={FadeInRight.delay(s()).duration(180)}>
            <Pressable
              onPress={toggleLajme}
              style={[styles.navItem, isNewsActive && styles.navItemActive]}
            >
              {isNewsActive && <View style={styles.activeBar} />}
              <Ionicons
                name="newspaper-outline"
                size={22}
                color={isNewsActive ? colors.primary : colors.textMuted}
                style={styles.navIcon}
              />
              <Text style={[styles.navLabel, isNewsActive && styles.navLabelActive, styles.navLabelFlex]}>
                Lajme
              </Text>
              <Ionicons
                name={lajmeExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textMuted}
              />
            </Pressable>
          </Animated.View>

          {/* Category dropdown */}
          <Animated.View style={[styles.dropdownWrap, dropdownStyle]}>
            {LAJME_CATEGORIES.map((cat) => (
              <Pressable
                key={cat.slug}
                onPress={() => navigate('/(tabs)/news')}
                style={({ pressed }) => [styles.categoryItem, pressed && styles.categoryItemPressed]}
              >
                <View style={styles.categoryDot} />
                <Text style={styles.categoryLabel}>{cat.label}</Text>
              </Pressable>
            ))}
          </Animated.View>

          <View style={styles.divider} />

          {/* ── QUICK ACCESS ── */}
          <Animated.View entering={FadeInRight.delay(s()).duration(180)}>
            <Text style={styles.sectionLabel}>QASJA E SHPEJTË</Text>
          </Animated.View>

          <Animated.View entering={FadeInRight.delay(s()).duration(180)}>
            <Pressable
              onPress={() => navigate('/programi')}
              style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
            >
              <Text style={styles.navEmoji}>📅</Text>
              <Text style={styles.navLabel}>Programi</Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInRight.delay(s()).duration(180)}>
            <Pressable
              onPress={() => navigate('/(tabs)/live')}
              style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
            >
              <Text style={styles.navEmoji}>🔴</Text>
              <Text style={styles.navLabel}>Live 24/7</Text>
            </Pressable>
          </Animated.View>

          <View style={styles.divider} />

          {/* ── INFO ── */}
          <Animated.View entering={FadeInRight.delay(s()).duration(180)}>
            <Text style={styles.sectionLabel}>INFORMACION</Text>
          </Animated.View>

          <Animated.View entering={FadeInRight.delay(s()).duration(180)}>
            <Pressable
              onPress={() => navigate('/rreth-nesh')}
              style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
            >
              <Ionicons
                name="information-circle-outline"
                size={22}
                color={colors.textMuted}
                style={styles.navIcon}
              />
              <Text style={styles.navLabel}>Rreth Nesh</Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInRight.delay(s()).duration(180)}>
            <Pressable
              onPress={() => navigate('/na-kontakto')}
              style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
            >
              <Ionicons
                name="call-outline"
                size={22}
                color={colors.textMuted}
                style={styles.navIcon}
              />
              <Text style={styles.navLabel}>Na Kontakto</Text>
            </Pressable>
          </Animated.View>

          <View style={styles.divider} />

          {/* ── SOCIAL ── */}
          <Animated.View entering={FadeInRight.delay(s()).duration(180)}>
            <Text style={styles.sectionLabel}>RRJETET SOCIALE</Text>
          </Animated.View>

          <Animated.View entering={FadeInRight.delay(s()).duration(180)} style={styles.socialRow}>
            {SOCIAL_LINKS.map((link) => (
              <Pressable
                key={link.icon}
                onPress={() => Linking.openURL(link.url).catch(() => undefined)}
                style={({ pressed }) => [
                  styles.socialButton,
                  { borderColor: link.color + '44' },
                  pressed && { backgroundColor: link.color + '18', transform: [{ scale: 0.93 }] },
                ]}
              >
                <MaterialCommunityIcons
                  name={link.icon as 'facebook'}
                  size={24}
                  color={link.color}
                />
              </Pressable>
            ))}
          </Animated.View>

          <View style={styles.divider} />

          {/* ── CONTACT ── */}
          <Animated.View entering={FadeInRight.delay(s()).duration(180)} style={styles.contactBlock}>
            <Pressable
              onPress={() => Linking.openURL('tel:+38344150027').catch(() => undefined)}
              style={styles.contactRow}
            >
              <Ionicons name="call-outline" size={16} color={colors.textMuted} />
              <Text style={styles.contactText}>+383 44 150 027</Text>
            </Pressable>

            <Pressable
              onPress={() => Linking.openURL('mailto:rtvfontana@gmail.com').catch(() => undefined)}
              style={styles.contactRow}
            >
              <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
              <Text style={styles.contactText}>rtvfontana@gmail.com</Text>
            </Pressable>

            <View style={styles.contactRow}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={styles.contactText}>08:00 – 20:00</Text>
            </View>
          </Animated.View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  backdrop: {
    backgroundColor: '#000000',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: -6, height: 0 },
    elevation: 20,
  },
  scrollContent: {
    paddingHorizontal: 0,
  },
  panelBottomShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 1,
  },
  // ── Header ──
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  headerLogo: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  headerTextBlock: {
    flex: 1,
  },
  headerStationName: {
    color: '#111827',
    fontFamily: fonts.uiBold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  headerLocation: {
    marginTop: 2,
    color: '#6B7280',
    fontFamily: fonts.uiRegular,
    fontSize: 12,
  },
  liveDotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDotLabel: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  // ── Divider ──
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
    marginHorizontal: 20,
  },
  // ── Section label ──
  sectionLabel: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    color: '#9CA3AF',
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  // ── Nav items ──
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 20,
    paddingVertical: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  navItemActive: {
    backgroundColor: '#fef2f2',
  },
  navItemPressed: {
    backgroundColor: '#F9FAFB',
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  navIcon: {
    marginRight: 14,
  },
  navEmoji: {
    fontSize: 22,
    width: 22,
    marginRight: 14,
    textAlign: 'center',
  },
  navLabel: {
    color: '#6B7280',
    fontFamily: fonts.uiMedium,
    fontSize: 15,
    lineHeight: 22,
    flexShrink: 1,
  },
  navLabelActive: {
    color: colors.primary,
    fontFamily: fonts.uiBold,
  },
  navLabelFlex: {
    flex: 1,
  },
  // ── Dropdown ──
  dropdownWrap: {
    overflow: 'hidden',
    backgroundColor: '#FAFAFA',
    borderLeftWidth: 2,
    borderLeftColor: '#E5E7EB',
    marginLeft: 20,
    marginRight: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: CATEGORY_ITEM_H,
    paddingHorizontal: 16,
    gap: 10,
  },
  categoryItemPressed: {
    backgroundColor: '#F3F4F6',
  },
  categoryDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#9CA3AF',
  },
  categoryLabel: {
    color: '#374151',
    fontFamily: fonts.uiRegular,
    fontSize: 14,
  },
  // ── Social ──
  socialRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
    flexWrap: 'wrap',
  },
  socialButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: '#FAFAFA',
  },
  // ── Contact ──
  contactBlock: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 14,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  contactText: {
    color: '#6B7280',
    fontFamily: fonts.uiRegular,
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
  },
});
