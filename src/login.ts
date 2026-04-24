import * as readline from 'node:readline'
import {
  ensureUserDataDir,
  launchPersistentCreatorContext,
  USER_DATA_DIR,
} from './persistentChromium'
import './config'

const CREATOR_URL = 'https://creator.douyin.com/'

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    rl.question('', () => {
      rl.close()
      resolve()
    })
  })
}

async function main(): Promise<void> {
  ensureUserDataDir()
  console.log(`用户数据目录: ${USER_DATA_DIR}`)

  const context = await launchPersistentCreatorContext({ headless: false })

  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto(CREATOR_URL, { waitUntil: 'domcontentloaded' })

  console.log(
    '请在浏览器中完成扫码登录，登录成功后请在终端输入回车键关闭浏览器',
  )
  await waitForEnter()

  await context.close()
  console.log('浏览器已关闭，登录状态已写入磁盘。')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
