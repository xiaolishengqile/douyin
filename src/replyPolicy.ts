/**
 * 回复文案策略：当前阶段固定为「1」，不调用 Coze。
 * 后期接入 Coze 时，在此根据 `source` 与 `userText` 调用 API，再返回模型生成内容。
 */

export type ReplyChannel = 'private_dm' | 'comment'

export type ReplyContextInput = {
  /** 用户侧原文预览（由 cozeContextPreview 抓取，供 Coze 使用） */
  userText?: string
  /** 渠道：私信 / 评论 */
  source?: ReplyChannel
}

export async function resolveReplyText(
  input: ReplyContextInput = {},
): Promise<string> {
  const preview = input.userText?.trim()
  if (preview) {
    console.log(
      `[replyPolicy] 当前仍固定回复「1」。接入 Coze 后将使用 source=${String(input.source)}，用户原文长度=${preview.length} 字符`,
    )
  }
  void input.source
  return '1'
}
