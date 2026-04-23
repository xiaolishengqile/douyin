import dotenv from 'dotenv'

dotenv.config()

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/**
 * 环境变量集中配置。
 * Coze 相关项预留，当前回复逻辑不读取；接入智能化时再使用。
 */
export const config = {
  /** 后期接入 Coze 时填写 */
  cozeApiKey: process.env.COZE_API_KEY ?? '',
  botId: process.env.BOT_ID ?? '',

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
  autoReplyPollMs: parsePositiveInt(process.env.AUTO_REPLY_POLL_MS, 25_000),

  /**
   * 已判定「当前无未读私信」后，等待多久再开始点「评论管理…」，
   * 避免私信列表/红点尚未渲染完或上一条还在发送就跳转评论。
   */
  cooldownBeforeCommentMs: parsePositiveInt(
    process.env.DOUYIN_COOLDOWN_BEFORE_COMMENT_MS,
    18_000,
  ),

  /** 打开未读会话或评论「回复」后，等待界面稳定再调用 trySendReply */
  delayBeforeComposeMs: parsePositiveInt(
    process.env.DOUYIN_DELAY_BEFORE_COMPOSE_MS,
    4_000,
  ),

  /** 一次 trySendReply 结束后（成功）额外停顿，再进入下一轮 */
  cooldownAfterSendMs: parsePositiveInt(
    process.env.DOUYIN_COOLDOWN_AFTER_SEND_MS,
    10_000,
  ),

  /** trySendReply 失败后的停顿，避免立刻连点 */
  cooldownAfterSendFailedMs: parsePositiveInt(
    process.env.DOUYIN_COOLDOWN_AFTER_SEND_FAIL_MS,
    6_000,
  ),

  /** 侧栏、筛选、下拉等每一步之间的间隔（私信/评论导航共用） */
  uiStepDelayMs: parsePositiveInt(process.env.DOUYIN_UI_STEP_DELAY_MS, 2_000),

  /** 输入框 fill 之后、点击「发送」之前 */
  delayBetweenFillAndSendMs: parsePositiveInt(
    process.env.DOUYIN_DELAY_FILL_TO_SEND_MS,
    900,
  ),

  /**
   * 评论 XPath 发送完成后，等待多久再点击侧栏「私信管理」回到私信循环。
   */
  delayAfterCommentReturnToDmMs: parsePositiveInt(
    process.env.DOUYIN_DELAY_AFTER_COMMENT_RETURN_DM_MS,
    6_000,
  ),
} as const
