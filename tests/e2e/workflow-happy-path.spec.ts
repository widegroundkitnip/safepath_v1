import { expect, test } from '@playwright/test'

test.describe('mocked desktop workflow', () => {
  test('setup → results → build plan → workspace and Review', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Organize safely' })).toBeVisible()

    await page.getByRole('textbox', { name: 'Source folders' }).fill('/tmp/e2e-source')
    await page.getByRole('textbox', { name: 'Destination' }).fill('/tmp/e2e-dest')

    await page.getByRole('button', { name: 'Check readiness' }).click()
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
    await expect(page.getByRole('heading', { name: 'E2E mock preset', exact: true })).toBeVisible()
  })
})
