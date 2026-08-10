import { defineConfig } from '@playwright/test'
import {
  assertBrowserEnvironment,
  getE2EPort,
  getRealServiceEnvironment
} from './tests/e2e/support/environment.js'

const browserExecutable = assertBrowserEnvironment()
const port = getE2EPort()
const localBaseURL = `http://127.0.0.1:${port}`
const realService = getRealServiceEnvironment()

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/playwright',
  globalSetup: './tests/e2e/globalSetup.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  reporter: 'line',
  preserveOutput: 'failures-only',
  use: {
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    launchOptions: {
      executablePath: browserExecutable
    }
  },
  projects: [
    {
      name: 'anonymous-smoke',
      testMatch: /anonymous\/.*\.spec\.js/,
      use: {
        baseURL: localBaseURL
      }
    },
    {
      name: 'real-service-smoke',
      testMatch: /real\/.*\.spec\.js/,
      use: {
        baseURL: realService.baseURL || localBaseURL
      }
    }
  ]
})
