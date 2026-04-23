import './config'
import { config } from './config'
import {
  openUnrepliedCommentReplyFlow,
  trySendCommentReplyViaXPath,
} from './creatorCommentNav'
import {
  clickUnreadPrivateMessageIfPresent,
  focusPrivateMessageInbox,
  navigateToPrivateMessageInbox,
} from './creatorPrivateMessageNav'
import { sleep } from './creatorXpathHelpers'
import { launchPersistentCreatorContext } from './persistentChromium'
import { resolveReplyText } from './replyPolicy'
import type { Frame, Locator, Page } from 'playwright'

/** 占位符包含「发送」或「请输入」的 input / textarea */
const PLACEHOLDER_INPUT_SELECTOR =
  'textarea[placeholder*="发送"], textarea[placeholder*="请输入"], input[placeholder*="发送"], input[placeholder*="请输入"]'

const CONTENTEDITABLE_SELECTOR = 'div[contenteditable="true"]'

async function isUsableLocator(loc: Locator): Promise<boolean> {
  try {
    return await loc.isVisible()
  } catch {
    return false
  }
}

/**
 * 在单个 frame 内寻找可见的私信输入框（优先 placeholder，再 contenteditable）。
 */
async function pickComposerLocator(frame: Frame): Promise<Locator | null> {
  const ph = frame.locator(PLACEHOLDER_INPUT_SELECTOR)
  const phCount = await ph.count()
  for (let i = 0; i < phCount; i++) {
    const nth = ph.nth(i)
    if (await isUsableLocator(nth)) return nth
  }

  const ce = frame.locator(CONTENTEDITABLE_SELECTOR)
  const ceCount = await ce.count()
  for (let i = 0; i < ceCount; i++) {
    const nth = ce.nth(i)
    if (await isUsableLocator(nth)) return nth
  }

  return null
}

/**
 * 文本为「发送」的 button（避免依赖 class）。
 */
function pickSendButton(frame: Frame): Locator {
  return frame
    .locator('button')
    .filter({ hasText: /^发送$/ })
    .first()
}

/**
 * 在单个 frame 内尝试：聚焦输入框 → 填入文案 → 等待再点击发送。
 */
async function trySendReplyInFrame(
  frame: Frame,
  reply: string,
): Promise<boolean> {
  try {
    const composer = await pickComposerLocator(frame)
    if (!composer) return false

    await composer.click({ timeout: 5000 })
    await composer.fill(reply)

    await sleep(config.delayBetweenFillAndSendMs)

    const sendBtn = pickSendButton(frame)
    if ((await sendBtn.count()) === 0) return false
    if (!(await sendBtn.isVisible().catch(() => false))) return false
    await sendBtn.click({ timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/**
 * 输出当前 frame 内 button / textarea / contenteditable 的部分 HTML，便于人工对照。
 */
async function dumpFrameDomHints(frame: Frame): Promise<void> {
  const meta = `name=${JSON.stringify(frame.name())} url=${frame.url()}`
  try {
    const report = await frame.evaluate(() => {
      const clip = (s: string, n: number): string => {
        const t = s.replace(/\s+/g, ' ').trim()
        return t.length > n ? `${t.slice(0, n)}…` : t
      }
      const lines: string[] = []

      document.querySelectorAll('button').forEach((el, idx) => {
        if (idx >= 30) return
        lines.push(`[button#${idx}] ${clip(el.outerHTML, 400)}`)
      })
      document.querySelectorAll('textarea').forEach((el, idx) => {
        if (idx >= 20) return
        lines.push(`[textarea#${idx}] ${clip(el.outerHTML, 400)}`)
      })
      document
        .querySelectorAll('div[contenteditable="true"]')
        .forEach((el, idx) => {
          if (idx >= 20) return
          lines.push(`[div[contenteditable]#${idx}] ${clip(el.outerHTML, 400)}`)
        })

      if (lines.length === 0) {
        return '（未找到 button / textarea / div[contenteditable="true"]）'
      }
      return lines.join('\n')
    })
    console.warn(`[DOM 调试] ${meta}\n${report}`)
  } catch (err) {
    console.warn(
      `[DOM 调试] ${meta}\n（无法读取：${
        err instanceof Error ? err.message : String(err)
      }）`,
    )
  }
}

/**
 * 遍历主页面与所有 iframe，定位私信输入框与「发送」按钮并发送固定文案。
 * 若全部失败，输出各 frame 内候选元素的部分 HTML。
 */
async function trySendReply(page: Page, reply: string): Promise<boolean> {
  const frames = page.frames()

  for (const frame of frames) {
    const ok = await trySendReplyInFrame(frame, reply)
    if (ok) {
      console.log(
        `[trySendReply] 已在 frame 发送成功 name=${JSON.stringify(frame.name())} url=${frame.url()}`,
      )
      return true
    }
  }

  console.warn(
    '[trySendReply] 未在任何 frame 内完成发送，以下为各 frame 的 button / textarea / contenteditable 片段：',
  )
  for (const frame of frames) {
    await dumpFrameDomHints(frame)
  }
  return false
}

async function main(): Promise<void> {
  const context = await launchPersistentCreatorContext({ headless: false })
  const page = context.pages()[0] ?? (await context.newPage())

  console.log(
    [
      `主流程：首页 → 互动管理 → 私信管理 → 若有未读红点则回复「1」。`,
      `若无未读私信：评论管理 → 全部评论 → 未回复 → 首条「回复」→ XPath 输入框+发送；`,
      `评论处理后再等 ${config.delayAfterCommentReturnToDmMs} ms 并点击「私信管理」回到私信循环。`,
      `首页 URL: ${config.creatorHomeUrl}`,
      `（备用直达页，当前脚本未用作入口：${config.autoReplyPageUrl}）`,
      '请确认已执行过 npm run login 且本机 data/user_data 为已登录状态。',
      '当前不使用 Coze；回复文案由 replyPolicy 固定为「1」。',
      `轮询间隔: ${config.autoReplyPollMs} ms；按 Ctrl+C 结束。`,
      `节流：无未读私信后等待 ${config.cooldownBeforeCommentMs} ms 才进入评论；`,
      `打开会话/回复面板后等待 ${config.delayBeforeComposeMs} ms 再输入；`,
      `发送后冷却 ${config.cooldownAfterSendMs} ms（失败则 ${config.cooldownAfterSendFailedMs} ms）。`,
    ].join('\n'),
  )

  let inboxNavOk = false
  try {
    await navigateToPrivateMessageInbox(page, config.creatorHomeUrl)
    inboxNavOk = true
  } catch (err) {
    console.error('[导航] 进入私信管理失败：', err)
    console.error(
      '[导航] 将尝试在「当前页」继续轮询发送；若页面不对，请检查 XPath 或网络。',
    )
  }

  let stop = false
  const onStop = (): void => {
    stop = true
  }
  process.on('SIGINT', onStop)
  process.on('SIGTERM', onStop)

  while (!stop) {
    const text = await resolveReplyText({})
    let sent = false

    if (inboxNavOk) {
      const openedUnread = await clickUnreadPrivateMessageIfPresent(page)
      if (openedUnread) {
        console.log(
          `[${new Date().toISOString()}] [节流] 已打开未读会话，等待 ${config.delayBeforeComposeMs} ms 后再输入`,
        )
        await sleep(config.delayBeforeComposeMs)
        sent = await trySendReply(page, text)
        console.log(
          `[${new Date().toISOString()}] [私信] 策略回复: ${JSON.stringify(text)} 尝试发送: ${sent ? '已在某一 frame 内完成点击发送' : '失败，已输出 DOM 调试片段'}`,
        )
        const cool = sent
          ? config.cooldownAfterSendMs
          : config.cooldownAfterSendFailedMs
        console.log(
          `[${new Date().toISOString()}] [节流] 发送结束，冷却 ${cool} ms 再进入下一轮`,
        )
        await sleep(cool)
      } else {
        console.log(
          `[${new Date().toISOString()}] 未发现未读私信，${config.cooldownBeforeCommentMs} ms 后再尝试评论「未回复」（避免与私信抢操作）`,
        )
        await sleep(config.cooldownBeforeCommentMs)
        const openedComment = await openUnrepliedCommentReplyFlow(page)
        if (openedComment) {
          console.log(
            `[${new Date().toISOString()}] [节流] 已打开评论回复区，等待 ${config.delayBeforeComposeMs} ms 后再输入`,
          )
          await sleep(config.delayBeforeComposeMs)
          sent = await trySendCommentReplyViaXPath(page, text)
          console.log(
            `[${new Date().toISOString()}] [评论] 策略回复: ${JSON.stringify(text)} XPath 发送: ${sent ? '成功' : '失败'}`,
          )
          const cool = sent
            ? config.cooldownAfterSendMs
            : config.cooldownAfterSendFailedMs
          console.log(
            `[${new Date().toISOString()}] [节流] 发送结束，冷却 ${cool} ms 再进入下一轮`,
          )
          await sleep(cool)
          console.log(
            `[${new Date().toISOString()}] [节流] 等待 ${config.delayAfterCommentReturnToDmMs} ms 后切回「私信管理」`,
          )
          await sleep(config.delayAfterCommentReturnToDmMs)
          const back = await focusPrivateMessageInbox(page)
          console.log(
            `[${new Date().toISOString()}] ${back ? '已切回私信管理' : '切回私信管理失败（下一轮仍会尝试检测未读）'}`,
          )
        } else {
          console.log(
            `[${new Date().toISOString()}] 评论流程未打开回复区（XPath/页面可能无未回复项），跳过发送`,
          )
        }
      }
    } else {
      sent = await trySendReply(page, text)
      console.log(
        `[${new Date().toISOString()}] 策略回复: ${JSON.stringify(text)} 尝试发送: ${sent ? '已在某一 frame 内完成点击发送' : '失败，已输出 DOM 调试片段'}`,
      )
      await sleep(
        sent ? config.cooldownAfterSendMs : config.cooldownAfterSendFailedMs,
      )
    }

    for (let w = 0; w < config.autoReplyPollMs && !stop; w += 250) {
      await sleep(250)
    }
  }

  process.off('SIGINT', onStop)
  process.off('SIGTERM', onStop)
  await context.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
