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
 * 抓取拟发给 Coze 的私信上下文（区分「对方/我方」）。
 * 优先输出最近多条会话，形如：
 * 对方: xxx
 * 我方: yyy
 */
export async function extractPrivateMessageUserText(page: Page): Promise<string> {
  if (XPATH_DM_USER_MESSAGE) {
    const xp = `xpath=${XPATH_DM_USER_MESSAGE}`
    for (const frame of page.frames()) {
      const loc = frame.locator(xp)
      const count = await loc.count()
      if (count === 0) continue
      const tryCount = Math.min(count, 6)
      for (let i = 0; i < tryCount; i++) {
        const structured = await loc
          .nth(i)
          .evaluate((root) => {
            const clean = (s: string): string => s.replace(/\s+/g, ' ').trim()
            const isTime = (s: string): boolean => /^\d{1,2}:\d{2}$/.test(s.trim())
            const msgSelector =
              'pre[class*="text-item-message"], div[class*="box-item-message"] pre, [class*="text-item-message"]'
            let rawRows: HTMLElement[] = []
            try {
              rawRows = Array.from(
                (root as Element).querySelectorAll(':scope > div[class*="box-item-"]'),
              ) as HTMLElement[]
            } catch {
              rawRows = []
            }
            const rows = (rawRows.length
              ? rawRows
              : (Array.from(
                  root.querySelectorAll('div[class*="box-item-"]'),
                ) as HTMLElement[]
              ).filter((el) => {
                const cls = el.className || ''
                if (!cls.includes('box-item-')) return false
                if (cls.includes('box-item-message-')) return false
                return cls.includes('time-') || el.querySelector('[class*="box-item-message"]') !== null
              }))
              .map((box) => {
                const cls = box.className || ''
                if (/time-/i.test(cls)) return ''
                const isMe = /\bis-me\b/i.test(cls) || /is-me-/i.test(cls)
                const msgNode = box.querySelector(msgSelector) as HTMLElement | null
                const msg = clean(msgNode?.innerText || '')
                if (!msg || isTime(msg)) return ''
                return `${isMe ? '我方' : '对方'}：${msg}`
              })
              .filter((v): v is string => !!v)
            if (!rows.length) return ''
            const deduped: string[] = []
            for (const row of rows) {
              if (deduped[deduped.length - 1] === row) continue
              deduped.push(row)
            }
            return deduped.slice(-12).join('\n')
          })
          .catch(() => '')
        if (structured) return clip(structured, 4000)
      }
    }
  }

  for (const frame of page.frames()) {
    const conversation = await frame
      .evaluate(() => {
        const clean = (s: string): string => s.replace(/\s+/g, ' ').trim()
        const isTime = (s: string): boolean => /^\d{1,2}:\d{2}$/.test(s.trim())
        const rows = (Array.from(
          document.querySelectorAll('div[class*="box-item-"]'),
        ) as HTMLElement[])
          .filter((el) => {
            const cls = el.className || ''
            if (!cls.includes('box-item-')) return false
            if (cls.includes('box-item-message-')) return false
            return cls.includes('time-') || el.querySelector('[class*="box-item-message-"]') !== null
          })
          .map((box) => {
            const cls = box.className || ''
            if (/time-/i.test(cls)) return ''
            const isMe = /\bis-me\b/i.test(cls) || /is-me-/i.test(cls)
            const msgNode = box.querySelector(
              'pre[class*="text-item-message"], div[class*="box-item-message"] pre, [class*="text-item-message"]',
            ) as HTMLElement | null
            const msg = clean(msgNode?.innerText || '')
            if (!msg || isTime(msg)) return ''
            return `${isMe ? '我方' : '对方'}：${msg}`
          })
          .filter((v): v is string => !!v)
        if (!rows.length) return ''
        const deduped: string[] = []
        for (const row of rows) {
          if (deduped[deduped.length - 1] === row) continue
          deduped.push(row)
        }
        return deduped.slice(-12).join('\n')
      })
      .catch(() => '')
    if (conversation) return clip(conversation, 4000)
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
