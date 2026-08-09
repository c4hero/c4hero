import { describe, expect, it } from 'vitest'
import { CENTER_SLOT, SLOTS, handleSide, handleSlot, handleId, pickSlots, slotOffset } from './handleSlots'

const percent = (slot: string) => Number.parseFloat(slotOffset(slot))

describe('slot offsets', () => {
  it('spreads seven slots evenly across the side', () => {
    expect(SLOTS.map(slotOffset)).toEqual([
      '12.5%', '25%', '37.5%', '50%', '62.5%', '75%', '87.5%',
    ])
  })

  it('keeps a/b/c at the offsets they have always had', () => {
    // Diagrams built before the pool grew must not move a single pixel.
    expect(slotOffset('a')).toBe('25%')
    expect(slotOffset('b')).toBe('50%')
    expect(slotOffset('c')).toBe('75%')
    expect(CENTER_SLOT).toBe('b')
  })

  it('falls back to centre for a slot it does not know', () => {
    expect(slotOffset('nonsense')).toBe('50%')
  })
})

describe('pickSlots', () => {
  it('returns nothing for a side with no edges', () => {
    expect(pickSlots(0)).toEqual([])
    expect(pickSlots(-1)).toEqual([])
  })

  it('routes one, two and three edges exactly where it used to', () => {
    expect(pickSlots(1)).toEqual(['b'])
    expect(pickSlots(2)).toEqual(['a', 'c'])
    expect(pickSlots(3)).toEqual(['a', 'b', 'c'])
  })

  it('gives four to seven edges a distinct slot each', () => {
    for (let n = 4; n <= SLOTS.length; n++) {
      const slots = pickSlots(n)
      expect(slots).toHaveLength(n)
      expect(new Set(slots).size).toBe(n)
    }
  })

  it('spreads six edges over six separate points instead of stacking three pairs', () => {
    // The GH #108 case: six integrations entering one side of a system.
    const slots = pickSlots(6)
    expect(slots).toEqual(['x1', 'a', 'x3', 'x5', 'c', 'x7'])
    expect(new Set(slots.map(percent)).size).toBe(6)
  })

  it('keeps every spread ordered and symmetric about the centre', () => {
    for (let n = 1; n <= SLOTS.length; n++) {
      const offsets = pickSlots(n).map(percent)
      const ascending = [...offsets].sort((a, b) => a - b)
      expect(offsets).toEqual(ascending)
      // Mirroring the spread about 50% reproduces it.
      expect(offsets.map((offset) => 100 - offset).reverse()).toEqual(offsets)
    }
  })

  it('cycles the pool past seven edges rather than dropping any', () => {
    const slots = pickSlots(9)
    expect(slots).toHaveLength(9)
    expect(slots.slice(0, 7)).toEqual([...SLOTS])
    expect(slots.slice(7)).toEqual(['x1', 'a'])
  })
})

describe('handle ids', () => {
  it('round-trips side and slot', () => {
    for (const slot of SLOTS) {
      const id = handleId('right', slot, 'source')
      expect(handleSide(id)).toBe('right')
      expect(handleSlot(id)).toBe(slot)
    }
  })

  it('rejects ids that are not ours', () => {
    expect(handleSide('diagonal-a-source')).toBeNull()
    expect(handleSlot('top-zzz-source')).toBeNull()
  })
})
