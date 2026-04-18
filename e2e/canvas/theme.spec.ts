import { test, expect } from '../fixtures/workspace'

async function openCanvasSettings(page: import('@playwright/test').Page) {
  const settingsBtn = page.getByRole('button', { name: /canvas settings/i })
  await settingsBtn.first().click()
  await page.getByRole('radio', { name: 'Structurizr' }).waitFor({ state: 'visible' })
}

async function switchToStructurizr(page: import('@playwright/test').Page) {
  await openCanvasSettings(page)
  await page.getByRole('radio', { name: 'Structurizr' }).click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}

async function nodeBg(page: import('@playwright/test').Page, name: string) {
  const node = page.locator('.react-flow__node').filter({
    has: page.getByText(name, { exact: true }),
  }).locator('.c4-node')
  await node.waitFor({ state: 'visible' })
  return node.evaluate((el) => getComputedStyle(el).backgroundColor)
}

test('theme switch changes internal node background', async ({ workspace, page }) => {
  await workspace.loadSample()
  const before = await nodeBg(page, 'Internet Banking System')
  await switchToStructurizr(page)
  const after = await nodeBg(page, 'Internet Banking System')
  expect(after).not.toBe(before)
})

test('theme switch also changes external node background', async ({ workspace, page }) => {
  await workspace.loadSample()
  const before = await nodeBg(page, 'Personal Banking Customer')
  await switchToStructurizr(page)
  const after = await nodeBg(page, 'Personal Banking Customer')
  expect(after).not.toBe(before)
})
