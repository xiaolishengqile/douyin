import type { Frame, Page } from 'playwright'
import { config } from './config'
import { clickInteractionMenu } from './creatorPrivateMessageNav'
import {
  clickExactTextInAnyFrame,
  clickXPathInAnyFrame,
  sleep,
} from './creatorXpathHelpers'

/** 侧栏「互动管理」下 — 评论管理 */
const XPATH_COMMENT_MENU =
  process.env.DOUYIN_XPATH_COMMENT ??
  '/html/body/div[1]/div[1]/aside/div/div/div/div/div[2]/ul/li[4]/div[2]/div/ul/li[3]/span'

/** 筛选条「全部评论」下拉触发器 */
const XPATH_ALL_COMMENTS_FILTER =
  process.env.DOUYIN_XPATH_ALL_COMMENTS ??
  '/html/body/div[1]/div[1]/div/div[3]/div/div/div/div[2]/div/div[4]/div[2]/div/div/div/div[4]/div[1]/div[1]/div[1]/div/span'

/** 下拉项「未回复」（常挂在 body 顶层 portal） */
const XPATH_UNREPLIED_OPTION =
  process.env.DOUYIN_XPATH_UNREPLIED ??
  '/html/body/div[6]/div/div/div/div/div/div/div/div[2]'

/** 列表最上方一条的「回复」入口（导出供 Coze 上下文抓取复用） */
export const XPATH_FIRST_COMMENT_REPLY =
  process.env.DOUYIN_XPATH_FIRST_COMMENT_REPLY ??
  '/html/body/div[1]/div[1]/div/div[3]/div/div/div/div[2]/div/div[4]/div[2]/div/div/div/div[5]/div[1]/div/div/div[4]/div/div[3]'

/** 评论回复面板内真实输入区域（div，常为 contenteditable） */
export const XPATH_COMMENT_COMPOSER =
  process.env.DOUYIN_XPATH_COMMENT_COMPOSER ??
  '/html/body/div[1]/div[1]/div/div[3]/div/div/div/div[2]/div/div[4]/div[2]/div/div/div/div[5]/div[1]/div/div/div[4]/div[2]/div/div[1]/div'

/** 评论发送：button[2] 内的 span（点击 span 即可） */
const XPATH_COMMENT_SEND =
  process.env.DOUYIN_XPATH_COMMENT_SEND ??
  '/html/body/div[1]/div[1]/div/div[3]/div/div/div/div[2]/div/div[4]/div[2]/div/div/div/div[5]/div[1]/div/div/div[4]/div[2]/div/div[2]/div[2]/button[2]/span'

/**
 * 无未读私信时的评论流程：评论管理 → 全部评论 → 未回复 → 首条「回复」。
 * 若侧栏未展开，会先点「互动管理」再点「评论管理」。
 */
export async function openUnrepliedCommentReplyFlow(page: Page): Promise<boolean> {
  let ok = await clickXPathInAnyFrame(page, XPATH_COMMENT_MENU, '评论管理')
  if (!ok) ok = await clickExactTextInAnyFrame(page, '评论管理', '评论管理')
  if (!ok) {
    const expanded = await clickInteractionMenu(page)
    if (!expanded) {
      console.warn('[评论导航] 无法展开互动管理，放弃评论流程')
      return false
    }
    await sleep(config.uiStepDelayMs)
    ok = await clickXPathInAnyFrame(page, XPATH_COMMENT_MENU, '评论管理')
    if (!ok) ok = await clickExactTextInAnyFrame(page, '评论管理', '评论管理')
    if (!ok) {
      console.warn('[评论导航] 无法进入评论管理')
      return false
    }
  }

  await sleep(Math.max(2000, config.uiStepDelayMs))

  ok = await clickXPathInAnyFrame(page, XPATH_ALL_COMMENTS_FILTER, '全部评论')
  if (!ok) ok = await clickExactTextInAnyFrame(page, '全部评论', '全部评论')
  if (!ok) {
    console.warn('[评论导航] 无法点击「全部评论」筛选')
    return false
  }

  await sleep(Math.max(1200, Math.floor(config.uiStepDelayMs * 0.75)))

  ok = await clickXPathInAnyFrame(page, XPATH_UNREPLIED_OPTION, '未回复')
  if (!ok) ok = await clickExactTextInAnyFrame(page, '未回复', '未回复')
  if (!ok) {
    console.warn('[评论导航] 无法选择「未回复」')
    return false
  }

  await sleep(Math.max(2000, config.uiStepDelayMs))

  ok = await clickXPathInAnyFrame(
    page,
    XPATH_FIRST_COMMENT_REPLY,
    '首条评论-回复',
  )
  if (!ok) {
    ok = await clickExactTextInAnyFrame(page, '回复', '回复')
  }
  if (!ok) {
    console.warn('[评论导航] 无法点击首条「回复」')
    return false
  }

  await sleep(Math.max(2500, config.uiStepDelayMs))
  return true
}

async function trySendCommentReplyInFrame(
  frame: Frame,
  reply: string,
): Promise<boolean> {
  try {
    const xpComposer = `xpath=${XPATH_COMMENT_COMPOSER}`
    const xpSend = `xpath=${XPATH_COMMENT_SEND}`

    const composer = frame.locator(xpComposer).first()
    if ((await composer.count()) === 0) return false
    if (!(await composer.isVisible().catch(() => false))) return false

    await composer.click({ timeout: 8000 })
    await composer.fill(reply)

    await sleep(config.delayBetweenFillAndSendMs)

    const send = frame.locator(xpSend).first()
    if ((await send.count()) === 0) return false
    if (!(await send.isVisible().catch(() => false))) return false
    await send.click({ timeout: 8000 })
    return true
  } catch {
    return false
  }
}

/**
 * 使用评论专用 XPath：真实输入框 + 发送 span，在所有 frame 中尝试一次。
 */
export async function trySendCommentReplyViaXPath(
  page: Page,
  reply: string,
): Promise<boolean> {
  for (const frame of page.frames()) {
    const ok = await trySendCommentReplyInFrame(frame, reply)
    if (ok) {
      console.log(
        `[评论] XPath 发送成功 frame=${JSON.stringify(frame.name())} url=${frame.url()}`,
      )
      return true
    }
  }
  console.warn('[评论] XPath 未能在任何 frame 内完成输入/发送')
  return false
}
