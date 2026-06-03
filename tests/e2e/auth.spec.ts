import { expect, test, type Page } from '@playwright/test'

const username = process.env.E2E_USERNAME
const password = process.env.E2E_PASSWORD

async function login(page: Page) {
  if (!username || !password) {
    throw new Error('Missing E2E_USERNAME or E2E_PASSWORD')
  }

  await page.goto('/login')
  await page.getByLabel(/username/i).fill(username)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/$/)
}

test('redirects unauthenticated users to the login page', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ProxiedMail')
  await expect(page.getByLabel(/username/i)).toBeVisible()
  await expect(page.getByLabel(/password/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
})

test('logs in with the test account and shows the home screen', async ({ page }) => {
  test.skip(!username || !password, 'Missing E2E_USERNAME or E2E_PASSWORD in .env.test')

  await login(page)

  await expect(page.getByRole('heading', { level: 1 })).toContainText('ProxiedMail')
  await expect(page.getByRole('button', { name: /new proxy email/i })).toBeVisible()
})

test('logs out from the authenticated home screen', async ({ page }) => {
  test.skip(!username || !password, 'Missing E2E_USERNAME or E2E_PASSWORD in .env.test')

  await login(page)

  await page.getByRole('button', { name: /settings/i }).click()
  await page.getByRole('menuitem', { name: /sign out/i }).click()

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel(/username/i)).toBeVisible()
})
