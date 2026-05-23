export const HEADER_LEADING_ITEM_IDS = ["menu", "sidebar"] as const;
export const HEADER_TRAILING_ITEM_IDS = ["run-actions", "ai-chat", "account"] as const;
export const SIDEBAR_ACTIVITY_ITEM_IDS = ["files", "search", "git", "github-prs"] as const;
export const FOOTER_LEADING_ITEM_IDS = [
  "branch",
  "terminal",
  "debugger",
  "diagnostics",
  "extensions",
  "updates",
] as const;
export const FOOTER_TRAILING_ITEM_IDS = [
  "httpClient",
  "outline",
  "databases",
  "collaboration",
  "notifications",
] as const;

export type HeaderLeadingItemId = (typeof HEADER_LEADING_ITEM_IDS)[number];
export type HeaderTrailingItemId = (typeof HEADER_TRAILING_ITEM_IDS)[number];
export type SidebarActivityItemId = (typeof SIDEBAR_ACTIVITY_ITEM_IDS)[number];
export type FooterLeadingItemId = (typeof FOOTER_LEADING_ITEM_IDS)[number];
export type FooterTrailingItemId = (typeof FOOTER_TRAILING_ITEM_IDS)[number];

export function normalizeItemOrder<T extends string>(
  persistedOrder: readonly T[] | undefined,
  defaultOrder: readonly T[],
): T[] {
  if (!persistedOrder || persistedOrder.length === 0) {
    return [...defaultOrder];
  }

  const allowedIds = new Set(defaultOrder);
  const seen = new Set<T>();
  const normalized: T[] = [];

  for (const id of persistedOrder) {
    if (!allowedIds.has(id) || seen.has(id)) {
      continue;
    }

    normalized.push(id);
    seen.add(id);
  }

  for (const id of defaultOrder) {
    if (seen.has(id)) continue;

    let insertAt = 0;
    for (let i = normalized.length - 1; i >= 0; i--) {
      const existingIdx = defaultOrder.indexOf(normalized[i]);
      const newIdx = defaultOrder.indexOf(id);
      if (existingIdx >= 0 && existingIdx < newIdx) {
        insertAt = i + 1;
        break;
      }
    }

    normalized.splice(insertAt, 0, id);
    seen.add(id);
  }

  // Fix items that were appended at the end by an older version of the
  // algorithm: if the last item has a lower default index than every item
  // before it, the item was likely appended and belongs at its default
  // position instead of at the tail.
  if (normalized.length > 1) {
    const lastId = normalized[normalized.length - 1];
    const lastDefaultIdx = defaultOrder.indexOf(lastId);
    if (lastDefaultIdx >= 0) {
      let allBeforeHaveHigherIdx = true;
      for (let i = 0; i < normalized.length - 1; i++) {
        const idx = defaultOrder.indexOf(normalized[i]);
        if (idx >= 0 && idx <= lastDefaultIdx) {
          allBeforeHaveHigherIdx = false;
          break;
        }
      }
      if (allBeforeHaveHigherIdx) {
        normalized.pop();
        let insertAt = 0;
        for (let i = normalized.length - 1; i >= 0; i--) {
          const idx = defaultOrder.indexOf(normalized[i]);
          if (idx >= 0 && idx < lastDefaultIdx) {
            insertAt = i + 1;
            break;
          }
        }
        normalized.splice(insertAt, 0, lastId);
      }
    }
  }

  return normalized;
}
