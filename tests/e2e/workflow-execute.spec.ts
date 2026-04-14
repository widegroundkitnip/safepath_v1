import { expect, test, type Page } from '@playwright/test'

async function reachPlanWorkspace(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Organize safely' })).toBeVisible()

  await page.getByRole('textbox', { name: 'Source folders' }).fill('/tmp/e2e-source')
  await page.getByRole('textbox', { name: 'Destination' }).fill('/tmp/e2e-dest')
  await page.getByRole('button', { name: 'Start scan' }).click()

  await expect(page.getByRole('heading', { name: 'Scan complete' })).toBeVisible({
    timeout: 15_000,
  })

  await page.getByRole('button', { name: 'Build plan' }).click()
  await expect(page.getByRole('heading', { name: 'E2E mock preset', exact: true })).toBeVisible({
    timeout: 15_000,
  })

  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible({
    timeout: 15_000,
  })
}

test.describe('mocked execute flow', () => {
  test('approve → execute → completion → history lists record', async ({ page }) => {
    await reachPlanWorkspace(page)

    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await page.getByRole('button', { name: /Execute approved \(\d+\)/ }).click()

    await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible({ timeout: 15_000 })

    await page
      .getByRole('complementary', { name: 'Main navigation' })
      .getByRole('button', { name: 'History' })
      .click()
    await expect(page.getByText('No history yet')).not.toBeVisible()
    await expect(page.getByText('/e2e/source/example.txt').first()).toBeVisible()
  })

  test('preflight error flag disables execute', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __SP_E2E_PREFLIGHT_ERROR__: boolean }).__SP_E2E_PREFLIGHT_ERROR__ =
        true
    })

    await reachPlanWorkspace(page)

    await page.getByRole('button', { name: 'Approve', exact: true }).click()

    await expect(
      page.getByText('Must fix before running: Mock preflight error for E2E.'),
    ).toBeVisible({ timeout: 15_000 })

    await expect(page.getByRole('button', { name: /Execute approved \(\d+\)/ })).toBeDisabled()
  })

  test('history record undo adds undo row in mock', async ({ page }) => {
    await reachPlanWorkspace(page)

    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await page.getByRole('button', { name: /Execute approved \(\d+\)/ }).click()
    await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible({ timeout: 15_000 })

    await page
      .getByRole('complementary', { name: 'Main navigation' })
      .getByRole('button', { name: 'History' })
      .click()
    await expect(page.getByRole('heading', { name: '1 recorded actions' })).toBeVisible()

    await page.getByRole('button', { name: 'Undo this record' }).click()

    await expect(page.getByRole('heading', { name: '2 recorded actions' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator('p').filter({ hasText: /^undo ·/ })).toBeVisible()
  })

  test('history session undo completes in mock', async ({ page }) => {
    await reachPlanWorkspace(page)

    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await page.getByRole('button', { name: /Execute approved \(\d+\)/ }).click()
    await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible({ timeout: 15_000 })

    await page
      .getByRole('complementary', { name: 'Main navigation' })
      .getByRole('button', { name: 'History' })
      .click()
    await expect(page.getByRole('heading', { name: '1 recorded actions' })).toBeVisible()

    await page.getByRole('button', { name: 'Best-effort undo session' }).click()

    await expect(page.getByRole('heading', { name: '2 recorded actions' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator('p').filter({ hasText: /^undo ·/ })).toBeVisible()
  })
})
