/**
 * Browser-half entry for the dsh-terminal plugin — runs inside the dsh web
 * GUI. Mounts the two DOM surfaces: the sidebar entry row (toggles the panel)
 * and the terminal panel in the center column. Failure policy: DOM mounting
 * problems are logged, never thrown — the web shell fails the whole boot when
 * a plugin apply throws, and an external plugin must not take the GUI down.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { TerminalApi } from './api.ts'
import { PanelController } from './controller.ts'
import { mountPanel } from './mount.tsx'
import { mountSidebarEntry } from './sidebar-entry.ts'

/** No runtime dependencies beyond the shell DOM — mounts as early as possible. */
export const inject: string[] = []

/**
 * Mount the terminal panel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const controller = new PanelController()
  const api = new TerminalApi()
  const disposers: Array<() => void> = []
  try {
    disposers.push(mountSidebarEntry(controller))
    disposers.push(mountPanel(controller, api))
  } catch (error) {
    // DOM failures degrade the panel, never the GUI.
    console.warn('[dsh-terminal] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-terminal: ui mounts')
}
