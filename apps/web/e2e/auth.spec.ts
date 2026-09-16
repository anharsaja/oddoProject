import { expect, test } from '@playwright/test'

const ADMIN_EMAIL = process.env['ADMIN_EMAIL'] ?? ''
const ADMIN_PASSWORD = process.env['ADMIN_PASSWORD'] ?? ''

/**
 * One test, not six. The value being proved is that the whole round trip holds
 * together in a real browser — cookie set by the API, read by the middleware,
 * honoured by the page, and destroyed on the way out. Split into separate tests,
 * each piece would pass against a system where the pieces do not connect.
 */
test('a visitor is kept out, lets themselves in, and is kept out again', async ({ page }) => {
  expect(ADMIN_EMAIL, 'ADMIN_EMAIL must come from .env.test').not.toBe('')

  await test.step('the home page is closed to a visitor with no session', async () => {
    await page.goto('/')
    await expect(page).toHaveURL('/login?next=%2F')
    await expect(page.getByText('Masuk ke akun Anda')).toBeVisible()
  })

  await test.step('signing in lands on the home page, named', async () => {
    await page.getByLabel('Email').fill(ADMIN_EMAIL)
    await page.getByLabel('Password').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Masuk' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Halo, Administrator' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
  })

  await test.step('the health page is reachable and carries no header shell', async () => {
    await page.goto('/health')
    await expect(page).toHaveURL('/health')
    await expect(page.getByText('Database')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Keluar' })).toHaveCount(0)
  })

  await test.step('signing out returns to the login page', async () => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible()
    await page.getByRole('button', { name: 'Keluar' }).click()

    await expect(page).toHaveURL('/login')
  })

  await test.step('and the home page is closed again afterwards', async () => {
    await page.goto('/')
    await expect(page).toHaveURL('/login?next=%2F')
    await expect(page.getByRole('heading', { name: /Halo,/ })).toHaveCount(0)
  })
})
