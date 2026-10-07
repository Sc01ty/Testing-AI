import { expect, test, type Page } from '@playwright/test'

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  return errors
}

async function enterMenu(page: Page) {
  await page.goto('/')
  await expect(page.getByText('Click to enter')).toBeVisible()
  // click away from where the menu will appear, so the cursor doesn't pre-select an item
  await page.mouse.click(1300, 820)
  await expect(page.locator('.title')).toHaveAttribute('data-phase', 'menu', { timeout: 8000 })
  await page.waitForTimeout(1200) // let the menu rows land
}

test('click to enter → RAP → RAP BUT RANKED → menu, with the theme playing', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  const title = page.locator('.title')
  await expect(title).toHaveAttribute('data-phase', 'enter')
  // nothing animates or plays until the user asks
  await page.waitForTimeout(1500)
  await expect(title).toHaveAttribute('data-phase', 'enter')

  await page.mouse.click(720, 450)
  await expect(title).toHaveAttribute('data-phase', 'rap', { timeout: 2000 })
  await expect(title).toHaveAttribute('data-phase', 'reveal', { timeout: 4000 })
  await expect(title).toHaveAttribute('data-phase', 'settle', { timeout: 3000 })
  await expect(title).toHaveAttribute('data-phase', 'menu', { timeout: 3000 })
  const music = await page.evaluate(() => performance.getEntriesByType('resource').some((e) => e.name.includes('menu-theme')))
  expect(music).toBe(true)
  expect(errors).toEqual([])
})

test('clicking during the reveal skips straight to the menu', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Click to enter')).toBeVisible()
  await page.mouse.click(720, 450)
  await expect(page.locator('.title')).toHaveAttribute('data-phase', 'rap', { timeout: 2000 })
  await page.mouse.click(720, 450)
  await expect(page.locator('.title')).toHaveAttribute('data-phase', 'menu')
  // the skip click must not also launch a menu item
  await page.waitForTimeout(800)
  await expect(page.locator('.title')).toBeVisible()
})

test('keyboard can enter too', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.title')).toHaveAttribute('data-phase', 'enter')
  await page.keyboard.press('Space')
  await expect(page.locator('.title')).toHaveAttribute('data-phase', 'rap', { timeout: 2000 })
})

test('menu: four options, keyboard selection and confirm', async ({ page }) => {
  const errors = collectErrors(page)
  await enterMenu(page)
  const items = page.locator('.menu__item')
  await expect(items).toHaveText([/PLAY/, /BEATS/, /FREESTYLE/, /SETTINGS/])
  await expect(items.nth(0)).toHaveAttribute('data-active', '')
  await page.keyboard.press('ArrowDown')
  await expect(items.nth(1)).toHaveAttribute('data-active', '')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(items.nth(3)).toHaveAttribute('data-active', '')
  await page.keyboard.press('Enter')
  await expect(page.locator('h1.page__title')).toHaveText('SETTINGS')
  await expect(page).toHaveURL(/#\/settings$/)
  expect(errors).toEqual([])
})

for (const [label, hash] of [
  ['PLAY', 'play'],
  ['BEATS', 'beats'],
  ['FREESTYLE', 'freestyle'],
  ['SETTINGS', 'settings'],
] as const) {
  test(`${label}: opens, then Esc and browser back both return to the menu`, async ({ page }) => {
    const errors = collectErrors(page)
    await enterMenu(page)
    await page.locator('.menu__item', { hasText: label }).click()
    await expect(page.locator('h1.page__title')).toHaveText(label)
    await expect(page).toHaveURL(new RegExp(`#/${hash}$`))
    await page.waitForTimeout(700)
    await page.keyboard.press('Escape')
    await expect(page.locator('.title')).toHaveAttribute('data-phase', 'menu')
    // returning doesn't replay the intro, and remembers the selection
    await expect(page.locator('.menu__item', { hasText: label })).toHaveAttribute('data-active', '')

    await page.locator('.menu__item', { hasText: label }).click()
    await expect(page.locator('h1.page__title')).toHaveText(label)
    await page.waitForTimeout(700)
    await page.goBack()
    await expect(page.locator('.title')).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('deep link skips the intro, and an immediate click on Menu goes back', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/#/freestyle')
  await expect(page.locator('h1.page__title')).toHaveText('FREESTYLE')
  // clicked straight away, while the button is still rising in (regression: the title used to swallow this)
  await page.getByRole('button', { name: /^Menu/ }).click()
  await expect(page.locator('.title')).toBeVisible()
  expect(errors).toEqual([])
})

test('settings persist and reduced motion is applied to the document', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: 'On' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  await page.getByRole('slider', { name: 'Music volume' }).fill('10')
  await page.reload()
  await expect(page.getByRole('radio', { name: 'On' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('slider', { name: 'Music volume' })).toHaveValue('10')
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
})

test('reduced motion: click to enter goes straight to the menu', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByText('Click to enter')).toBeVisible()
  await page.mouse.click(720, 450)
  await expect(page.locator('.title')).toHaveAttribute('data-phase', 'menu', { timeout: 1500 })
})

test('M toggles mute from anywhere', async ({ page }) => {
  await enterMenu(page)
  const toggle = page.locator('.sound-toggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('m')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('m')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
})

test('beats: dropping a file is caught and politely refused (Stage 2)', async ({ page }) => {
  await page.goto('/#/beats')
  const zone = page.locator('.dropzone')
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer()
    d.items.add(new File(['x'], 'beat.mp3', { type: 'audio/mpeg' }))
    return d
  })
  await zone.dispatchEvent('dragenter', { dataTransfer: dt })
  await zone.dispatchEvent('drop', { dataTransfer: dt })
  await expect(page.getByText('Not yet.')).toBeVisible()
  await expect(page).toHaveURL(/#\/beats$/)
})

test('mobile: menu is usable by touch', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.goto('/')
  await expect(page.getByText('Tap to enter')).toBeVisible()
  await page.tap('body')
  await expect(page.locator('.title')).toHaveAttribute('data-phase', 'menu', { timeout: 8000 })
  await page.waitForTimeout(1300)
  await page.locator('.menu__item', { hasText: 'PLAY' }).tap()
  await expect(page.locator('h1.page__title')).toHaveText('PLAY')
  const overflow = await page.evaluate(() => document.querySelector('.page')!.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
  await ctx.close()
})
