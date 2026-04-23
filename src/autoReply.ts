import './config'
import { config } from './config'
import { launchPersistentCreatorContext } from './persistentChromium'
import { resolveReplyText } from './replyPolicy'
import type { Page } from 'playwright'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * 尝试在页面上发送一条回复（选择器需随抖音前端调整）。
 * 返回是否认为已点击发送。
 */
async function trySendReply(page: Page, reply: string): Promise<boolean> {
  try {
    const input = page.locator('textarea, [contenteditable="true"]').first()
    if ((await input.count()) === 0) return false
    await input.click({ timeout: 3000 })
    await input.fill(reply)

    const send = page.getByRole('button', { name: /发送|确定|回复/ }).first()
    if ((await send.count()) === 0) return false
    await send.click({ timeout: 3000 })
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const context = await launchPersistentCreatorContext({ headless: false })
  const page = context.pages()[0] ?? (await context.newPage())

  await page.goto(config.autoReplyPageUrl, { waitUntil: 'domcontentloaded' })

  console.log(
    [
      `已打开: ${config.autoReplyPageUrl}`,
      '请确认已执行过 npm run login 且本机 data/user_data 为已登录状态。',
      '当前不使用 Coze；回复文案由 replyPolicy 固定为「1」。',
      `轮询间隔: ${config.autoReplyPollMs} ms；按 Ctrl+C 结束。`,
    ].join('\n'),
  )

  let stop = false
  const onStop = (): void => {
    stop = true
  }
  process.on('SIGINT', onStop)
  process.on('SIGTERM', onStop)

  while (!stop) {
    const text = await resolveReplyText({})
    const sent = await trySendReply(page, text)
    console.log(
      `[${new Date().toISOString()}] 策略回复: ${JSON.stringify(text)} 尝试发送: ${sent ? '已尝试点击发送（若 DOM 不匹配可能未真正发出）' : '未匹配到输入框/按钮，请按需调整 trySendReply'}`,
    )
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
