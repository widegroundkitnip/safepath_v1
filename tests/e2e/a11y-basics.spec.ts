import { expect, test } from '@playwright/test'

test('error banner uses assertive live region', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('textbox', { name: 'Source folders' }).fill('/tmp/e2e-source')
  await page.getByRole('button', { name: 'Check readiness' }).click()

  const banner = page.getByTestId('app-error-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toHaveAttribute('aria-live', 'assertive')
  await expect(banner).toHaveAttribute('role', 'alert')
})

test('keyboard focus shows visible focus ring on nav', async ({ page }) => {
  await page.goto('/')

  let focusedHome = false
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press('Tab')
    const isHome = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el.tagName !== 'BUTTON') {
        return false
      }
      return el.textContent?.includes('Home') ?? false
    })
    if (isHome) {
      focusedHome = true
      break
    }
  }

  expect(focusedHome).toBe(true)

  const outlineWidth = await page.evaluate(() => {
    const el = document.activeElement
    if (!el) {
      return '0'
    }
    return getComputedStyle(el).outlineWidth
  })

  expect(parseFloat(outlineWidth)).toBeGreaterThan(0)
})

test('skip link targets main content landmark', async ({ page }) => {
  await page.goto('/')

  const skip = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skip).toHaveAttribute('href', '#app-main-content')
  await skip.focus()
  await page.keyboard.press('Enter')

  const main = page.locator('#app-main-content')
  await expect(main).toBeVisible()
  await expect(main).toBeFocused()
})

test('phase strip is announced in a polite live region', async ({ page }) => {
  await page.goto('/')

  const live = page.locator('#app-phase-announcement')
  await expect(live).toHaveAttribute('aria-live', 'polite')
  await expect(live).toHaveAttribute('aria-atomic', 'true')
})
