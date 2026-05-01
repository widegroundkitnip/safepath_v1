import { expect, test } from '@playwright/test'

test('E2E mock: selecting duplicate keeper updates plan UI', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __SP_E2E_INCLUDE_DUPLICATE_PLAN__?: boolean }).__SP_E2E_INCLUDE_DUPLICATE_PLAN__ =
      true
  })

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

  await page
    .getByRole('complementary', { name: 'Main navigation' })
    .getByRole('button', { name: 'Review' })
    .click()

  await expect(page.getByText('Duplicate review groups')).toBeVisible()
  const keepCopy2 = page.getByRole('button', { name: 'Keep copy 2' })
  await expect(keepCopy2).toBeVisible()

  const approveGroup = page.getByRole('button', { name: 'Approve group' })
  await expect(approveGroup).toBeDisabled()

  await keepCopy2.click()

  await expect(approveGroup).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Keeper', exact: true })).toBeVisible()
})
