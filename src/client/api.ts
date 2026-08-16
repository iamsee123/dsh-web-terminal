/**
 * Browser-side API client for the /api/dsh-terminal route family: the
 * environment-info fetch and the WebSocket terminal connection. Plain
 * fetch/WebSocket, same origin.
 */
import {
  TERMINAL_API,
  type TerminalClientFrame,
  type TerminalInfo,
  type TerminalServerFrame,
} from '../protocol.ts'

/** Error carrying the route's JSON error message. */
export class TerminalApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TerminalApiError'
  }
}

/** Parse a JSON response or throw a TerminalApiError. */
async function readJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new TerminalApiError(`HTTP ${response.status}: invalid JSON response`)
  }
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `HTTP ${response.status}`
    throw new TerminalApiError(message)
  }
  return body as T
}

/** One open terminal connection (WebSocket JSON frames). */
export interface TerminalConnection {
  /** Fired on the ready frame (shell is up). */
  onReady: (() => void) | undefined
  /** Fired on every output frame. */
  onOutput: ((data: string) => void) | undefined
  /** Fired on the exit frame (or transport error). */
  onExit: ((code: number | null, error?: string) => void) | undefined
  /** Send raw input to the shell. */
  send(data: string): void
  /** Resize the PTY. */
  resize(cols: number, rows: number): void
  /** Close the socket and the local session. */
  close(): void
}

/** The browser half's only data entry point. */
export class TerminalApi {
  /** Fetch the host environment snapshot. */
  async fetchInfo(): Promise<TerminalInfo> {
    const response = await fetch(TERMINAL_API.info, { headers: { accept: 'application/json' } })
    return readJson<TerminalInfo>(response)
  }

  /** Open a WebSocket terminal session. */
  openTerminal(cols: number, rows: number): TerminalConnection {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${scheme}://${window.location.host}${TERMINAL_API.terminal}?cols=${cols}&rows=${rows}`
    const socket = new WebSocket(url)
    const connection: TerminalConnection = {
      onReady: undefined,
      onOutput: undefined,
      onExit: undefined,
      send: (data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'input', data } satisfies TerminalClientFrame))
        }
      },
      resize: (cols, rows) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'resize', cols, rows } satisfies TerminalClientFrame))
        }
      },
      close: () => {
        try { socket.close() } catch { /* already closed */ }
      },
    }
    socket.onmessage = (event: MessageEvent<string>) => {
      let frame: TerminalServerFrame
      try {
        frame = JSON.parse(event.data) as TerminalServerFrame
      } catch {
        return
      }
      if (frame.type === 'ready') connection.onReady?.()
      else if (frame.type === 'output') connection.onOutput?.(frame.data)
      else if (frame.type === 'exit') connection.onExit?.(frame.code, frame.error)
    }
    socket.onclose = () => { connection.onExit?.(null, 'connection closed') }
    socket.onerror = () => { connection.onExit?.(null, 'connection error') }
    return connection
  }
}
