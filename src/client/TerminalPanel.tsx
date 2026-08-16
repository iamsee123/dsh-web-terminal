/**
 * The local terminal panel: a tab bar of xterm.js PTY views over the host's
 * WebSocket terminal route. Each tab owns one shell session and auto-connects
 * on mount; the toolbar adds/removes tabs, disconnects/reconnects the active
 * tab, and clears its scrollback. The host environment snapshot (shell/cwd)
 * is shown in the panel header.
 */
import { Component, useEffect, useImperativeHandle, useRef, useState, forwardRef, type ReactNode } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { TerminalApi, TerminalConnection } from './api.ts'
import type { TerminalInfo } from '../protocol.ts'
import { tt } from './locales.ts'
import { XTERM_CSS } from './xterm-css.ts'

/** One tab's session lifecycle state. */
export type TabStatus =
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'exited'; code: number | null; detail?: string }
  | { kind: 'error'; detail: string }

/** Panel props. */
export interface TerminalPanelProps {
  api: TerminalApi
}

/** xterm stylesheet injection guard (one tag per page load). */
let xtermCssInjected = false
function ensureXtermCss(): void {
  if (xtermCssInjected || typeof document === 'undefined') return
  xtermCssInjected = true
  if (document.querySelector('style[data-dsh-terminal-xterm]') !== null) return
  const style = document.createElement('style')
  style.dataset.dshTerminalXterm = ''
  style.textContent = XTERM_CSS
  document.head.appendChild(style)
}

/** Imperative handle of one terminal view (clear only). */
export interface TerminalViewHandle {
  clear(): void
}

/** Error boundary: a terminal-view failure must degrade that tab, never the GUI. */
class TerminalErrorBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean; message: string }> {
  state = { failed: false, message: '' }

  static getDerivedStateFromError(error: unknown): { failed: boolean; message: string } {
    return { failed: true, message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: unknown): void {
    this.props.onError(error instanceof Error ? error.message : String(error))
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="dshTermWrap" style={{ minHeight: 120 }}>
          <div className="dshTermPlaceholder">{'Terminal error: ' + this.state.message}</div>
        </div>
      )
    }
    return this.props.children
  }
}

/** One xterm terminal view bound to one WebSocket session. */
export const TerminalView = forwardRef<TerminalViewHandle, {
  api: TerminalApi
  /** Increment to force a reconnect. */
  attempt: number
  /** Whether the session should be connected (false = disconnected). */
  live: boolean
  onStatus: (status: TabStatus) => void
}>(function TerminalView({ api, attempt, live, onStatus }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const connRef = useRef<TerminalConnection | null>(null)

  useImperativeHandle(ref, () => ({
    clear: () => { termRef.current?.clear() },
  }), [])

  useEffect(() => { ensureXtermCss() }, [])

  // Open the terminal and connect the session; teardown on attempt/live change/unmount.
  useEffect(() => {
    const container = containerRef.current
    const wrap = wrapRef.current
    if (container === null || wrap === null) return
    if (!live) {
      onStatus({ kind: 'exited', code: null, detail: 'disconnected' })
      return
    }

    let term: Terminal | undefined
    let fit: FitAddon | undefined
    let connection: TerminalConnection | undefined
    try {
      term = new Terminal({
        convertEol: false,
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Consolas, "Liberation Mono", monospace',
        theme: { background: '#0b0e14', foreground: '#d8dee9', cursor: '#a3b8d0' },
      })
      fit = new FitAddon()
      term.loadAddon(fit)
      term.open(container)
      // Wait a frame so the panel layout is complete before measuring.
      requestAnimationFrame(() => { try { fit?.fit() } catch { /* hidden */ } })
      connection = api.openTerminal(term.cols, term.rows)
      termRef.current = term
      fitRef.current = fit
      connRef.current = connection
    } catch (error) {
      onStatus({ kind: 'error', detail: error instanceof Error ? error.message : String(error) })
      return
    }

    onStatus({ kind: 'connecting' })
    let settled = false
    const dataSub = term.onData(data => { connection?.send(data) })
    connection.onReady = () => {
      if (!settled) onStatus({ kind: 'connected' })
    }
    connection.onOutput = data => { term?.write(data) }
    connection.onExit = (code, error) => {
      if (settled) return
      settled = true
      dataSub.dispose()
      if (term !== undefined) term.options.disableStdin = true
      connRef.current = null
      onStatus(error !== undefined ? { kind: 'error', detail: error } : { kind: 'exited', code })
    }

    // Fit on window resize and on container size changes.
    const fitNow = (): void => {
      const current = termRef.current
      const addon = fitRef.current
      const live = connRef.current
      if (current === null || addon === null) return
      // Never measure while the panel is hidden: a 0-size fit would pin the
      // terminal to a tiny canvas forever.
      if (!document.documentElement.hasAttribute('data-dsh-terminal-active')) return
      try {
        addon.fit()
      } catch { /* hidden container */ }
      live?.resize(current.cols, current.rows)
    }
    // Refit when the panel becomes visible (the view mounts while hidden and
    // an initial fit there would measure 0×0).
    const attrObserver = new MutationObserver(() => { fitNow() })
    attrObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dsh-terminal-active'] })
    window.addEventListener('resize', fitNow)
    const observer = new ResizeObserver(() => { fitNow() })
    observer.observe(wrap)
    // If the panel is already visible (user opened it first), fit right away.
    if (document.documentElement.hasAttribute('data-dsh-terminal-active')) {
      requestAnimationFrame(() => { fitNow() })
    }

    return () => {
      attrObserver.disconnect()
      window.removeEventListener('resize', fitNow)
      observer.disconnect()
      dataSub.dispose()
      if (connection !== undefined) {
        connection.onReady = undefined
        connection.onOutput = undefined
        connection.onExit = undefined
        try { connection.close() } catch { /* closed */ }
      }
      term?.dispose()
      termRef.current = null
      fitRef.current = null
      connRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, attempt, live])

  return (
    <div className="dshTermWrap" ref={wrapRef}>
      <div className="dshTermContainer" ref={containerRef} />
    </div>
  )
})

/** Panel-level tab metadata. */
interface TabMeta {
  id: number
  status: TabStatus
  /** Whether the session should be connected. */
  live: boolean
}

let nextTabId = 1

/** The multi-tab terminal panel. */
export function TerminalPanel({ api }: TerminalPanelProps) {
  const [tabs, setTabs] = useState<TabMeta[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [attempts, setAttempts] = useState<Record<number, number>>({})
  const [info, setInfo] = useState<TerminalInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)
  const handles = useRef<Map<number, TerminalViewHandle | null>>(new Map())

  // Load the host environment snapshot once.
  useEffect(() => {
    let disposed = false
    void (async () => {
      try {
        const snapshot = await api.fetchInfo()
        if (!disposed) setInfo(snapshot)
      } catch (cause) {
        if (!disposed) setInfoError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => { disposed = true }
  }, [api])

  // Auto-open one terminal when the panel first mounts.
  const bootstrapped = useRef(false)
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    addTab()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addTab = (): void => {
    const id = nextTabId++
    setTabs(prev => [...prev, { id, status: { kind: 'connecting' }, live: true }])
    setActiveId(id)
  }

  const closeTab = (id: number): void => {
    setTabs(prev => {
      const index = prev.findIndex(tab => tab.id === id)
      const next = prev.filter(tab => tab.id !== id)
      if (next.length === 0) {
        setActiveId(null)
      } else if (id === activeId) {
        const neighbor = next[Math.min(index, next.length - 1)]
        if (neighbor !== undefined) setActiveId(neighbor.id)
      }
      return next
    })
  }

  const setStatus = (id: number, status: TabStatus): void => {
    setTabs(prev => prev.map(tab => (tab.id === id ? { ...tab, status } : tab)))
  }

  const active = tabs.find(tab => tab.id === activeId) ?? null
  const activeStatus = active?.status

  const headerMeta = info !== null
    ? [
        info.shell,
        info.cwd,
        info.platform + '/' + info.arch,
        info.user + '@' + info.hostname,
      ]
    : []

  return (
    <div className="dshTermView">
      <div className="dshTermPanel">
        <div className="dshTermHeader">
          <h2 className="dshTermTitle">{tt('panel.title')}</h2>
          <div className="dshTermMeta">
            {info !== null ? (
              headerMeta.map((item, index) => (
                <span key={index} className="mono">{item}</span>
              ))
            ) : infoError !== null ? (
              <span>{tt('panel.loadInfoFailed', { error: infoError })}</span>
            ) : null}
          </div>
        </div>

        <div className="dshTermTabBar">
          {tabs.map(tab => {
            const index = tabs.findIndex(candidate => candidate.id === tab.id)
            return (
              <button
                key={tab.id}
                type="button"
                className="dshTermTab"
                data-active={tab.id === activeId ? '' : undefined}
                onClick={() => { setActiveId(tab.id) }}
              >
                <span>{tt('tab.title', { n: index + 1 })}</span>
                <span
                  className="dshTermTabClose"
                  role="button"
                  aria-label={tt('panel.closeTab')}
                  title={tt('panel.closeTab')}
                  onClick={(event) => {
                    event.stopPropagation()
                    closeTab(tab.id)
                  }}
                >×</span>
              </button>
            )
          })}
          <button type="button" className="dshTermNewTab" onClick={addTab}>
            ＋ {tt('panel.newTab')}
          </button>
        </div>

        <div className="dshTermToolbar">
          <button
            type="button"
            className="dshTermButton"
            disabled={active === null || active?.live || activeStatus?.kind === 'connecting'}
            onClick={() => {
              if (active !== null) {
                setTabs(prev => prev.map(tab => (tab.id === active.id ? { ...tab, live: true } : tab)))
                setAttempts(prev => ({ ...prev, [active.id]: (prev[active.id] ?? 0) + 1 }))
              }
            }}
          >
            {tt('panel.reconnect')}
          </button>
          <button
            type="button"
            className="dshTermButton"
            disabled={active === null || !active?.live || activeStatus?.kind === 'connecting'}
            onClick={() => {
              if (active !== null) {
                setTabs(prev => prev.map(tab => (tab.id === active.id ? { ...tab, live: false } : tab)))
              }
            }}
          >
            {tt('panel.disconnect')}
          </button>
          <button
            type="button"
            className="dshTermButton"
            disabled={active === null}
            onClick={() => { if (active !== null) handles.current.get(active.id)?.clear() }}
          >
            {tt('panel.clear')}
          </button>
        </div>

        {activeStatus !== undefined && (
          activeStatus.kind === 'connecting' ? (
            <div className="dshTermBanner" data-kind="info">{tt('panel.connecting')}</div>
          ) : activeStatus.kind === 'connected' ? (
            <div className="dshTermBanner" data-kind="ok">{tt('panel.ready', { shell: info?.shell ?? '' })}</div>
          ) : activeStatus.kind === 'exited' ? (
            <div className="dshTermBanner" data-kind="info">
              {tt('panel.exited', { code: activeStatus.code ?? '?' })}
              {activeStatus.detail !== undefined ? ' (' + activeStatus.detail + ')' : ''}
            </div>
          ) : (
            <div className="dshTermBanner" data-kind="error">{tt('panel.error', { error: activeStatus.detail })}</div>
          )
        )}

        <div className="dshTermBody">
          {tabs.map(tab => (
            <div
              key={tab.id}
              style={{ display: tab.id === activeId ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}
            >
              <TerminalErrorBoundary onError={message => { setStatus(tab.id, { kind: 'error', detail: message }) }}>
                <TerminalView
                  ref={node => { handles.current.set(tab.id, node) }}
                  api={api}
                  attempt={attempts[tab.id] ?? 0}
                  live={tab.live}
                  onStatus={status => { setStatus(tab.id, status) }}
                />
              </TerminalErrorBoundary>
            </div>
          ))}
          {tabs.length === 0 && (
            <div className="dshTermPlaceholder">{tt('panel.placeholder')}</div>
          )}
        </div>
      </div>
    </div>
  )
}