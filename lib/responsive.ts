/**
 * Responsive scaling utilities.
 *
 * All values are computed once at module load from the real device window size,
 * so StyleSheet.create() calls work correctly at any screen density.
 *
 * Reference design base: Pixel 7 / standard Android phone (393 × 851 dp).
 *
 * Orientation note: SCREEN_W / SCREEN_H are mutable and updated on Dimensions
 * "change" events so consumers reading them at runtime see current values. The
 * scale functions (s, vs, ms, wp, hp) close over the *current* W / H at call
 * time. Styles created via StyleSheet.create() at module load are NOT recomputed
 * on rotation — components that need rotation-reactive styles should read
 * useWindowDimensions() and inline the affected styles.
 */
import { Dimensions } from 'react-native';

let W = Dimensions.get('window').width;
let H = Dimensions.get('window').height;

const BASE_W = 393;
const BASE_H = 851;

/** Scale a value proportionally to screen width. */
export const s = (v: number): number => (v / BASE_W) * W;

/** Scale a value proportionally to screen height. */
export const vs = (v: number): number => (v / BASE_H) * H;

/**
 * Moderate scale — less aggressive than s().
 * Good for font sizes and padding.
 * factor=0 returns v unchanged; factor=1 equals s(v). Default 0.45.
 */
export const ms = (v: number, factor = 0.45): number => v + (s(v) - v) * factor;

/** Live screen dimensions (updated on rotation; see file header). */
export let SCREEN_W = W;
export let SCREEN_H = H;

/** Percentage of screen width. */
export const wp = (pct: number): number => W * (pct / 100);

/** Percentage of screen height. */
export const hp = (pct: number): number => H * (pct / 100);

// Keep dimensions in sync with the device. We never remove this listener — it
// lives for the entire app lifetime by design.
Dimensions.addEventListener('change', ({ window }) => {
  W = window.width;
  H = window.height;
  SCREEN_W = W;
  SCREEN_H = H;
});
