import { CozeAPI, RoleType } from '@coze/api'
import { config } from './config'

export type ReplyChannel = 'private_dm' | 'comment'

export type ReplyContextInput = {
  /** 用户侧原文预览（由 cozeContextPreview 抓取，供 Coze 使用） */
  userText?: string
  /** 渠道：私信 / 评论 */
  source?: ReplyChannel
}

let client: CozeAPI | null = null

function getCozeClient(): CozeAPI | null {
  if (!config.cozeApiKey || !config.botId) return null
  if (client) return client
  client = new CozeAPI({
    token: config.cozeApiKey,
    baseURL: config.cozeBaseUrl,
  })
  return client
}

function pickAnswerText(messages: Array<{ type?: string; content?: unknown }>): string {
  for (const m of messages) {
    if (m.type !== 'answer') continue
    const c = m.content
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

function buildPrompt(input: ReplyContextInput): string {
  const source = input.source === 'comment' ? '评论区' : '私信'
  const userText = input.userText?.trim() || '（未抓取到用户原文）'
  return [
    `你是抖音创作者账号助手，请根据用户消息生成一条可直接发送的${source}回复。`,
    '要求：',
    '1) 中文、自然、礼貌、简短（不超过60字）；',
    '2) 不要输出分析过程，不要使用 markdown；',
    '3) 若信息不足，给出稳妥的通用回复。',
    `用户消息：${userText}`,
  ].join('\n')
}

export async function resolveReplyText(
  input: ReplyContextInput = {},
): Promise<string> {
  const fallback = '1'
  const coze = getCozeClient()
  if (!coze) {
    const preview = input.userText?.trim()
    if (preview) {
      console.log(
        `[replyPolicy] 未配置 Coze 凭证，回退固定回复「${fallback}」。source=${String(input.source)}，用户原文长度=${preview.length} 字符`,
      )
    }
    return fallback
  }

  try {
    const res = await coze.chat.createAndPoll({
      bot_id: config.botId,
      user_id: config.cozeUserId,
      additional_messages: [
        {
          content: buildPrompt(input),
          content_type: 'text',
          role: RoleType.User,
          type: 'question',
        },
      ],
    })
    const answer = pickAnswerText(
      (res.messages ?? []) as Array<{ type?: string; content?: unknown }>,
    )
    if (answer) return answer
    console.log(
      `[replyPolicy] Coze 返回中未找到 answer，回退固定回复「${fallback}」`,
    )
    return fallback
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[replyPolicy] Coze 调用失败，回退固定回复「${fallback}」: ${message}`)
    return fallback
  }
}
