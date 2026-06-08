import { expect, test } from '@playwright/test'

test('opens a dedicated proxy address screen from the proxy list', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('api_token', 'test-token')
  })

  await page.route('**/api/v1/proxy-bindings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'proxy-1',
            attributes: {
              proxy_address: 'alpha@example.com',
              description: '',
              received_emails: 2,
              real_addresses: {
                'real@example.com': {
                  is_enabled: true,
                  is_verification_needed: false,
                  is_verified: true,
                },
              },
            },
          },
          {
            id: 'proxy-2',
            attributes: {
              proxy_address: 'beta@example.com',
              description: '',
              received_emails: 0,
              real_addresses: {
                'real@example.com': {
                  is_enabled: true,
                  is_verification_needed: false,
                  is_verified: true,
                },
              },
            },
          },
        ],
      }),
    })
  })

  await page.route('**/gapi/available-domains', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(['example.com']),
    })
  })

  await page.goto('/')

  await expect(page.getByText('alpha@example.com')).toBeVisible()
  await expect(page.getByText('beta@example.com')).toBeVisible()

  await page.getByText('alpha@example.com').click()

  await expect(page).toHaveURL(/\/proxy\/proxy-1\?address=alpha@example\.com$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('alpha@example.com')
  await expect(page.getByText('beta@example.com')).toHaveCount(0)
})
