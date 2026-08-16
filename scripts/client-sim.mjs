/**
 * Simulates the dsh web ModuleLoader environment with jsdom to reproduce
 * client-bundle runtime errors locally. Renders a fake shell frame
 * ([data-pane="conversation"] + sidebar), loads lib/client.js through a
 * ModuleLoader shim (react/react-dom resolved from node, everything else is
 * a module-table miss), calls apply(ctx), and reports DOM results + errors.
 * Usage: node scripts/client-sim.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import ReactDOMClient from 'react-dom/client'
import * as ReactJsxRuntime from 'react/jsx-runtime'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(join(here, '../lib/client.js'), 'utf8')

const errors = []
const logs = []

const html = `<!doctype html><html lang="zh-CN"><body>
  <div data-pane="sidebar"><div><button class="newSession">New</button></div></div>
  <main data-pane="conversation"><section class="centerCol"><div>chat</div></section></main>
</body></html>`
const dom = new JSDOM(html, { url: 'http://127.0.0.1:3080/', pretendToBeVisual: true, runScripts: 'outside-only' })

const win = dom.window

// Canvas 2d stub so xterm module-level capability checks pass.
const measure = () => ({ width: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 })
const ctx2d = {
  canvas: null, fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '10px monospace', textAlign: 'left', textBaseline: 'alphabetic',
  fillRect() {}, clearRect() {}, strokeRect() {}, fillText() {}, strokeText() {}, measureText: measure,
  beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {}, clip() {},
  save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, transform() {}, setTransform() {},
  createLinearGradient() { return { addColorStop() {} } }, createRadialGradient() { return { addColorStop() {} } },
  createPattern() { return null }, drawImage() {}, getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 } },
  putImageData() {}, setLineDash() {}, getLineDash() { return [] },
}
win.HTMLCanvasElement.prototype.getContext = function (type) { return type === '2d' ? ctx2d : null }
win.HTMLCanvasElement.prototype.toDataURL = () => ''

class ResizeObserverStub {
  constructor(callback) { this.callback = callback }
  observe() {}
  disconnect() {}
}
win.ResizeObserver = ResizeObserverStub
win.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false } })
for (const key of ['WebSocket', 'fetch', 'MutationObserver', 'CustomEvent', 'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']) {
  if (typeof globalThis[key] !== 'undefined') win[key] = globalThis[key]
}
win.addEventListener('error', (event) => { errors.push('window.onerror: ' + event.message) })
win.console.error = (...args) => { errors.push('console.error: ' + args.map(String).join(' ')) }
win.console.warn = (...args) => { logs.push('console.warn: ' + args.map(String).join(' ')) }

let exportedApply
win.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    console.log('[sim] loading client bundle', id)
    let returned
    try {
      returned = factory((name) => {
        if (name === 'react') return React
        if (name === 'react-dom') return ReactDOM
        if (name === 'react-dom/client') return ReactDOMClient
        if (name === 'react/jsx-runtime') return ReactJsxRuntime
        throw new Error('[module-table-miss] require("' + name + '")')
      })
    } catch (error) {
      errors.push('factory threw: ' + (error?.stack ?? error))
    }
    // The factory redeclares `var module` internally; the exports live on
    // its return value (module.exports), not the outer module object.
    exportedApply = returned?.apply
    return returned
  },
}

globalThis.window = win
globalThis.document = win.document
for (const key of ['navigator', 'CustomEvent', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'HTMLElement', 'Event']) {
  try { Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true }) } catch { /* read-only */ }
}
try { globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win) } catch { /* ok */ }

const disposers = []
const ctx = {
  effect(fn, label) {
    logs.push('effect: ' + (label ?? ''))
    const disposer = fn()
    if (typeof disposer === 'function') disposers.push(disposer)
    return () => {}
  },
}

try {
  new Function('window', bundle)(win)
} catch (error) {
  errors.push('bundle execution threw: ' + (error?.stack ?? error))
}

if (typeof exportedApply !== 'function') {
  console.error('FAIL: bundle did not export apply()')
  console.error('captured errors:', errors.length === 0 ? 'none' : errors.join('\n---\n'))
  process.exit(1)
}

try {
  exportedApply(ctx)
} catch (error) {
  errors.push('apply(ctx) threw: ' + (error?.stack ?? error))
}

// Let MutationObservers and React effects settle.
await new Promise((resolve) => setTimeout(resolve, 500))

const sidebarEntry = win.document.querySelector('[data-dsh-terminal-entry]')
const panelView = win.document.querySelector('[data-dsh-terminal-view]')
const conversation = win.document.querySelector('[data-pane="conversation"]')
console.log('[sim] sidebar entry:', sidebarEntry !== null ? 'PRESENT' : 'MISSING')
console.log('[sim] panel view:', panelView !== null ? 'PRESENT' : 'MISSING')
console.log('[sim] conversation children:', conversation?.children.length)
console.log('[sim] errors:', errors.length === 0 ? 'none' : errors.join('\n---\n'))
console.log('[sim] logs:', logs.join(' | ') || 'none')
process.exit(errors.length === 0 && sidebarEntry !== null && panelView !== null ? 0 : 1)