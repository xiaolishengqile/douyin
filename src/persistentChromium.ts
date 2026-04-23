import * as fs from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

export const USER_DATA_DIR = path.join(process.cwd(), 'data', 'user_data')

let stealthRegistered = false

function ensureStealth(): void {
  if (stealthRegistered) return
  chromium.use(StealthPlugin())
  stealthRegistered = true
}

export function ensureUserDataDir(): void {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true })
}

export async function launchPersistentCreatorContext(options?: {
  headless?: boolean
}) {
  ensureStealth()
  ensureUserDataDir()
  return chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: options?.headless ?? false,
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
    args: ['--disable-blink-features=AutomationControlled'],
  })
}
