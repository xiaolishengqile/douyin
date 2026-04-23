import type { Page } from 'playwright'
import { XPATH_COMMENT_COMPOSER, XPATH_FIRST_COMMENT_REPLY } from './creatorCommentNav'

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** 可选：用户侧「最后一条 / 未读」私信文案所在节点（接入 Coze 前可配准 XPath） */
const XPATH_DM_USER_MESSAGE = process.env.DOUYIN_XPATH_DM_USER_MESSAGE ?? ''

/** 可选：首条未回复评论正文所在节点 */
const XPATH_COMMENT_USER_TEXT = process.env.DOUYIN_XPATH_COMMENT_USER_TEXT ?? ''

export function printCozePreviewBox(title: string, body: string): void {
  const line = '─'.repeat(Math.min(72, Math.max(24, title.length + 8)))
  console.log(`\n┌${line}┐`)
  console.log(`│ ${title}`)
  console.log(`├${line}┤`)
  for (const row of body.split('\n')) {
    console.log(`│ ${row}`)
  }
  console.log(`└${line}┘\n`)
}

/**
 * 抓取拟发给 Coze 的私信侧「用户原文」预览（启发式 + 可选 XPath）。
 */
export async function extractPrivateMessageUserText(page: Page): Promise<string> {
  if (XPATH_DM_USER_MESSAGE) {
    const xp = `xpath=${XPATH_DM_USER_MESSAGE}`
    for (const frame of page.frames()) {
      const loc = frame.locator(xp).first()
      if ((await loc.count()) === 0) continue
      const t = await loc.innerText().catch(() => '')
      if (t?.trim()) return clip(t, 4000)
    }
  }

  for (const frame of page.frames()) {
    const composer = frame.locator('textarea, div[contenteditable="true"]').first()
    if ((await composer.count()) === 0) continue
    const panel = await composer
      .first()
      .evaluate((el) => {
        let cur: HTMLElement | null = el as HTMLElement
        for (let depth = 0; depth < 16 && cur; depth++) {
          const raw = cur.innerText?.trim() || ''
          if (raw.length > 24) return raw
          cur = cur.parentElement
        }
        return ''
      })
      .catch(() => '')
    if (panel) return clip(panel, 4000)
  }

  return ''
}

/**
 * 抓取拟发给 Coze 的评论侧「用户原文」预览（首条回复入口附近 + 可选 XPath）。
 */
export async function extractCommentUserText(page: Page): Promise<string> {
  if (XPATH_COMMENT_USER_TEXT) {
    const xp = `xpath=${XPATH_COMMENT_USER_TEXT}`
    for (const frame of page.frames()) {
      const loc = frame.locator(xp).first()
      if ((await loc.count()) === 0) continue
      const t = await loc.innerText().catch(() => '')
      if (t?.trim()) return clip(t, 4000)
    }
  }

  const xpReply = `xpath=${XPATH_FIRST_COMMENT_REPLY}`
  for (const frame of page.frames()) {
    const reply = frame.locator(xpReply).first()
    if ((await reply.count()) === 0) continue
    const t = await reply
      .evaluate((el) => {
        let cur: HTMLElement | null = el as HTMLElement
        for (let d = 0; d < 12 && cur; d++) {
          const raw = cur.innerText?.trim() || ''
          if (raw.length > 6 && raw.length < 2000) return raw
          cur = cur.parentElement
        }
        return ''
      })
      .catch(() => '')
    if (t) return clip(t, 4000)
  }

  const xpComp = `xpath=${XPATH_COMMENT_COMPOSER}`
  for (const frame of page.frames()) {
    const c = frame.locator(xpComp).first()
    if ((await c.count()) === 0) continue
    const t = await c
      .evaluate((el) => {
        const p = el.parentElement
        return p?.innerText?.trim() || ''
      })
      .catch(() => '')
    if (t.length > 4) return clip(t, 4000)
  }

  return ''
}
