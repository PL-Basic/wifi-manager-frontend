import { expect, test } from '@playwright/test'
import { installAnonymousReadOnlyGuard } from '../support/anonymousNetwork.js'

test('anonymous visitor reaches the login page without business writes', async ({ page }) => {
  const blockedBusinessWrites = await installAnonymousReadOnlyGuard(page, {
    mockReads: true
  })

  const response = await page.goto('/')

  expect(response?.ok()).toBe(true)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: '家庭 WiFi 管理' })).toBeVisible()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  expect(blockedBusinessWrites).toEqual([])
})
