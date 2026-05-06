import type { Page } from 'playwright'

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function clickXPathInAnyFrame(
  page: Page,
  xpath: string,
  label: string,
): Promise<boolean> {
  if (!xpath.trim()) return false
  const xp = `xpath=${xpath}`
  for (const frame of page.frames()) {
    const loc = frame.locator(xp)
    if ((await loc.count()) === 0) continue
    const first = loc.first()
    if (!(await first.isVisible().catch(() => false))) continue
    await first.scrollIntoViewIfNeeded().catch(() => undefined)
    await first.click({ timeout: 15_000 })
    console.log(
      `[导航] ${label} 已点击（XPath） frame=${JSON.stringify(frame.name())} url=${frame.url()}`,
    )
    return true
  }
  return false
}

export async function clickExactTextInAnyFrame(
  page: Page,
  text: string,
  label: string,
): Promise<boolean> {
  for (const frame of page.frames()) {
    const loc = frame.getByText(text, { exact: true }).first()
    if ((await loc.count()) === 0) continue
    if (!(await loc.isVisible().catch(() => false))) continue
    await loc.scrollIntoViewIfNeeded().catch(() => undefined)
    await loc.click({ timeout: 15_000 })
    console.log(`[导航] ${label} 已点击（精确文本「${text}」）`)
    return true
  }
  return false
}
