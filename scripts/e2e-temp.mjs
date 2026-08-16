/**
 * E2E check against a running dsh web instance (default 127.0.0.1:3099):
 * opens the terminal WebSocket, runs a command, verifies echo output.
 * Usage: node scripts/e2e-temp.mjs [port]
 */
import { WebSocket } from 'ws'

const port = process.argv[2] ?? '3099'
const url = `ws://127.0.0.1:${port}/api/dsh-terminal/terminal?cols=80&rows=24`
const ws = new WebSocket(url)
const outputs = []
let exitCode = 1
const timer = setTimeout(() => {
  console.error('TIMEOUT; frames so far:', JSON.stringify(outputs).slice(0, 500))
  process.exit(1)
}, 10000)

ws.on('open', () => console.log('ws-open'))
ws.on('error', (error) => { console.error('ws-error:', error.message); process.exit(1) })
ws.on('message', (data) => {
  const frame = JSON.parse(String(data))
  outputs.push(frame)
  if (frame.type === 'ready') {
    console.log('READY shell=' + frame.shell)
    ws.send(JSON.stringify({ type: 'input', data: 'echo TERM-SMOKE-OK && pwd && exit\n' }))
  } else if (frame.type === 'output') {
    console.log('OUT ' + JSON.stringify(frame.data.slice(0, 100)))
  } else if (frame.type === 'exit') {
    console.log('EXIT ' + JSON.stringify(frame))
    const all = outputs.filter((f) => f.type === 'output').map((f) => f.data).join('')
    if (all.includes('TERM-SMOKE-OK')) {
      console.log('TERMINAL-E2E-PASS')
      exitCode = 0
    } else {
      console.error('TERMINAL-E2E-FAIL')
    }
    clearTimeout(timer)
    ws.close()
    process.exit(exitCode)
  }
})
