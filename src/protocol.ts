/**
 * Wire contract between the host half (routes.ts) and the browser half
 * (client/api.ts). Pure types plus shared path literals — imported by both
 * halves and bundled into each; no runtime identity is shared.
 */

/** Route family base of the local terminal. */
export const TERMINAL_API_BASE = '/api/dsh-terminal' as const

export const TERMINAL_API = {
  /** Environment snapshot shown in the panel toolbar. */
  info: TERMINAL_API_BASE + '/info',
  /** WebSocket PTY terminal upgrade. */
  terminal: TERMINAL_API_BASE + '/terminal',
} as const

/** Host environment snapshot for the browser toolbar. */
export interface TerminalInfo {
  /** Resolved shell executable. */
  shell: string
  /** process.platform of the host. */
  platform: string
  /** process.arch of the host. */
  arch: string
  /** Current OS user name. */
  user: string
  /** User home directory. */
  home: string
  /** Default working directory of new sessions. */
  cwd: string
  /** Machine hostname. */
  hostname: string
  /** Node.js version of the host process. */
  node: string
}

/** WebSocket terminal protocol frames (host -> client). */
export type TerminalServerFrame =
  | { type: 'ready'; shell: string }
  | { type: 'output'; data: string }
  | { type: 'exit'; code: number | null; error?: string }

/** WebSocket terminal protocol frames (client -> host). */
export type TerminalClientFrame =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }

/** JSON error body used by every route. */
export interface ApiErrorBody {
  error: string
}
