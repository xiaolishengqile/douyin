/**
 * 回复文案策略：当前阶段固定为「1」，不调用 Coze。
 * 后期接入 Coze 时，可在此根据用户原消息调用 API，再返回模型生成内容。
 */
export async function resolveReplyText(_input: {
  /** 用户侧原文，接入 Coze 时使用 */
  userText?: string
}): Promise<string> {
  void _input
  return '1'
}
