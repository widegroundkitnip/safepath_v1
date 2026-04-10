import { expect, test } from '@playwright/test'

test('browser shell exposes workflow, settings, and history views', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('h1')).toHaveText('Safepath')

  await expect(page.getByText(/Step 1 of 6 · Prepare/)).toBeVisible()

  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(
    page.getByRole('heading', { name: 'Generate messy fake datasets for scanning' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByText('No history yet')).toBeVisible()
})
