# Theme Consistency Audit — RTV Fontana
**Date:** 2026-05-26  
**Scope:** All TSX/TS files in `app/`, `components/`, `providers/`, `constants/`, `services/`  
**Theme system:** `ThemeProvider` + `lightColors`/`darkColors` in `constants/tokens.ts`, MMKV persistence, default dark

---

## Executive Summary

| Category | Count | Severity |
|----------|-------|----------|
| Critical dark-mode breakage | 2 | **High** |
| Static `colors` imports (won't react to toggle) | 4 | Medium |
| Hardcoded hex/rgba in theme-aware files | 18 locations | Medium–Low |
| Web-only hardcoded light theme | 1 file | **High** |
| Token naming confusion (potential future bugs) | 1 | Low |
| Dead code / unused tokens | 2 | Low |

**Overall assessment:** The native app is ~85 % theme-consistent. The two critical issues are:
1. **Radio card** on home screen becomes unreadable in dark mode (`colors.navy` flips to light while text stays white).
2. **Web home screen** (`index.web.tsx`) is almost entirely hardcoded for light theme — dark mode is effectively broken on web.

---

## 1. Critical Issues (Break Dark Mode)

### 1.1 `app/(tabs)/index.tsx` — Radio Card Background Flips
**Lines:** 1567, 1637, 1660, 1695

```tsx
radioCard: { backgroundColor: colors.navy },       // line 1567
radioEyebrow: { color: 'rgba(255,255,255,0.40)' }, // line 1637
radioMeta: { color: 'rgba(255,255,255,0.42)' },    // line 1660
radioPlayLabel: { color: 'rgba(255,255,255,0.40)' } // line 1695
```

**Problem:** `colors.navy` is `#0f172a` (dark) in light mode and `#f1f5f9` (light) in dark mode. The radio card text uses hardcoded white `rgba(255,255,255,...)`. In dark mode the card background becomes light-gray while the text remains white-ish — **low contrast, nearly invisible**.

**Fix options:**
- **A (Recommended):** Use a dedicated non-flipping token for the radio card, e.g. `lightColors.navy` or a new `radioCardBg: '#0f172a'`.
- **B:** Make radio card text theme-aware instead of hardcoded white.

---

### 1.2 `app/(tabs)/index.web.tsx` — Entire Screen Hardcoded Light
**Lines:** 441, 449, 451, 481, 492, 501, 522, 537, 544, 574, 579, 593, 619, 621, 632, 646, 696, 698, 708, 720, 765, 766 (and more)

The web home screen imports `useTheme` but only uses `isDark` for **logo switching**. All style objects use:
- Static import `colors` from `constants/tokens` (light palette only)
- Hardcoded hex values: `#FFFFFF`, `#E5E7EB`, `#000000`, `#F8FAFC`, `#F3F4F6`, `#EEF2F7`
- Hardcoded rgba: `rgba(255,255,255,0.28)`, `rgba(0,0,0,0.55)`, etc.

**Result:** Toggling to dark theme on web changes the logo but leaves the entire UI light. This is a complete dark-mode failure for the web build.

**Fix:** Convert `index.web.tsx` to the same `getStyles(colors)` factory pattern used in the native `index.tsx`. Remove all hardcoded hex values.

---

## 2. Static `colors` Imports (Won't React to Theme Toggle)

These files import the static `colors` object from `constants/tokens.ts` instead of using `useTheme()`. They will not re-render when the user toggles theme.

| File | Static usage | Impact | Severity |
|------|-------------|--------|----------|
| `components/audio/LiveDot.tsx` | `colors.primary` for ripple/dot | Same red in both themes — **visually fine**, but code smell | Low |
| `components/audio/EqualizerBars.tsx` | `color = colors.primary` default | Same red in both themes — **visually fine** | Low |
| `components/ui/RelativeTime.tsx` | `colors.textMuted` for base text | Light: `#64748b` vs Dark: `#94a3b8` — **wrong color in dark mode** | Medium |
| `components/audio/LiveBadge.tsx` | `TEXT_VARIANT_MAP` hardcodes `#ffffff` / `#dc2626` | Same values in both themes — **visually fine**, but not future-proof | Low |

**Fix:** Replace static imports with `useTheme()` hook. For `EqualizerBars` and `LiveDot` where the color is passed as a prop, use `colors.primary` from the consuming component (which already uses `useTheme()`).

---

## 3. Hardcoded Colors in Theme-Aware Files

These files use `useTheme()` but still contain hardcoded hex/rgba values. Most are minor, but a few degrade the dark-mode experience.

### 3.1 `app/_layout.tsx` — Error Boundary
**Lines:** 77–79
```tsx
wrap:  { backgroundColor: '#ffffff' },  // blinding white in dark mode
title: { color: '#dc2626' },           // fine
msg:   { color: '#374151' },           // fine on white, poor contrast
```
**Impact:** Only visible on crashes. Low priority.

### 3.2 `app/(tabs)/live.tsx`
**Lines:** 27, 244, 439, 449, 565
```tsx
eqBarStyle = { backgroundColor: '#dc2626' }          // same as primary — fine
color="#FFFFFF"                                        // play icon on dark card — fine
badgeDotPlaying: { backgroundColor: '#FFFFFF' }       // fine
badgeTextPlaying: { color: '#FFFFFF' }                // fine
eqOverlay: { backgroundColor: 'rgba(0,0,0,0.45)' }    // fine
```
**Impact:** All values work acceptably in both themes. Low priority.

### 3.3 `app/(tabs)/index.tsx` — Native Home (beyond radio card)
**Lines:** 1487, 1490, 1555, 1938, 2018, 2027, 2180, 2268
```tsx
breakingLabel:     { borderRightColor: 'rgba(255,255,255,0.18)' }   // on dark navy card — fine
breakingLabelText: { color: 'rgba(255,255,255,0.92)' }              // on dark navy card — fine
breakingTickerText:{ color: 'rgba(255,255,255,0.88)' }              // on dark navy card — fine
heroImageDivider:  { backgroundColor: 'rgba(10,15,28,0.07)' }      // on light bg ok; on dark bg too subtle
gridDivider:       { backgroundColor: 'rgba(0,0,0,0.025)' }        // very subtle — fine
rowDivider:        { backgroundColor: 'rgba(0,0,0,0.018)' }        // very subtle — fine
latestImageDivider:{ backgroundColor: 'rgba(10,15,28,0.06)' }      // on dark bg too subtle
gridFreshBadge:    { color: '#16A34A' }                             // brand green — fine
```
**Impact:** `heroImageDivider` and `latestImageDivider` become nearly invisible in dark mode. Minor visual issue.

### 3.4 `app/(tabs)/news/[slug].tsx` — Article Detail
**Lines:** 584, 644–645, 651–652, 960, 973, 992, 1084, 1135, 1145, 1160, 1482
```tsx
gradient fade:     colors={['transparent','transparent','rgba(251,249,244,0.0)',colors.paper]}  // paper adapts — ok
Facebook share:    bg="#1877F2" iconColor="#FFFFFF"   // brand color — intentional
WhatsApp share:    bg="#25D366" iconColor="#FFFFFF"   // brand color — intentional
Share FAB:         color="#FFFFFF"                    // on primary red — fine
lightboxOverlay:   { backgroundColor: '#000000' }     // fine
shareButtonPressed:{ backgroundColor: 'rgba(255,255,255,0.15)' }  // on black overlay — fine
lightbox close:    color="#fff"                       // on black overlay — fine
articleNavButton:  { backgroundColor: 'rgba(255,255,255,0.92)' }  // **white button in dark mode**
progressTrack:     { backgroundColor: 'rgba(220,38,38,0.10)' }    // fine
heroContainer:     { backgroundColor: '#0B0B0B' }     // cinematic black — intentional
relatedCardCatText:{ color: '#DC2626' }               // brand red — fine
```
**Impact:** `articleNavButton` (floating prev/next buttons) is white semi-transparent in dark mode. Should use theme-aware surface color.

### 3.5 `app/(tabs)/news/index.tsx` — News Feed
**Line:** 572
```tsx
imageDivider: { backgroundColor: 'rgba(10,15,28,0.06)' }  // too subtle in dark mode
```

### 3.6 `components/audio/LiveBadge.tsx`
**Lines:** 41–42, 47–49
```tsx
backgroundVariant: { backgroundColor: 'rgba(17,24,39,0.6)', borderColor: 'rgba(255,255,255,0.22)' }  // over-image — fine
TEXT_VARIANT_MAP:
  solid: { color: '#ffffff' }                    // on red bg — fine
  outlined: { color: '#dc2626' }                 // on transparent — fine
  'transparent-over-image': { color: '#ffffff' } // on image — fine
```

### 3.7 `components/ui/HamburgerDrawer.tsx`
**Lines:** 411, 422, 568, 674
```tsx
checkmark icon:    color="#fff"                     // on colored icon buttons — fine
overlay:           { backgroundColor: 'rgba(15,23,42,0.42)' }  // fine
categoryPanel:     { shadowColor: '#0f172a' }       // shadow — minor
```

---

## 4. Token Naming Confusion

| Token | Light value | Dark value | Risk |
|-------|------------|-----------|------|
| `colors.navy` | `#0f172a` (dark) | `#f1f5f9` (light) | Name implies "dark blue"; flips to near-white in dark mode. Used for radio card background → **breaks**. |
| `colors.inkDark` | `#0B1220` (dark) | `#f1f5f9` (light) | "Ink" implies dark; flips to light. Used for latest-closer CTA — works because it's on a light/dark surface, but confusing. |
| `colors.paper` | `#FBF9F4` (warm white) | `#1e293b` (slate) | Semantic name works in both. |
| `colors.surface` | `#FFFFFF` | `#121826` | Standard token, works well. |

**Recommendation:** Rename or document `colors.navy` and `colors.inkDark` to indicate they are theme-flipping (e.g., `colors.navy` → `colors.brandDark` or `colors.inkDark` → `colors.ink`). Alternatively, introduce non-flipping tokens for branded elements that must stay dark (e.g., `colors.brandNavyStatic: '#0f172a'`).

---

## 5. Web-Specific StatusBar

Both `app/_layout.tsx` and `app/_layout.web.tsx` correctly use:
```tsx
<StatusBar style={isDark ? 'light' : 'dark'} />
```
✅ No issue.

---

## 6. Logo Switching Verification

| Location | Method | Status |
|----------|--------|--------|
| Home navbar native | `isDark` ternary | ✅ |
| Home navbar web | `isDark` ternary | ✅ |
| Live screen | `isDark` ternary | ✅ |
| News index | `isDark` ternary | ✅ |
| Article nav | `isDark` ternary | ✅ |
| LaunchSplash | `appSettings.getItem('app_theme')` | ✅ (checks storage) |
| Audio notification | `appSettings.getItem('app_theme')` | ✅ (checks storage) |
| App icon (native) | `setAppIcon()` synced with toggle | ✅ |

---

## 7. Dead / Unused Code

| Item | Location | Note |
|------|---------|------|
| `surfaceSubtleOld` | `constants/tokens.ts` | Defined but never referenced. Safe to remove. |
| `latestCountChip` / `latestCountText` | `app/(tabs)/index.tsx` | Styles defined (lines 1788–1803) but never used in JSX. Safe to remove. |
| `logoandroid.png` | `assets/` | Referenced by `appIdentity.logo` in tokens, but `appIdentity` is never consumed. Safe to remove after verifying. |

---

## 8. Recommended Fix Priority

### P0 — Fix immediately
1. **`app/(tabs)/index.tsx` radio card** — Make background non-flipping or text theme-aware.
2. **`app/(tabs)/index.web.tsx`** — Convert to `getStyles(colors)` pattern; remove all hardcoded hex.

### P1 — Fix this week
3. **`components/ui/RelativeTime.tsx`** — Use `useTheme()` instead of static `colors.textMuted`.
4. **`app/(tabs)/news/[slug].tsx` articleNavButton** — Use theme-aware semi-transparent surface instead of `rgba(255,255,255,0.92)`.

### P2 — Fix next sprint
5. **`components/audio/LiveDot.tsx`** — Use `useTheme()` or receive color via prop.
6. **`components/audio/EqualizerBars.tsx`** — Same as above.
7. **`components/audio/LiveBadge.tsx`** — Drive `TEXT_VARIANT_MAP` from theme tokens.
8. **Image dividers** (`heroImageDivider`, `latestImageDivider`, `imageDivider` in news) — Use `colors.border` or `colors.borderSubtle` instead of hardcoded rgba.
9. **`app/_layout.tsx` error boundary** — Use theme-aware colors.

### P3 — Cleanup
10. Remove `surfaceSubtleOld` token.
11. Remove unused `latestCountChip` / `latestCountText` styles.
12. Remove unused `logoandroid.png` asset after confirming no references.

---

## 9. Appendix — Complete Hardcoded Color Inventory

### Hex values outside `constants/tokens.ts` and `ThemeProvider.tsx`

```
app/_layout.tsx
  #ffffff  (error boundary bg)
  #dc2626  (error boundary title)
  #374151  (error boundary msg)

app/(tabs)/index.tsx
  #16A34A  (grid fresh badge)

app/(tabs)/index.web.tsx
  #FFFFFF  (screen bg, header bg, hero card bg, popular card bg, latest card bg, quick link card bg)
  #E5E7EB  (header border)
  #000000  (header shadow)
  #F8FAFC  (header icon button)
  #F3F4F6  (hero image, popular image, latest image)
  #EEF2F7  (card borders)

app/(tabs)/live.tsx
  #dc2626  (eq bar)
  #FFFFFF  (play icon, badge dot, badge text)

app/(tabs)/news/[slug].tsx
  #1877F2  (Facebook share bg)
  #FFFFFF  (Facebook share icon, WhatsApp share icon, Share FAB icon)
  #25D366  (WhatsApp share bg)
  #fff     (lightbox close icon)
  #0B0B0B  (hero container bg)
  #DC2626  (related card category)

components/audio/LiveBadge.tsx
  #ffffff  (solid text)
  #dc2626  (outlined text)

components/ui/HamburgerDrawer.tsx
  #fff     (checkmark icons)
  #0f172a  (category panel shadow)
```

### Rgba values outside tokens

```
app/(tabs)/index.tsx
  rgba(255,255,255,0.18)  breaking label border
  rgba(255,255,255,0.92)  breaking label text
  rgba(255,255,255,0.88)  breaking ticker text
  rgba(255,255,255,0.40)  radio eyebrow
  rgba(255,255,255,0.42)  radio meta
  rgba(255,255,255,0.40)  radio play label
  rgba(10,15,28,0.07)    hero image divider
  rgba(0,0,0,0.025)      grid divider
  rgba(0,0,0,0.018)      row divider
  rgba(10,15,28,0.06)    latest image divider

app/(tabs)/index.web.tsx
  rgba(0,0,0,0.80)        hero gradient
  rgba(0,0,0,0.55)        hero category badge bg
  rgba(255,255,255,0.3)   hero tag badge border
  rgba(255,255,255,0.28)  breaking label border
  rgba(255,255,255,0.92)  breaking label text
  rgba(255,255,255,0.88)  breaking ticker text

app/(tabs)/live.tsx
  rgba(0,0,0,0.45)        eq overlay

app/(tabs)/news/[slug].tsx
  rgba(251,249,244,0.0)   hero gradient (paper fade)
  rgba(255,255,255,0.15)  share button pressed
  rgba(255,255,255,0.92)  article nav button
  rgba(220,38,38,0.10)    progress track

app/(tabs)/news/index.tsx
  rgba(10,15,28,0.06)     featured card image divider

components/audio/LiveBadge.tsx
  rgba(17,24,39,0.6)      background variant
  rgba(255,255,255,0.22)  border variant

components/ui/HamburgerDrawer.tsx
  rgba(15,23,42,0.42)     overlay
```

---

*End of audit report.*
