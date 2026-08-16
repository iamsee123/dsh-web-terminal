/**
 * dsh-terminal — host half. Mounts the local PTY shell engine, the
 * /api/dsh-terminal route family plus the terminal WebSocket upgrade, and a
 * system-prompt announcement. The browser half (./client) renders the sidebar
 * entry and the multi-tab xterm panel. Everything rides official NPM SDK
 * packages — no dsh source changes.
 */
import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { hostname, userInfo } from 'node:os'
import { resolve } from 'node:path'
import type { TerminalInfo } from './protocol.ts'
import { openPty } from './pty.ts'
import { makeRoutes } from './routes.ts'

/** Stable cordis plugin name (also the browser roster id). */
export const name = 'terminal'

/** Services required before the terminal surfaces can mount. */
export const inject = ['webServer', 'systemPrompt']

/** Settings namespace of the terminal capability (spelled here and in the browser docs). */
export const TERMINAL_SETTINGS_NAMESPACE = settingsNamespace('dsh-terminal')

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /** Master switch for the plugin (routes, prompt section). */
  enabled?: boolean
  /** When true (default), a system-prompt section announces the terminal. */
  announceToAgent?: boolean
  /** Shell executable; empty = auto-detect ($SHELL, COMSPEC, /bin/bash). */
  shell?: string
  /** Working directory of new sessions; empty = the host process cwd. */
  cwd?: string
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  announceToAgent: z.boolean().default(true),
  shell: z.string().default(''),
  cwd: z.string().default(''),
})

/** Schema default, re-read for hand-built test contexts. */
const DEFAULT_ANNOUNCE = true

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 160

/** Model-facing announcement: plugin presence and capabilities. */
export const TERMINAL_GUIDANCE =
  '本机已安装 dsh-terminal 插件（DSH Web GUI 本地终端）：侧边栏「终端」入口打开多标签 xterm.js 终端面板，每个标签在宿主进程通过 node-pty 起一个真实 PTY shell（默认 $SHELL，可用 ~/.dsh/cordis.patch.yml 配置 shell/cwd），输入输出经 /api/dsh-terminal WebSocket 转发，支持 resize、交互式程序（vim/top 等）与 Ctrl-C 中断。限制：终端以宿主用户权限在本机执行命令，等效于直接 shell 访问；仅 loopback 提供服务。用户提到「终端 / 本地终端 / 命令行界面」时即指本插件，请据此协作。'

/** Resolve the effective shell from config, then environment defaults. */
function resolveShell(config: Config): string {
  const explicit = config.shell?.trim()
  if (explicit !== undefined && explicit !== '') return explicit
  const env = process.env.SHELL?.trim()
  if (env !== undefined && env !== '') return env
  if (process.platform === 'win32') return process.env.COMSPEC?.trim() || 'powershell.exe'
  return '/bin/bash'
}

/** Resolve the default working directory of new sessions. */
function resolveCwd(config: Config): string {
  const explicit = config.cwd?.trim()
  if (explicit !== undefined && explicit !== '') {
    try {
      return resolve(explicit)
    } catch {
      // fall through to the process cwd
    }
  }
  return process.cwd()
}

/**
 * Mount the terminal engine, routes, and announcement.
 * @param ctx - host plugin context carrying webServer/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config?: Config): void {
  let current: () => Config = () => config ?? {}
  const resolve = (): Config => ({
    enabled: current().enabled ?? true,
    announceToAgent: current().announceToAgent ?? DEFAULT_ANNOUNCE,
    shell: current().shell ?? '',
    cwd: current().cwd ?? '',
  })

  const getInfo = (): TerminalInfo => {
    const value = resolve()
    let user: string
    try {
      user = userInfo().username
    } catch {
      user = ''
    }
    return {
      shell: resolveShell(value),
      platform: process.platform,
      arch: process.arch,
      user,
      home: process.env.HOME ?? '',
      cwd: resolveCwd(value),
      hostname: hostname(),
      node: process.version,
    }
  }

  const openSession = (cols: number, rows: number) => {
    const value = resolve()
    return openPty({
      shell: resolveShell(value),
      cwd: resolveCwd(value),
      cols,
      rows,
    })
  }

  const { routes, upgrade } = makeRoutes({ getInfo, openSession })
  let disposeSection: (() => void) | undefined
  let disposeRoutes: (() => void) | undefined

  const sync = (): void => {
    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    if (disposeRoutes !== undefined) {
      disposeRoutes()
      disposeRoutes = undefined
    }
    const value = resolve()
    if (!value.enabled) return
    if (value.announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-terminal',
        order: SECTION_ORDER,
        text: TERMINAL_GUIDANCE,
      })
    }
    disposeRoutes = ctx.effect(
      () => {
        const disposers = routes.map(route => ctx.webServer.register(route))
        const upgradeDisposer = ctx.webServer.registerUpgrade(upgrade)
        return () => {
          for (const dispose of disposers) dispose()
          upgradeDisposer()
        }
      },
      'dsh-terminal: routes',
    )
  }

  installSettingsSection(ctx, TERMINAL_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => {
      current = source
      sync()
    },
    onChange: sync,
  })

  // Initial registration from the composition entry (covers deployments with
  // no settings service, whose installSettingsSection never fires its hooks).
  sync()
}
