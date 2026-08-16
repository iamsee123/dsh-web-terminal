/**
 * Local PTY sessions over node-pty. Each WebSocket terminal connection owns
 * exactly one session; the session forwards pty output to the route and
 * accepts input/resize from it.
 */
import { spawn, type IPty } from 'node-pty'

/** Options for one shell session. */
export interface PtySessionOptions {
  /** Shell executable (already resolved by the plugin config). */
  shell: string
  /** Working directory of the session. */
  cwd: string
  /** Initial terminal size. */
  cols: number
  rows: number
}

/** Live handle of one PTY session. */
export interface PtySession {
  /** OS pid of the spawned shell, when known. */
  readonly pid: number | undefined
  /** Fired with raw pty output (UTF-8 text). */
  onData: ((data: string) => void) | undefined
  /** Fired once when the shell exits (code may be null on signals). */
  onExit: ((exitCode: number | null, signal?: number) => void) | undefined
  /** Write raw input bytes to the pty. */
  write(data: string): void
  /** Resize the pty. */
  resize(cols: number, rows: number): void
  /** Terminate the shell (idempotent). */
  kill(): void
}

/** Spawn a shell inside a fresh pseudo-terminal. */
export function openPty(options: PtySessionOptions): PtySession {
  let pty: IPty
  try {
    pty = spawn(options.shell, [], {
      name: 'xterm-256color',
      cols: Math.max(2, options.cols),
      rows: Math.max(1, options.rows),
      cwd: options.cwd,
      env: { ...process.env } as Record<string, string>,
    })
  } catch (error) {
    throw new Error(`failed to spawn shell '${options.shell}': ${error instanceof Error ? error.message : String(error)}`)
  }

  const session: PtySession = {
    pid: pty.pid,
    onData: undefined,
    onExit: undefined,
    write: (data) => {
      try { pty.write(data) } catch { /* session closed */ }
    },
    resize: (cols, rows) => {
      try { pty.resize(Math.max(2, cols), Math.max(1, rows)) } catch { /* closed */ }
    },
    kill: () => {
      try { pty.kill() } catch { /* already dead */ }
    },
  }

  pty.onData((data) => {
    session.onData?.(data)
  })
  pty.onExit(({ exitCode, signal }) => {
    session.onExit?.(exitCode, signal)
  })
  return session
}
