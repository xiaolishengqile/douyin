import './config'
import { config } from './config'
import {
  extractCommentUserText,
  extractPrivateMessageUserText,
  printCozePreviewBox,
} from './cozeContextPreview'
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

    await sleep(config.delayBetweenFillAndSendMs())

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

function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function buildDmSignature(s: string): string {
  const t = normalizeText(s)
  return t.length > 240 ? t.slice(-240) : t
}

function tailLine(s: string): string {
  const rows = s
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)
  return rows.length ? rows[rows.length - 1] : ''
}

function isLikelyOwnMessage(activeTail: string, lastSentReplyText: string): boolean {
  const a = normalizeText(activeTail)
  const b = normalizeText(lastSentReplyText)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

async function main(): Promise<void> {
  const context = await launchPersistentCreatorContext({ headless: false })
  const page = context.pages()[0] ?? (await context.newPage())

  console.log(
    [
      `主流程：首页 → 互动管理 → 私信管理 → 若有未读红点则回复「1」。`,
      `若无未读私信：评论管理 → 全部评论 → 未回复 → 首条「回复」→ XPath 输入框+发送；`,
      `评论处理后再等（随机）${config.delayAfterCommentReturnToDmMs()} ms 并点击「私信管理」回到私信循环。`,
      `首页 URL: ${config.creatorHomeUrl}`,
      `（备用直达页，当前脚本未用作入口：${config.autoReplyPageUrl}）`,
      '请确认已执行过 npm run login 且本机 data/user_data 为已登录状态。',
      '当前不使用 Coze；回复文案由 replyPolicy 固定为「1」。',
      `轮询间隔: auto/固定可配；按 Ctrl+C 结束。`,
      `节流：支持固定毫秒或 auto 随机区间（见 .env.example）。`,
      `打开会话/回复面板后等待可配置；发送后冷却可配置。`,
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
  let lastDmSignature = ''
  let lastSentReplyText = ''
  const onStop = (): void => {
    stop = true
  }
  process.on('SIGINT', onStop)
  process.on('SIGTERM', onStop)

  async function switchToPrivateMessageInbox(tag: string): Promise<boolean> {
    const wait = config.delayBeforeSwitchToDmMs()
    console.log(
      `[${new Date().toISOString()}] [节流] ${wait} ms 后切回「私信管理」(${tag})`,
    )
    await sleep(wait)
    return focusPrivateMessageInbox(page)
  }

  while (!stop) {
    let sent = false

    if (inboxNavOk) {
      const ensuredInbox = await switchToPrivateMessageInbox('每轮开始')
      if (!ensuredInbox) {
        console.warn(
          `[${new Date().toISOString()}] [导航] 本轮开始时切回私信管理失败，将继续尝试检测`,
        )
      }
      const openedUnread = await clickUnreadPrivateMessageIfPresent(page)
      if (openedUnread) {
        const composeWait = config.delayBeforeComposeMs()
        console.log(
          `[${new Date().toISOString()}] [节流] 已打开未读会话，等待 ${composeWait} ms 后再输入`,
        )
        await sleep(composeWait)
        const dmPreview = await extractPrivateMessageUserText(page)
        const dmSig = buildDmSignature(dmPreview)
        if (dmSig && dmSig === lastDmSignature) {
          console.log(
            `[${new Date().toISOString()}] [私信] 当前会话内容与上次已处理一致，跳过重复回复`,
          )
          await sleep(config.cooldownAfterSendFailedMs())
          continue
        }
        printCozePreviewBox(
          'Coze 预留 · 未读私信（拟作为 user 消息发送）',
          dmPreview ||
            '（未能自动抓取正文；可在 .env 配置 DOUYIN_XPATH_DM_USER_MESSAGE 精确定位）',
        )
        const text = await resolveReplyText({
          userText: dmPreview || undefined,
          source: 'private_dm',
        })
        sent = await trySendReply(page, text)
        if (dmSig) lastDmSignature = dmSig
        lastSentReplyText = text
        console.log(
          `[${new Date().toISOString()}] [私信] 策略回复: ${JSON.stringify(text)} 尝试发送: ${sent ? '已在某一 frame 内完成点击发送' : '失败，已输出 DOM 调试片段'}`,
        )
        const cool = sent
          ? config.cooldownAfterSendMs()
          : config.cooldownAfterSendFailedMs()
        console.log(
          `[${new Date().toISOString()}] [节流] 发送结束，冷却 ${cool} ms 再进入下一轮`,
        )
        await sleep(cool)
        if (sent) {
          const afterSendPreview = await extractPrivateMessageUserText(page)
          const afterSendSig = buildDmSignature(afterSendPreview)
          if (afterSendSig) lastDmSignature = afterSendSig
        }
      } else {
        const activeDmPreview = await extractPrivateMessageUserText(page)
        const activeSig = buildDmSignature(activeDmPreview)
        const activeTail = tailLine(activeDmPreview)
        const likelyOwnTail =
          !!lastSentReplyText &&
          isLikelyOwnMessage(activeTail, lastSentReplyText)

        if (activeSig && activeSig !== lastDmSignature && !likelyOwnTail) {
          console.log(
            `[${new Date().toISOString()}] 未命中未读红点，但检测到当前会话内容变化，尝试直接回复`,
          )
          printCozePreviewBox(
            'Coze 预留 · 当前会话新消息（拟作为 user 消息发送）',
            activeDmPreview,
          )
          const text = await resolveReplyText({
            userText: activeDmPreview,
            source: 'private_dm',
          })
          sent = await trySendReply(page, text)
          lastDmSignature = activeSig
          lastSentReplyText = text
          console.log(
            `[${new Date().toISOString()}] [私信-当前会话] 策略回复: ${JSON.stringify(text)} 尝试发送: ${sent ? '已在某一 frame 内完成点击发送' : '失败，已输出 DOM 调试片段'}`,
          )
          const cool = sent
            ? config.cooldownAfterSendMs()
            : config.cooldownAfterSendFailedMs()
          console.log(
            `[${new Date().toISOString()}] [节流] 发送结束，冷却 ${cool} ms 再进入下一轮`,
          )
          await sleep(cool)
          if (sent) {
            const afterSendPreview = await extractPrivateMessageUserText(page)
            const afterSendSig = buildDmSignature(afterSendPreview)
            if (afterSendSig) lastDmSignature = afterSendSig
          }
          continue
        }

        if (activeSig) {
          lastDmSignature = activeSig
        }
        const beforeCommentWait = config.cooldownBeforeCommentMs()
        console.log(
          `[${new Date().toISOString()}] 未发现未读私信，${beforeCommentWait} ms 后再尝试评论「未回复」（避免与私信抢操作）`,
        )
        await sleep(beforeCommentWait)
        const openedComment = await openUnrepliedCommentReplyFlow(page)
        if (openedComment) {
          const composeWait = config.delayBeforeComposeMs()
          console.log(
            `[${new Date().toISOString()}] [节流] 已打开评论回复区，等待 ${composeWait} ms 后再输入`,
          )
          await sleep(composeWait)
          const commentPreview = await extractCommentUserText(page)
          printCozePreviewBox(
            'Coze 预留 · 未回复评论（拟作为 user 消息发送）',
            commentPreview ||
              '（未能自动抓取正文；可在 .env 配置 DOUYIN_XPATH_COMMENT_USER_TEXT 精确定位）',
          )
          const text = await resolveReplyText({
            userText: commentPreview || undefined,
            source: 'comment',
          })
          sent = await trySendCommentReplyViaXPath(page, text)
          console.log(
            `[${new Date().toISOString()}] [评论] 策略回复: ${JSON.stringify(text)} XPath 发送: ${sent ? '成功' : '失败'}`,
          )
          const cool = sent
            ? config.cooldownAfterSendMs()
            : config.cooldownAfterSendFailedMs()
          console.log(
            `[${new Date().toISOString()}] [节流] 发送结束，冷却 ${cool} ms 再进入下一轮`,
          )
          await sleep(cool)
          const afterCommentWait = config.delayAfterCommentReturnToDmMs()
          console.log(
            `[${new Date().toISOString()}] [节流] 等待 ${afterCommentWait} ms 后切回「私信管理」`,
          )
          await sleep(afterCommentWait)
          const back = await switchToPrivateMessageInbox('评论发送后')
          console.log(
            `[${new Date().toISOString()}] ${back ? '已切回私信管理' : '切回私信管理失败（下一轮仍会尝试检测未读）'}`,
          )
        } else {
          console.log(
            `[${new Date().toISOString()}] 评论流程未打开回复区（XPath/页面可能无未回复项），跳过发送`,
          )
          const back = await switchToPrivateMessageInbox('评论未命中后')
          console.log(
            `[${new Date().toISOString()}] ${back ? '评论未命中后已切回私信管理' : '评论未命中后切回私信管理失败（下一轮继续尝试）'}`,
          )
        }
      }
    } else {
      const text = await resolveReplyText({ source: 'private_dm' })
      sent = await trySendReply(page, text)
      console.log(
        `[${new Date().toISOString()}] 策略回复: ${JSON.stringify(text)} 尝试发送: ${sent ? '已在某一 frame 内完成点击发送' : '失败，已输出 DOM 调试片段'}`,
      )
      await sleep(
        sent ? config.cooldownAfterSendMs() : config.cooldownAfterSendFailedMs(),
      )
    }

    for (let w = 0; w < config.autoReplyPollMs() && !stop; w += 250) {
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
