import { basename } from 'node:path'
import { assertBrowserEnvironment } from './support/environment.js'

const executable = assertBrowserEnvironment()
console.log(`Playwright browser gate passed: ${basename(executable)}`)
