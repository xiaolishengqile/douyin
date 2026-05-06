import type { Locator, Page } from 'playwright'
import { config } from './config'
import {
  clickExactTextInAnyFrame,
  clickXPathInAnyFrame,
  sleep,
} from './creatorXpathHelpers'

function envOrDefault(name: string, fallback: string): string {
  const raw = process.env[name]
  return raw && raw.trim() ? raw.trim() : fallback
}

/**
 * 图1：互动管理（侧边栏，先展开子菜单）
 * 默认为你提供的绝对 XPath，可通过环境变量覆盖。
 */
const XPATH_INTERACTION_MENU =
  envOrDefault(
    'DOUYIN_XPATH_INTERACTION',
    '/html/body/div[1]/div[1]/aside/div/div/div/div/div[2]/ul/li[4]/div[1]/div',
  )

/**
 * 图2：私信管理
 */
const XPATH_PRIVATE_MESSAGE_MENU =
  envOrDefault(
    'DOUYIN_XPATH_PRIVATE_MESSAGE',
    '/html/body/div[1]/div[1]/aside/div/div/div/div/div[2]/ul/li[4]/div[2]/div/ul/li[5]/span',
  )

/**
 * 图3：未读小红点（span[2]）；点击其所在会话行（优先 a，其次 li）
 */
const XPATH_UNREAD_BADGE =
  envOrDefault(
    'DOUYIN_XPATH_UNREAD_BADGE',
    '/html/body/div[1]/div[1]/div/div[3]/div/div/div/div[2]/div/div/div/div[2]/div[1]/div/div/div[1]/div/div/div/ul/div/div/div[1]/li/div/div[1]/a/span/span[2]',
  )

/** 供评论流程在侧栏未展开时复用 */
export async function clickInteractionMenu(page: Page): Promise<boolean> {
  let ok = await clickXPathInAnyFrame(page, XPATH_INTERACTION_MENU, '互动管理')
  if (!ok) {
    ok = await clickExactTextInAnyFrame(page, '互动管理', '互动管理')
  }
  return ok
}

/**
 * 从创作平台首页：互动管理 → 私信管理。
 * XPath 失败时用「互动管理」「私信管理」精确文案回退。
 */
export async function navigateToPrivateMessageInbox(
  page: Page,
  homeUrl: string,
): Promise<void> {
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' })
  await sleep(config.uiStepDelayMs())

  const expanded = await clickInteractionMenu(page)
  if (!expanded) {
    throw new Error('[导航] 无法点击「互动管理」，请检查 XPath 或页面结构是否变更')
  }

  await sleep(config.uiStepDelayMs())

  let ok = await clickXPathInAnyFrame(page, XPATH_PRIVATE_MESSAGE_MENU, '私信管理')
  if (!ok) {
    ok = await clickExactTextInAnyFrame(page, '私信管理', '私信管理')
  }
  if (!ok) {
    throw new Error('[导航] 无法点击「私信管理」，请检查 XPath 或页面结构是否变更')
  }

  await sleep(Math.max(2500, config.uiStepDelayMs()))
}

async function clickConversationRowFromBadge(badge: Locator): Promise<boolean> {
  return badge.first().evaluate((el) => {
    const row =
      el.closest('a') ??
      (el.closest('li') as HTMLElement | null) ??
      el.closest('[role="button"]')
    if (!row) return false
    ;(row as HTMLElement).click()
    return true
  })
}

/**
 * 在任意 frame 内查找未读红点 XPath，并点击其所在会话条目以打开对话。
 */
/**
 * 从当前页切回「私信管理」（用于评论回复后回到私信轮询）。
 * 若侧栏收起，会先点「互动管理」再点「私信管理」。
 */
export async function focusPrivateMessageInbox(page: Page): Promise<boolean> {
  let ok = await clickXPathInAnyFrame(page, XPATH_PRIVATE_MESSAGE_MENU, '私信管理')
  if (!ok) ok = await clickExactTextInAnyFrame(page, '私信管理', '私信管理')
  if (!ok) {
    const expanded = await clickInteractionMenu(page)
    if (!expanded) return false
    await sleep(config.uiStepDelayMs())
    ok = await clickXPathInAnyFrame(page, XPATH_PRIVATE_MESSAGE_MENU, '私信管理')
    if (!ok) ok = await clickExactTextInAnyFrame(page, '私信管理', '私信管理')
  }
  if (ok) {
    await sleep(Math.max(2500, config.uiStepDelayMs()))
  }
  return ok
}

export async function clickUnreadPrivateMessageIfPresent(
  page: Page,
): Promise<boolean> {
  const xp = `xpath=${XPATH_UNREAD_BADGE}`
  for (const frame of page.frames()) {
    const badge = frame.locator(xp)
    if ((await badge.count()) === 0) continue
    const first = badge.first()
    if (!(await first.isVisible().catch(() => false))) continue

    const clicked = await clickConversationRowFromBadge(badge)
    if (clicked) {
      console.log(
        `[导航] 已打开未读会话（红点 XPath） frame=${JSON.stringify(frame.name())} url=${frame.url()}`,
      )
      await sleep(config.uiStepDelayMs())
      return true
    }
  }
  return false
}
