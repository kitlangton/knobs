let panels = 0

/**
 * Ids for one panel's row descriptions (`aria-describedby`), unique in the page: each panel gets
 * its own number, so a store mounted twice doesn't repeat them, and the store's id is cut to the
 * characters an id reference list can carry.
 */
export function descriptionIds(storeId: string): () => string {
  const prefix = `knobs-desc-${++panels}-${storeId.replace(/[^\w-]/g, "-")}`
  let n = 0
  return () => `${prefix}-${++n}`
}
