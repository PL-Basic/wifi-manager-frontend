const SESSION_REFRESH_PATH = '/api/auth/refresh'
const OAUTH_PROVIDERS_PATH = '/api/auth/oauth/providers'

function requestPath(request) {
  return new URL(request.url()).pathname
}

export async function installAnonymousReadOnlyGuard(page, { mockReads = false } = {}) {
  const blockedBusinessWrites = []

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const method = request.method().toUpperCase()
    const path = requestPath(request)

    if (method === 'POST' && path === SESSION_REFRESH_PATH) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 401, message: 'Anonymous smoke has no session.' })
      })
      return
    }

    if (method !== 'GET') {
      blockedBusinessWrites.push(`${method} ${path}`)
      await route.abort('blockedbyclient')
      return
    }

    if (mockReads && path === OAUTH_PROVIDERS_PATH) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: [] })
      })
      return
    }

    await route.continue()
  })

  return blockedBusinessWrites
}
