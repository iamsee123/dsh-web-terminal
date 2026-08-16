/**
 * The /api/dsh-terminal route family: an environment-info route and the
 * WebSocket PTY terminal upgrade. Every surface carries a loopback-only trust
 * fence (plus browser same-origin markers) — these endpoints spawn local
 * shells with the host user's privileges, so LAN-exposed dsh web deployments
 * must not serve them.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import type { WebRoute, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import { TERMINAL_API, type TerminalClientFrame, type TerminalInfo, type TerminalServerFrame } from './protocol.ts'
import type { PtySession } from './pty.ts'

/** Pause output forwarding when the socket's send buffer exceeds this… */
const BACKPRESSURE_HIGH_WATER = 1024 * 1024

/** …and resume once it drains below this. */
const BACKPRESSURE_LOW_WATER = 512 * 1024

/** One noServer WebSocket server for terminal upgrades. */
const terminalWss = new WebSocketServer({ noServer: true })

/** Loopback literal check plus browser same-origin markers (mirrors dsh-ssh). */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'referrer-policy': 'no-referrer',
  })
  res.end(payload)
}

/** URL query helper (first value, decoded). */
function queryParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)
  return value === null ? undefined : value
}

/** Route family dependencies. */
export interface TerminalRoutesDeps {
  /** Build the environment snapshot served by /info. */
  getInfo(): TerminalInfo
  /** Open one shell session for a WebSocket connection. */
  openSession(cols: number, rows: number): PtySession
}

/**
 * Build the /api/dsh-terminal routes plus the terminal upgrade.
 * @param deps - info provider and session factory (both supplied by the plugin).
 * @returns routes and the upgrade route.
 */
export function makeRoutes(deps: TerminalRoutesDeps): { routes: WebRoute[]; upgrade: WebUpgradeRoute } {
  const routes: WebRoute[] = [
    {
      kind: 'exact',
      path: TERMINAL_API.info,
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        if ((req.method ?? 'GET') !== 'GET') {
          writeJson(res, 405, { error: `method not allowed: ${req.method}` })
          return
        }
        writeJson(res, 200, deps.getInfo())
      },
    },
  ]

  const upgrade: WebUpgradeRoute = {
    path: TERMINAL_API.terminal,
    handler: (req, socket, head) => {
      if (!isLoopbackRequest(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const cols = Number.parseInt(queryParam(url, 'cols') ?? '80', 10)
      const rows = Number.parseInt(queryParam(url, 'rows') ?? '24', 10)
      const shell = deps.getInfo().shell

      terminalWss.handleUpgrade(req, socket, head, (ws) => {
        let session: PtySession | undefined
        let closed = false
        // Simple transport backpressure: while the socket's send buffer is
        // over the high-water mark we queue frames locally instead of feeding
        // the shell (node-pty has no pause); the queue flushes on drain.
        let paused = false
        const pending: string[] = []

        const flush = (): void => {
          if (closed || ws.readyState !== WebSocket.OPEN) return
          if (paused && ws.bufferedAmount > BACKPRESSURE_LOW_WATER) return
          paused = false
          while (!paused && pending.length > 0) {
            const payload = pending.shift()
            if (payload === undefined) break
            if (ws.bufferedAmount > BACKPRESSURE_HIGH_WATER) {
              paused = true
              pending.unshift(payload)
              break
            }
            ws.send(payload, flush)
          }
        }

        const sendFrame = (frame: TerminalServerFrame): void => {
          if (closed || ws.readyState !== WebSocket.OPEN) return
          const payload = JSON.stringify(frame)
          if (paused) {
            pending.push(payload)
            return
          }
          if (ws.bufferedAmount > BACKPRESSURE_HIGH_WATER) {
            paused = true
            pending.push(payload)
            flush()
            return
          }
          ws.send(payload, flush)
        }

        const closeSession = (): void => {
          const opened = session
          session = undefined
          if (opened !== undefined) opened.kill()
        }

        let session2: PtySession
        try {
          session2 = deps.openSession(
            Number.isFinite(cols) ? cols : 80,
            Number.isFinite(rows) ? rows : 24,
          )
        } catch (error) {
          sendFrame({ type: 'exit', code: null, error: error instanceof Error ? error.message : String(error) })
          closed = true
          try { ws.close(1000) } catch { /* already closed */ }
          return
        }
        session = session2
        sendFrame({ type: 'ready', shell })
        session.onData = (data) => sendFrame({ type: 'output', data })
        session.onExit = (code) => {
          sendFrame({ type: 'exit', code })
          closed = true
          try { ws.close(1000) } catch { /* already closed */ }
        }

        ws.on('message', (data) => {
          let frame: TerminalClientFrame
          try {
            frame = JSON.parse(String(data)) as TerminalClientFrame
          } catch {
            return
          }
          if (frame.type === 'input') {
            session?.write(frame.data)
          } else if (frame.type === 'resize') {
            session?.resize(Math.max(2, frame.cols), Math.max(1, frame.rows))
          }
        })

        ws.on('close', () => {
          closed = true
          closeSession()
        })
        ws.on('error', () => {
          closed = true
          closeSession()
        })
      })
    },
  }

  return { routes, upgrade }
}
