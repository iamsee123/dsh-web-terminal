/**
 * End-to-end smoke test for the host half: boots a real http server, mounts
 * the dsh-terminal upgrade route on its upgrade event, connects a WebSocket
 * client, and drives one real node-pty /bin/bash session:
 *   ready -> input "echo hello-dsh-terminal" -> output contains it -> exit.
 * Run: node scripts/smoke.mjs
 */
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import { makeRoutes } from '../src/routes.ts'
import { openPty } from '../src/pty.ts'

const shell = process.env.SHELL || '/bin/bash'

const { routes, upgrade } = makeRoutes({
  getInfo: () => ({
    shell,
    platform: process.platform,
    arch: process.arch,
    user: 'smoke',
    home: process.env.HOME ?? '',
    cwd: process.cwd(),
    hostname: 'smoke-host',
    node: process.version,
  }),
  openSession: (cols, rows) => openPty({ shell, cwd: process.cwd(), cols, rows }),
})

const server = createServer((req, res) => {
  res.writeHead(404)
  res.end()
})
server.on('upgrade', (req, socket, head) => {
  upgrade.handler(req, socket, head)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
console.log('smoke server on 127.0.0.1:' + port)

const ws = new WebSocket(`ws://127.0.0.1:${port}/api/dsh-terminal/terminal?cols=80&rows=24`)

const frames = []
const waitFor = (type) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 8000)
  const check = () => {
    const found = frames.find((frame) => frame.type === type)
    if (found !== undefined) {
      clearTimeout(timer)
      resolve(found)
    }
  }
  const interval = setInterval(check, 25)
  frames.push = ((original) => function (frame) {
    original.call(this, frame)
    check()
  })(frames.push.bind(frames))
  ws.on('close', () => {
    clearTimeout(timer)
    clearInterval(interval)
    resolve(null)
  })
})

ws.on('open', () => { console.log('ws open') })
ws.on('message', (data) => {
  const frame = JSON.parse(String(data))
  frames.push(frame)
  console.log('frame:', JSON.stringify(frame).slice(0, 120))
})

const ready = await waitFor('ready')
if (ready === null) { console.error('FAIL: no ready frame'); process.exit(1) }

ws.send(JSON.stringify({ type: 'input', data: 'echo hello-dsh-terminal\n' }))
let sawOutput = false
const deadline = Date.now() + 8000
while (Date.now() < deadline) {
  const output = frames.find((frame) => frame.type === 'output' && frame.data.includes('hello-dsh-terminal'))
  if (output !== undefined) { sawOutput = true; break }
  await new Promise((resolve) => setTimeout(resolve, 50))
}
if (!sawOutput) { console.error('FAIL: no echo output'); process.exit(1) }
console.log('PASS: shell echoed the command')

ws.send(JSON.stringify({ type: 'input', data: 'exit\n' }))
const exit = await waitFor('exit')
if (exit === null) { console.error('FAIL: no exit frame'); process.exit(1) }
console.log('PASS: exit frame', JSON.stringify(exit))

// resize frame sanity (must not throw)
ws.send(JSON.stringify({ type: 'resize', cols: 100, rows: 40 }))
await new Promise((resolve) => setTimeout(resolve, 200))
ws.close()
server.close()
console.log('SMOKE OK')
