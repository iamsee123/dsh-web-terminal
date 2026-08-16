/**
 * Surface copy for the terminal panel. The dictionary is picked by the
 * document language at call time (task-board precedent) — no locale service
 * dependency, so the plugin mounts early and never blocks on it.
 */

/** Keys of every surface string. */
export type TermKey =
  | 'entry.label'
  | 'entry.tooltip'
  | 'panel.title'
  | 'panel.newTab'
  | 'panel.closeTab'
  | 'panel.disconnect'
  | 'panel.reconnect'
  | 'panel.clear'
  | 'panel.connecting'
  | 'panel.ready'
  | 'panel.exited'
  | 'panel.error'
  | 'panel.loadInfoFailed'
  | 'panel.placeholder'
  | 'panel.cwd'
  | 'panel.shell'
  | 'tab.title'

export const zh: Record<TermKey, string> = {
  'entry.label': '终端',
  'entry.tooltip': '打开本地终端',
  'panel.title': '本地终端',
  'panel.newTab': '新建终端',
  'panel.closeTab': '关闭当前终端',
  'panel.disconnect': '断开',
  'panel.reconnect': '重连',
  'panel.clear': '清屏',
  'panel.connecting': '正在启动 shell…',
  'panel.ready': '已连接 {shell}',
  'panel.exited': '会话已退出（代码 {code}）',
  'panel.error': '错误：{error}',
  'panel.loadInfoFailed': '无法读取终端信息：{error}',
  'panel.placeholder': '打开一个终端开始执行命令',
  'panel.cwd': '工作目录',
  'panel.shell': 'Shell',
  'tab.title': '终端 {n}',
}

export const en: Record<TermKey, string> = {
  'entry.label': 'Terminal',
  'entry.tooltip': 'Open a local terminal',
  'panel.title': 'Local Terminal',
  'panel.newTab': 'New terminal',
  'panel.closeTab': 'Close current terminal',
  'panel.disconnect': 'Disconnect',
  'panel.reconnect': 'Reconnect',
  'panel.clear': 'Clear',
  'panel.connecting': 'Starting shell…',
  'panel.ready': 'Connected to {shell}',
  'panel.exited': 'Session exited (code {code})',
  'panel.error': 'Error: {error}',
  'panel.loadInfoFailed': 'Failed to read terminal info: {error}',
  'panel.placeholder': 'Open a terminal to start running commands',
  'panel.cwd': 'Working directory',
  'panel.shell': 'Shell',
  'tab.title': 'Terminal {n}',
}

/** Template values accepted by the interpolator. */
export type TranslateValues = Record<string, string | number>

/** Translate a key with optional {name} template params (current language). */
export function t(dictionary: Record<string, string>, key: TermKey, values?: TranslateValues): string {
  const template = dictionary[key] ?? key
  if (values === undefined) return template
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    const value = values[name]
    return value === undefined ? match : String(value)
  })
}

/** Active dictionary, picked by the document language at call time. */
export function dictionary(): Record<string, string> {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'zh'
  return lang.toLowerCase().startsWith('en') ? { ...en } : { ...zh }
}

/** Translate a key with optional template params. */
export function tt(key: TermKey, values?: TranslateValues): string {
  return t(dictionary(), key, values)
}
