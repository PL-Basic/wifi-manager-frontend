import { existsSync } from 'node:fs'
import { loadEnv } from 'vite'

const loadedEnv = loadEnv('test', process.cwd(), '')
const environment = {
  ...loadedEnv,
  ...process.env
}

const browserCandidates = process.platform === 'win32'
  ? [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ]
  : process.platform === 'darwin'
    ? [
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      ]
    : [
        '/usr/bin/microsoft-edge',
        '/usr/bin/microsoft-edge-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
      ]

function trimmed(name) {
  return String(environment[name] || '').trim()
}

export function resolveBrowserExecutable() {
  const explicitPath = trimmed('WIFI_E2E_BROWSER_EXECUTABLE')
  if (explicitPath) return explicitPath
  return browserCandidates.find((candidate) => existsSync(candidate)) || ''
}

export function assertBrowserEnvironment() {
  const executable = resolveBrowserExecutable()
  if (executable && existsSync(executable)) return executable

  throw new Error(
    'Playwright browser gate failed. Install Edge/Chrome/Chromium or set '
    + 'WIFI_E2E_BROWSER_EXECUTABLE to an existing browser executable.'
  )
}

export function getE2EPort() {
  const rawPort = trimmed('WIFI_E2E_PORT')
  const port = rawPort ? Number(rawPort) : 4173
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('WIFI_E2E_PORT must be an integer between 1 and 65535.')
  }
  return port
}

export function getRealServiceEnvironment() {
  const baseURL = trimmed('WIFI_E2E_REAL_BASE_URL')
  const readOnly = trimmed('WIFI_E2E_REAL_READ_ONLY') === '1'

  if (baseURL) {
    let parsedURL
    try {
      parsedURL = new URL(baseURL)
    } catch {
      throw new Error('WIFI_E2E_REAL_BASE_URL must be a valid HTTP or HTTPS URL.')
    }

    if (!['http:', 'https:'].includes(parsedURL.protocol)) {
      throw new Error('WIFI_E2E_REAL_BASE_URL must use HTTP or HTTPS.')
    }
  }

  const missing = []
  if (!baseURL) missing.push('WIFI_E2E_REAL_BASE_URL')
  if (!readOnly) missing.push('WIFI_E2E_REAL_READ_ONLY=1')

  return {
    baseURL,
    enabled: missing.length === 0,
    skipReason: missing.length
      ? `Real-service smoke skipped: missing ${missing.join(' and ')}.`
      : ''
  }
}
