import dotenv from 'dotenv'

dotenv.config()

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function parseMsRange(
  raw: string | undefined,
): { min: number; max: number } | null {
  if (!raw) return null
  const s = raw.trim()
  const m = s.match(/^(\d+)\s*[-,~]\s*(\d+)$/)
  if (!m) return null
  const a = Math.floor(Number(m[1]))
  const b = Math.floor(Number(m[2]))
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null
  return { min: Math.min(a, b), max: Math.max(a, b) }
}

function randInt(min: number, max: number): number {
  if (min >= max) return min
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sampleMs(envName: string, fallback: number): number {
  const raw = process.env[envName]?.trim()
  const rangeEnv = process.env[`${envName}_AUTO_RANGE`]

  const fixed = parsePositiveInt(raw, -1)
  if (fixed > 0) return fixed

  const directRange = parseMsRange(raw)
  if (directRange) return randInt(directRange.min, directRange.max)

  if (raw?.toLowerCase() === 'auto') {
    const autoRange = parseMsRange(rangeEnv)
    if (autoRange) return randInt(autoRange.min, autoRange.max)
    const min = Math.max(200, Math.floor(fallback * 0.8))
    const max = Math.max(min, Math.floor(fallback * 1.2))
    return randInt(min, max)
  }

  return fallback
}

/**
 * 环境变量集中配置。
 * Coze 相关项已用于智能回复。
 */
export const config = {
  /** Coze 智能体（已接入）。未配置 COZE_API_KEY/BOT_ID 时自动回退固定回复。 */
  cozeApiKey: process.env.COZE_API_KEY ?? '',
  botId: process.env.BOT_ID ?? '',
  cozeBaseUrl: process.env.COZE_BASE_URL?.trim() || 'https://api.coze.cn',
  cozeUserId: process.env.COZE_USER_ID?.trim() || 'douyin-auto-reply',

  /** 自动回复脚本打开的页面（私信/评论等，可按需改成具体子路径） */
  autoReplyPageUrl:
    process.env.DOUYIN_REPLY_PAGE_URL ??
    'https://creator.douyin.com/creator-micro/interactive/message',

  /**
   * 私信侧边栏导航入口：先进入创作平台首页，再按 XPath 点「互动管理 → 私信管理」。
   */
  creatorHomeUrl:
    process.env.DOUYIN_CREATOR_HOME_URL ?? 'https://creator.douyin.com/',

  /**
   * 轮询间隔（毫秒）：每一轮「检测私信 → 必要时再走评论」之间的基础间隔。
   * 默认加大，避免请求过密触发风控。
   */
  autoReplyPollMs: () => sampleMs('AUTO_REPLY_POLL_MS', 25_000),

  /**
   * 已判定「当前无未读私信」后，等待多久再开始点「评论管理…」，
   * 避免私信列表/红点尚未渲染完或上一条还在发送就跳转评论。
   */
  cooldownBeforeCommentMs: () =>
    sampleMs('DOUYIN_COOLDOWN_BEFORE_COMMENT_MS', 18_000),

  /** 打开未读会话或评论「回复」后，等待界面稳定再调用 trySendReply */
  delayBeforeComposeMs: () => sampleMs('DOUYIN_DELAY_BEFORE_COMPOSE_MS', 4_000),

  /** 一次 trySendReply 结束后（成功）额外停顿，再进入下一轮 */
  cooldownAfterSendMs: () => sampleMs('DOUYIN_COOLDOWN_AFTER_SEND_MS', 10_000),

  /** trySendReply 失败后的停顿，避免立刻连点 */
  cooldownAfterSendFailedMs: () =>
    sampleMs('DOUYIN_COOLDOWN_AFTER_SEND_FAIL_MS', 6_000),

  /** 侧栏、筛选、下拉等每一步之间的间隔（私信/评论导航共用） */
  uiStepDelayMs: () => sampleMs('DOUYIN_UI_STEP_DELAY_MS', 2_000),

  /** 输入框 fill 之后、点击「发送」之前 */
  delayBetweenFillAndSendMs: () =>
    sampleMs('DOUYIN_DELAY_FILL_TO_SEND_MS', 900),

  /**
   * 评论 XPath 发送完成后，等待多久再点击侧栏「私信管理」回到私信循环。
   */
  delayAfterCommentReturnToDmMs: () =>
    sampleMs('DOUYIN_DELAY_AFTER_COMMENT_RETURN_DM_MS', 6_000),

  /** 每次执行「切回私信管理」动作前，额外等待多久（用于等页面刷新稳定） */
  delayBeforeSwitchToDmMs: () =>
    sampleMs('DOUYIN_DELAY_BEFORE_SWITCH_DM_MS', 1_000),
} as const
