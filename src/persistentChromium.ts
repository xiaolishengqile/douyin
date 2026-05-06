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

function resolveExecutablePath(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_EXECUTABLE_PATH?.trim()
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv

  const localAppData = process.env.LOCALAPPDATA ?? ''
  const candidates = [
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  return candidates.find((p) => fs.existsSync(p))
}

export async function launchPersistentCreatorContext(options?: {
  headless?: boolean
}) {
  ensureStealth()
  ensureUserDataDir()
  const executablePath = resolveExecutablePath()
  return chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: options?.headless ?? false,
    ...(executablePath ? { executablePath } : {}),
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
    args: ['--disable-blink-features=AutomationControlled'],
  })
}
