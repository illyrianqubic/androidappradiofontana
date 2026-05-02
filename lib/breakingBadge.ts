const DAY_MS = 24 * 60 * 60 * 1000;

export function isBreakingBadgeVisible(
  breaking: boolean | null | undefined,
  publishedAt: string | null | undefined,
): boolean {
  if (!breaking || !publishedAt) return false;
  return Date.now() - new Date(publishedAt).getTime() < DAY_MS;
}
