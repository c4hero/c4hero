import { test, expect } from '@playwright/test'

/**
 * Regression test for the auto-arrange + groups bug.
 *
 * Cause: fitContentNodes ran in requestAnimationFrame and read positions from
 * `rf.getNodes()`, which can be one render behind the React state set by
 * `setNodes(initialNodes)` in the relayout effect. The group rectangle was then
 * computed against stale positions, while the content nodes rendered with the
 * new positions — so members visually escaped the group.
 *
 * Fix: compute the group bbox INSIDE the functional setNodes callback so it
 * sees the just-applied positions from prev, while pulling measured dimensions
 * from React Flow's internal store via rf.getNodes() (the only source for
 * post-ResizeObserver sizes).
 *
 * This test reproduces the exact failure mode by triggering auto-arrange in
 * BT direction on a system context view with a 3-member group, then asserting
 * every member's DOM bounding box is fully inside the group node's DOM bbox.
 */
test.describe('group layout regression', () => {
  test.setTimeout(60000)

  for (const direction of ['TB', 'BT', 'LR', 'RL'] as const) {
    test(`auto-arrange ${direction} keeps group members inside the group rectangle`, async ({ page }) => {
      // Suppress Vite HMR client WS reconnect spam under tunnel mode.
      await page.addInitScript(() => {
        const NoopWS = function () {
          return {
            readyState: 3,
            close: () => {},
            send: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          } as unknown as WebSocket
        } as unknown as typeof WebSocket
        // @ts-expect-error replacing built-in
        window.WebSocket = NoopWS
      })

      page.on('pageerror', () => {})

      await page.goto('/')
      await page.waitForFunction(() => typeof (window as unknown as { __testLoadSample?: unknown }).__testLoadSample === 'function')
      await page.evaluate(() => (window as unknown as { __testLoadSample?: () => void }).__testLoadSample?.())

      // Wait for canvas to render
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(300)
        if (await page.evaluate(() => document.querySelectorAll('.react-flow__node').length > 0)) break
      }
      await expect(page.locator('.react-flow__node').first()).toBeVisible()

      // Switch to system context view, add a group of 3 elements
      await page.evaluate(() => (window as unknown as { __testSetView?: (k: string) => void }).__testSetView?.('SystemContext'))
      const groupedIds = ['customer', 'internetBanking', 'mainframe']
      const groupId = await page.evaluate(
        (ids) => (window as unknown as { __testAddGroup?: (n: string, i: string[]) => string }).__testAddGroup?.('Test Group', ids),
        groupedIds,
      )
      expect(groupId).toBeTruthy()
      await page.waitForTimeout(600)

      // Trigger auto-arrange in the test direction
      await page.evaluate(
        (dir) => (window as unknown as { __testRelayout?: (d: string) => void }).__testRelayout?.(dir),
        direction,
      )
      await page.waitForTimeout(2000)

      // Read final DOM state
      const finalState = await page.evaluate(
        (args: { groupId: string; memberIds: string[] }) => {
          const groupEl = document.querySelector(`[data-id="group-${args.groupId}"]`) as HTMLElement | null
          if (!groupEl) return { groupNotFound: true as const }
          const grect = groupEl.getBoundingClientRect()
          const members = args.memberIds.map((id) => {
            const el = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
            if (!el) return { id, found: false as const }
            const r = el.getBoundingClientRect()
            // Allow 1px tolerance for sub-pixel rounding
            const inside =
              r.left >= grect.left - 1 &&
              r.top >= grect.top - 1 &&
              r.right <= grect.right + 1 &&
              r.bottom <= grect.bottom + 1
            return { id, found: true as const, inside }
          })
          return { groupNotFound: false as const, members }
        },
        { groupId: groupId!, memberIds: groupedIds },
      )

      expect(finalState.groupNotFound, 'group node missing from DOM').toBe(false)
      if (finalState.groupNotFound) return
      for (const m of finalState.members) {
        expect(m, `member ${m.id}`).toMatchObject({ found: true, inside: true })
      }
    })
  }
})
