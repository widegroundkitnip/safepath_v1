import { expect, test } from '@playwright/test'

test.describe('E2E mock analysis partial notes', () => {
  test('results screen shows caveat copy after scan (simple mode)', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('textbox', { name: 'Source folders' }).fill('/tmp/e2e-source')
    await page.getByRole('textbox', { name: 'Destination' }).fill('/tmp/e2e-dest')
    await page.getByRole('button', { name: 'Start scan' }).click()

    await expect(page.getByRole('heading', { name: 'Scan complete' })).toBeVisible({
      timeout: 15_000,
    })

    await expect(page.getByText('Analysis completed with caveats')).toBeVisible()
    await expect(page.getByText(/pairwise comparison budget exhausted/i)).toBeVisible()
  })
})
