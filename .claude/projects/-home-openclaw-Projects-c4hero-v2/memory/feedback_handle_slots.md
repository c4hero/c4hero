---
name: Node handle slots must be 3 per side
description: Canvas node edge handles use exactly 3 slots (a/b/c) per side — never expand to 5. Single edges must use center slot (b).
type: feedback
---

Node handles use exactly 3 slots per side: a (25%), b (50% center), c (75%). Both `NodeHandles.tsx` SLOTS and `Canvas.tsx` pickSlots/SLOTS must stay in sync.

**Why:** Expanding to 5 slots created visual clutter with too many connection points. Single edges should always anchor at the center (slot b) for clean appearance.

**How to apply:** When touching `NodeHandles.tsx` or the `pickSlots` function in `Canvas.tsx`, verify both SLOTS arrays match. pickSlots distribution: N=1→[b], N=2→[a,c], N=3→[a,b,c].
