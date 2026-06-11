// In-memory bridge for the rare race condition where the news tab mounts
// before Expo Router has delivered the category param from a cross-tab
// drawer navigation. The drawer writes the intended category; news/index.tsx
// reads and clears it on mount.

let pendingDrawerCategory: string | null = null;

export function setPendingDrawerCategory(slug: string | null): void {
  pendingDrawerCategory = slug;
}

export function getAndClearPendingDrawerCategory(): string | null {
  const slug = pendingDrawerCategory;
  pendingDrawerCategory = null;
  return slug;
}
