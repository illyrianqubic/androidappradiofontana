const DAY_MS = 24 * 60 * 60 * 1000;

// AUDIT FIX: use Date.parse() instead of new Date().getTime() to avoid
// allocating a Date object on every call. FlashList's getItemType calls
// this for every visible item on every recycle event; fast scrolling
// created dozens of short-lived Date objects per frame.
export function isBreakingBadgeVisible(
  breaking: boolean | null | undefined,
  publishedAt: string | null | undefined,
): boolean {
  if (!breaking || !publishedAt) return false;
  const ts = Date.parse(publishedAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < DAY_MS;
}
