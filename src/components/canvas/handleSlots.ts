/**
 * Connection-point slots — the single source of truth for where edges may
 * attach along a node side.
 *
 * Handle id format: `{side}-{slot}-{type}`, e.g. `right-b-source`.
 *
 * Both the renderer (`nodes/NodeHandles.tsx`) and the router
 * (`canvasBuilders.ts` → `buildEdges`) import from here, so the names and the
 * offsets can't drift apart.
 *
 * The pool holds seven slots, evenly spaced at `(i + 1) / 8` of the side:
 *
 *     x1     a    x3     b    x5     c    x7
 *    12.5   25   37.5   50   62.5   75   87.5
 *           ^^         ^^         ^^
 *      the original three slots, unmoved
 *
 * Slots 2, 4 and 6 keep their historical `a`/`b`/`c` names at exactly their
 * historical offsets, so diagrams built before the pool grew render pixel for
 * pixel as they did. The `xN` names spell out the numerator over 8. Seven is
 * odd on purpose: a lone edge still leaves dead centre.
 */

export const SIDES = ['top', 'bottom', 'left', 'right'] as const
export type Side = (typeof SIDES)[number]

export const SLOTS = ['x1', 'a', 'x3', 'b', 'x5', 'c', 'x7'] as const
export type Slot = (typeof SLOTS)[number]

/** The centre slot — where a single edge attaches, and the only slot every
 *  node offers unconditionally. */
export const CENTER_SLOT: Slot = 'b'

export function isSide(value: string): value is Side {
  return (SIDES as readonly string[]).includes(value)
}

/** CSS offset along the side for a slot, as a percentage string. */
export function slotOffset(slot: string): string {
  const index = (SLOTS as readonly string[]).indexOf(slot)
  if (index < 0) return '50%'
  // Trim the float: 25 stays "25%", 12.5 stays "12.5%".
  return `${+(((index + 1) / (SLOTS.length + 1)) * 100).toFixed(4)}%`
}

/**
 * Which slots to use for `n` edges sharing one side, as indexes into `SLOTS`.
 *
 * Every spread is symmetric about the centre and as evenly spaced as the pool
 * allows. The first three are pinned to the pre-existing 25/50/75 layout — the
 * overwhelmingly common case, and changing it would reflow every simple
 * diagram for no benefit.
 */
const SPREAD_BY_COUNT: Record<number, readonly number[]> = {
  1: [3],                 //             b
  2: [1, 5],              //          a     c
  3: [1, 3, 5],           //          a  b  c
  4: [0, 2, 4, 6],        //       x1  x3  x5  x7
  5: [0, 2, 3, 4, 6],     //       x1  x3 b x5  x7
  6: [0, 1, 2, 4, 5, 6],  //       x1 a x3  x5 c x7
  7: [0, 1, 2, 3, 4, 5, 6],
}

/**
 * Pick `n` slots for `n` edges landing on the same node side.
 *
 * Callers pass edges already sorted by the position of the node at the far end,
 * so assigning slots in order fans the edges out without crossing them.
 *
 * Past a full pool the slots cycle and edges do double up — seven simultaneous
 * connections on one side of one node is already well past what stays readable.
 */
export function pickSlots(n: number): Slot[] {
  if (n <= 0) return []
  const spread = SPREAD_BY_COUNT[n]
  if (spread) return spread.map((index) => SLOTS[index])
  return Array.from({ length: n }, (_, i) => SLOTS[i % SLOTS.length])
}

export function handleId(side: string, slot: string, type: 'source' | 'target'): string {
  return `${side}-${slot}-${type}`
}

/** Side a handle id belongs to, or null if it isn't one of ours. */
export function handleSide(handleId: string): Side | null {
  const side = handleId.split('-')[0]
  return isSide(side) ? side : null
}

/** Slot a handle id names, or null if it isn't one of ours. */
export function handleSlot(handleId: string): Slot | null {
  const slot = handleId.split('-')[1]
  return (SLOTS as readonly string[]).includes(slot) ? (slot as Slot) : null
}
