/**
 * Real-browser diagnosis of the terminal panel against the live GUI.
 * Usage: node scripts/browser-diag.mjs
 */
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

const consoleMessages = []
page.on('console', (msg) => { consoleMessages.push(msg.type() + ': ' + msg.text()) })
page.on('pageerror', (err) => { consoleMessages.push('PAGEERROR: ' + err.message) })

await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded', timeout: 30000 })
// Let the SPA boot and plugins mount.
await page.waitForTimeout(6000)

const entry = page.locator('[data-dsh-terminal-entry]')
const entryCount = await entry.count()
console.log('[diag] sidebar entry count:', entryCount)
if (entryCount > 0) {
  await entry.first().click()
  await page.waitForTimeout(2000)
}

const view = page.locator('[data-dsh-terminal-view]')
console.log('[diag] panel view count:', await view.count())
const htmlActive = await page.evaluate(() => document.documentElement.hasAttribute('data-dsh-terminal-active'))
console.log('[diag] html active attr:', htmlActive)

const info = await page.evaluate(() => {
  const cssTags = Array.from(document.querySelectorAll('style')).map(s => s.getAttribute('data-dsh-terminal-css') !== null ? 'term-css' : (s.getAttribute('data-dsh-terminal-xterm') !== null ? 'xterm-css' : null)).filter(Boolean)
  let termRules = null
  try {
    const sheet = Array.from(document.styleSheets).find(s => s.ownerNode?.getAttribute && s.ownerNode.getAttribute('data-dsh-terminal-css') !== null)
    if (sheet) termRules = Array.from(sheet.cssRules).map(r => r.selectorText).filter(Boolean)
  } catch (e) { termRules = 'ERR ' + e.message }
  const panelStyle = getComputedStyle(document.querySelector('.dshTermPanel') ?? document.body)
  const viewStyle = getComputedStyle(document.querySelector('[data-dsh-terminal-view]') ?? document.body)
  const chain = []
  let el = document.querySelector('[data-dsh-terminal-view] .dshTermPanel')
  const chainNames = ['panel', 'header', 'tabBar', 'toolbar', 'banner', 'body', 'tabDiv', 'wrap', 'container']
  const selectors = ['.dshTermPanel', '.dshTermHeader', '.dshTermTabBar', '.dshTermToolbar', '.dshTermBanner', '.dshTermBody', '[data-dsh-terminal-view] .dshTermBody > div', '.dshTermWrap', '.dshTermContainer']
  for (let i = 0; i < selectors.length; i++) {
    const node = document.querySelector(selectors[i])
    if (!node) { chain.push(chainNames[i] + ': MISSING'); continue }
    const r = node.getBoundingClientRect()
    const cs = getComputedStyle(node)
    chain.push(chainNames[i] + ': ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' display=' + cs.display + ' flex=' + cs.flex + ' minH=' + cs.minHeight)
  }
  const view = document.querySelector('[data-dsh-terminal-view]')
  if (!view) return { error: "no view" }
  const rect = view.getBoundingClientRect()
  const xterm = view.querySelector('.xterm')
  const canvas = view.querySelector('.xterm canvas, canvas.xterm')
  const banners = Array.from(view.querySelectorAll('.dshTermBanner')).map(b => b.textContent?.trim())
  const placeholder = view.querySelector('.dshTermPlaceholder')?.textContent?.trim()
  const wrap = view.querySelector('.dshTermWrap')
  return {
    cssTags,
    termRuleCount: termRules === null ? null : (Array.isArray(termRules) ? termRules.length : termRules),
    hasPanelRule: Array.isArray(termRules) ? termRules.includes('.dshTermPanel') : null,
    hasViewRule: Array.isArray(termRules) ? termRules.includes("[data-dsh-terminal-view]") : null,
    panelPosition: panelStyle.position,
    panelHeight: panelStyle.height,
    viewPosition: viewStyle.position,
    chain,
    viewRect: { w: Math.round(rect.width), h: Math.round(rect.height) },
    hasXterm: xterm !== null,
    xtermRect: xterm ? { w: Math.round(xterm.getBoundingClientRect().width), h: Math.round(xterm.getBoundingClientRect().height) } : null,
    hasCanvas: canvas !== null,
    canvasRect: canvas ? { w: Math.round(canvas.getBoundingClientRect().width), h: Math.round(canvas.getBoundingClientRect().height) } : null,
    wrapRect: wrap ? { w: Math.round(wrap.getBoundingClientRect().width), h: Math.round(wrap.getBoundingClientRect().height) } : null,
    banners,
    placeholder,
    termCount: view.querySelectorAll('.xterm').length,
  }
})
console.log('[diag] panel info:', JSON.stringify(info, null, 2))

await page.screenshot({ path: '/tmp/dsh-browser-diag.png', fullPage: false })
console.log("[diag] screenshot saved: /tmp/dsh-browser-diag.png")

// --- interaction test: focus the terminal, type a command, read output ---
try {
  await page.locator('.dshTermWrap').click()
  await page.waitForTimeout(300)
  await page.keyboard.type('echo HELLO-FROM-BROWSER')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  const render = await page.evaluate(() => {
    const view = document.querySelector('[data-dsh-terminal-view]')
    if (!view) return { error: 'no view' }
    const xterm = view.querySelector('.xterm')
    const canvas = view.querySelector('canvas')
    let canvasInfo = null
    if (canvas) {
      try {
        const ctx = canvas.getContext('2d')
        const w = canvas.width, h = canvas.height
        const data = ctx.getImageData(0, 0, w, h).data
        let painted = 0
        for (let i = 0; i < data.length; i += 16) {
          if (data[i] > 40 || data[i + 1] > 40 || data[i + 2] > 40) painted++
        }
        canvasInfo = { w, h, sampled: Math.floor(data.length / 16), painted }
      } catch (e) { canvasInfo = 'ERR ' + e.message }
    }
    const rows = Array.from(view.querySelectorAll('.xterm-rows .xterm-row, .xterm-rows > div')).map(r => r.textContent || '')
    const screenHTML = view.querySelector('.xterm-screen')?.innerHTML.slice(0, 300) ?? null
    return { canvasInfo, rowCount: rows.length, rows: rows.slice(0, 6), screenHTML }
  })
  console.log('[diag] render check:', JSON.stringify(render, null, 2))
} catch (error) {
  console.log('[diag] interaction error:', error.message)
}

console.log("[diag] console messages (" + consoleMessages.length + "):")
for (const msg of consoleMessages.slice(-40)) console.log("  " + msg)

await browser.close()