# 抖音创作服务平台自动化（Playwright）

基于 **Node.js + TypeScript + Playwright**，在 **抖音创作服务平台** 上完成：持久化登录、私信未读自动回复、无未读时走 **评论「未回复」** 流程并回到私信循环。当前回复文案固定为 **`1`**（见 `src/replyPolicy.ts`），后续可接入 Coze 等智能化能力。

---

## 环境要求

- **Node.js**：建议 **18+**（与当前依赖兼容即可）
- **操作系统**：macOS / Windows / Linux（Playwright 会下载对应 Chromium）
- 能访问 **https://creator.douyin.com/** 的网络环境

---

## 五分钟上手

### 1. 安装依赖

```bash
git clone <仓库地址> douyin
cd douyin
npm install
```

### 2. 安装浏览器内核（必做）

首次克隆或升级 `playwright` 后，若运行报错 **Executable doesn't exist**，请执行：

```bash
npx playwright install chromium
```

### 3. 环境变量（可选）

```bash
cp .env.example .env
```

- **当前脚本不依赖 Coze**：`.env` 里 Coze 相关项可留空。
- 需要调 **XPath、节流间隔、首页 URL** 时，在 `.env` 中按 `.env.example` 注释逐项配置即可。

### 4. 扫码登录（首次 / Cookie 失效时）

```bash
npm run login
```

- 会打开 **非无头** Chromium，并写入 **`data/user_data`**（Cookie、LocalStorage 等）。
- 终端提示扫码登录完成后，**在终端按回车** 关闭浏览器。
- **`data/user_data` 含账号敏感信息，请勿提交到 Git**（仓库已 `.gitignore`）。

### 5. 运行自动回复主流程

```bash
npm run auto-reply
```

- 需先完成上一步登录，保证 `data/user_data` 为已登录状态。
- 按 **Ctrl+C** 结束脚本。

---

## 脚本与命令一览

| 命令 | 说明 |
|------|------|
| `npm run login` | 持久化登录：打开创作平台首页并扫码 |
| `npm run auto-reply` | 主循环：私信未读 → 无则评论未回复 → 再回私信 |
| `npm run typecheck` | TypeScript 检查（不产出文件） |
| `npm run build` | 编译到 `dist/`（日常跑脚本一般用 `tsx` 即可） |

---

## 目录与源码说明

```
douyin/
├── data/user_data/          # Playwright 持久化用户数据（登录态）
├── src/
│   ├── login.ts             # 仅登录：写 user_data
│   ├── autoReply.ts         # 主入口：私信 / 评论 / 发送 / 节流
│   ├── config.ts            # 环境变量与默认节流参数
│   ├── replyPolicy.ts       # 回复文案策略（当前固定返回 "1"）
│   ├── cozeContextPreview.ts # 未读私信/评论正文预览（终端输出，供后续 Coze）
│   ├── persistentChromium.ts # 启动带 Stealth 的持久化 Chromium
│   ├── creatorXpathHelpers.ts # 跨 frame 的 XPath / 文本点击工具
│   ├── creatorPrivateMessageNav.ts # 互动管理、私信管理、未读红点、回私信侧栏
│   └── creatorCommentNav.ts # 评论管理、筛选未回复、XPath 评论输入与发送
├── .env.example             # 环境变量模板
├── package.json
├── tsconfig.json
└── README.md                # 本说明
```

---

## 业务流程（给业务 / 测试同事）

1. **启动**：从配置的首页进入 **互动管理 → 私信管理**。
2. **私信**：若列表存在 **未读红点**（XPath 可配），点开会话，用通用输入逻辑回复 **`1`**。
3. **无未读私信**：等待一段时间（防风控），进入 **评论管理 → 全部评论 → 未回复 → 首条回复**，再用 **评论专用 XPath 输入框 + 发送** 回复 **`1`**。
4. **评论之后**：再等待一段时间，点击侧栏 **私信管理**，回到步骤 2，形成循环。

各步骤之间有 **可配置冷却**（见下文「配置说明」），避免操作过快触发平台风控。

---

## 配置说明（`.env` / `src/config.ts`）

常用环境变量在 **`.env.example`** 中有中文注释。简要分类：

| 类型 | 示例变量 | 作用 |
|------|------------|------|
| 入口 URL | `DOUYIN_CREATOR_HOME_URL` | 创作平台首页 |
| 节流 | `DOUYIN_COOLDOWN_BEFORE_COMMENT_MS` | 判定无未读私信后，再等多久才进评论 |
| 节流 | `DOUYIN_DELAY_BEFORE_COMPOSE_MS` | 打开会话/评论回复区后，再等多久再输入 |
| 节流 | `AUTO_REPLY_POLL_MS` | 每轮大循环额外间隔 |
| XPath | `DOUYIN_XPATH_INTERACTION` 等 | 侧栏、未读、评论输入框、发送按钮等（DOM 变更时改这里） |

默认值集中在 **`src/config.ts`**，改代码或改 `.env` 均可；**生产/多环境建议只改 `.env`**。

---

## 常见问题

**Q：报错找不到 Chromium / Executable doesn't exist**  
A：执行 `npx playwright install chromium`（或 `npx playwright install` 安装全部浏览器）。

**Q：`npm run auto-reply` 点不到元素**  
A：抖音前端改版会导致 XPath 失效。对照浏览器开发者工具更新 `.env` 中对应 `DOUYIN_XPATH_*`，或临时看终端里脚本输出的 DOM 调试信息（若已实现）。

**Q：触发风控 / 操作太快**  
A：增大 `DOUYIN_COOLDOWN_BEFORE_COMMENT_MS`、`DOUYIN_DELAY_BEFORE_COMPOSE_MS`、`DOUYIN_COOLDOWN_AFTER_SEND_MS`、`AUTO_REPLY_POLL_MS` 等。

**Q：想改成智能回复而不是固定 `1`**  
A：改 **`src/replyPolicy.ts`** 中 `resolveReplyText`；后续在此接入 Coze API 即可，主流程无需大改。

**Q：终端里「Coze 预留」框是什么**  
A：运行 `npm run auto-reply` 时，会在尝试回复前把**抓取到的用户侧文案预览**打印出来（私信 / 评论各一套启发式，可用 `DOUYIN_XPATH_DM_USER_MESSAGE`、`DOUYIN_XPATH_COMMENT_USER_TEXT` 配准）。接入 Coze 时把该字符串作为 user 消息即可；逻辑见 **`src/cozeContextPreview.ts`**。

---

## 依赖说明（技术向）

- **playwright**：浏览器自动化与持久化上下文。
- **playwright-extra** + **puppeteer-extra-plugin-stealth**：降低简单自动化特征（不保证绕过所有风控）。
- **dotenv**：加载 `.env`。
- **tsx**：开发时直接运行 TypeScript。

---

## 许可与合规

本项目仅供 **合规、经授权** 的账号与场景使用。请遵守抖音/字节平台用户协议与相关法律法规；滥用自动化可能导致账号限制或法律责任。

若文档与代码不一致，**以仓库内源码为准**；欢迎同事补充 PR 更新本 README。
