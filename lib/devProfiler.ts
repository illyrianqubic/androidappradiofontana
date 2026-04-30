/**
 * Dev-only performance profiler.
 *
 * All exports are no-ops when `__DEV__` is false, so production bundles pay
 * zero cost (Hermes will dead-code-eliminate the if-blocks that guard every
 * log call). Do NOT log from this file outside the `__DEV__` guards.
 *
 * USAGE
 *   import { devCount, devTimeStart, devTimeEnd, devLog } from '../lib/devProfiler';
 *
 *   devCount('Home.render');                  // increments + logs every N
 *   const t = devTimeStart('article.open');   // returns a token
 *   devTimeEnd(t);                            // logs ms since start
 *   devLog('audio', 'reconnect', { ... });    // categorised log
 *
 * Counters print on every increment for the first 5 hits, then every 10th
 * hit afterwards, so you see startup churn but logs don't drown the console
 * during steady-state scrolling.
 *
 * To turn ALL profiling off without removing call sites, set
 * `DEV_PROFILER_ENABLED = false` below and reload.
 */

const DEV_PROFILER_ENABLED = false;
const ENABLED = !!__DEV__ && DEV_PROFILER_ENABLED;

const counters = new Map<string, number>();
const lastLogged = new Map<string, number>();

function shouldLog(label: string, count: number): boolean {
  if (count <= 5) return true;
  if (count % 10 === 0) return true;
  // Throttle to at most 1 log per 250 ms per label past the first 5
  const now = Date.now();
  const last = lastLogged.get(label) ?? 0;
  if (now - last >= 250) {
    lastLogged.set(label, now);
    return true;
  }
  return false;
}

export function devCount(label: string, extra?: Record<string, unknown>): number {
  if (!ENABLED) return 0;
  const next = (counters.get(label) ?? 0) + 1;
  counters.set(label, next);
  if (shouldLog(label, next)) {
    if (extra) {
      // eslint-disable-next-line no-console
      console.log(`[PROF] ${label} #${next}`, extra);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[PROF] ${label} #${next}`);
    }
  }
  return next;
}

export function devGetCount(label: string): number {
  return counters.get(label) ?? 0;
}

export function devResetCounter(label: string): void {
  counters.delete(label);
  lastLogged.delete(label);
}

export function devResetAll(): void {
  counters.clear();
  lastLogged.clear();
}

export type DevTimeToken = { label: string; start: number } | null;

export function devTimeStart(label: string): DevTimeToken {
  if (!ENABLED) return null;
  return { label, start: Date.now() };
}

export function devTimeEnd(token: DevTimeToken, extra?: Record<string, unknown>): number {
  if (!ENABLED || !token) return 0;
  const dur = Date.now() - token.start;
  if (extra) {
    // eslint-disable-next-line no-console
    console.log(`[PROF] ⏱ ${token.label} ${dur}ms`, extra);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[PROF] ⏱ ${token.label} ${dur}ms`);
  }
  return dur;
}

export function devLog(category: string, msg: string, extra?: Record<string, unknown>): void {
  if (!ENABLED) return;
  if (extra) {
    // eslint-disable-next-line no-console
    console.log(`[PROF:${category}] ${msg}`, extra);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[PROF:${category}] ${msg}`);
  }
}

/** React hook: counts how many times a component renders. */
export function useDevRenderCount(label: string, extra?: Record<string, unknown>): number {
  if (!ENABLED) return 0;
  return devCount(`render:${label}`, extra);
}

/** Print a summary of all counters (call from a button or AppState listener). */
export function devDumpCounters(): void {
  if (!ENABLED) return;
  const entries = Array.from(counters.entries()).sort((a, b) => b[1] - a[1]);
  // eslint-disable-next-line no-console
  console.log('[PROF] ===== COUNTER DUMP =====');
  for (const [label, count] of entries) {
    // eslint-disable-next-line no-console
    console.log(`[PROF]   ${label}: ${count}`);
  }
  // eslint-disable-next-line no-console
  console.log('[PROF] ========================');
}

// ── Named timing markers (for cross-component "tap → first content" flows) ──
const marks = new Map<string, number>();
export function devMark(name: string): void {
  if (!ENABLED) return;
  marks.set(name, Date.now());
  // eslint-disable-next-line no-console
  console.log(`[PROF:mark] ${name} @ start`);
}
export function devMeasure(name: string, extra?: Record<string, unknown>): number {
  if (!ENABLED) return 0;
  const start = marks.get(name);
  if (start === undefined) return 0;
  const dur = Date.now() - start;
  marks.delete(name);
  if (extra) {
    // eslint-disable-next-line no-console
    console.log(`[PROF:mark] ${name} → ${dur}ms`, extra);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[PROF:mark] ${name} → ${dur}ms`);
  }
  return dur;
}
