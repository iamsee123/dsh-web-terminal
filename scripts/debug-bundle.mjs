/**
 * Minimal bundle execution debug: no console overrides, prints the factory
 * return value, module.exports keys, and any raw error.
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
const code = readFileSync(join(here, '../lib/client.js'), 'utf8')

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1:3080/', pretendToBeVisual: true })
const win = dom.window
// canvas stub
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 0 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) : typeof k === 'string' ? () => ctx2d : () => {}) })
win.HTMLCanvasElement.prototype.getContext = function (type) { return type === '2d' ? ctx2d : null }
win.HTMLCanvasElement.prototype.toDataURL = () => ''

globalThis.window = win
globalThis.document = win.document
for (const k of ['navigator', 'MutationObserver', 'CustomEvent', 'HTMLElement', 'Event', 'requestAnimationFrame']) {
  try { Object.defineProperty(globalThis, k, { value: win[k], configurable: true, writable: true }) } catch {}
}
class RO { observe() {} disconnect() {} }
win.ResizeObserver = RO
globalThis.ResizeObserver = RO

win.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    console.log('>>> load called, id =', id)
    const module = { exports: {} }
    let returned
    try {
      returned = factory((name) => {
        console.log('>>> require', name)
        if (name === 'react') return React
        if (name === 'react-dom') return ReactDOM
        if (name === 'react-dom/client') return ReactDOMClient
        if (name === 'react/jsx-runtime') return ReactJsxRuntime
        throw new Error('[module-table-miss] ' + name)
      })
    } catch (error) {
      console.log('>>> FACTORY THREW:', error?.stack ?? error)
    }
    console.log('>>> factory returned:', typeof returned, returned === undefined ? '' : Object.keys(returned ?? {}))
    console.log('>>> module.exports keys:', Object.keys(module.exports))
    console.log('>>> module.exports is module?', module.exports === module.exports)
    console.log('>>> typeof apply:', typeof module.exports.apply)
    return module.exports
  },
}

try {
  new Function('window', code)(win)
} catch (error) {
  console.log('>>> BUNDLE THREW:', error?.stack ?? error)
}
console.log('>>> done')
