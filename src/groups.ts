import type { Item } from './types'

/** Adds every visible, unlocked member of any group the given items belong to. */
export function expandGroups(items: Item[], ids: string[]): string[] {
  const chosen = new Set(ids)
  const groups = new Set(items.filter((i) => chosen.has(i.id) && i.group).map((i) => i.group))
  if (groups.size === 0) return ids
  const out = new Set(ids)
  for (const i of items) if (i.group && groups.has(i.group) && !i.hidden && !i.locked) out.add(i.id)
  return [...out]
}
