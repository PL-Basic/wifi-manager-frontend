import { expect, test } from '@playwright/test'
import { installAnonymousReadOnlyGuard } from '../support/anonymousNetwork.js'
import { getRealServiceEnvironment } from '../support/environment.js'

const realService = getRealServiceEnvironment()

test.skip(!realService.enabled, realService.skipReason)

test('real service exposes the anonymous login surface without business writes', async ({ page }) => {
  const blockedBusinessWrites = await installAnonymousReadOnlyGuard(page)

  const response = await page.goto('/')

  expect(response).not.toBeNull()
  expect(response.status()).toBeLessThan(500)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: '家庭 WiFi 管理' })).toBeVisible()
  expect(blockedBusinessWrites).toEqual([])
})
