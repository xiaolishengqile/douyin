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

  /** 轮询间隔（毫秒） */
  autoReplyPollMs: parsePositiveInt(process.env.AUTO_REPLY_POLL_MS, 8000),
} as const
