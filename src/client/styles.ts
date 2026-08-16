/**
 * Panel styles, scoped by the plugin's own data attributes. Colors ride the
 * dsh --dsw-* tokens so the panel follows the active theme. The center-column
 * takeover and sidebar entry rules must live here because mount.tsx /
 * sidebar-entry.ts inject this stylesheet with the plugin.
 */

/** Injected once per page load. */
let injected = false

/** Inject the stylesheet (idempotent, one style tag per page load). */
export function ensureStyles(): void {
  if (injected || typeof document === 'undefined') return
  injected = true
  if (document.querySelector('style[data-dsh-terminal-css]') !== null) return
  const style = document.createElement('style')
  style.dataset.dshTerminalCss = ''
  style.textContent = PANEL_CSS
  document.head.appendChild(style)
}

const PANEL_CSS = `
/* --- center-column takeover (global rules, attribute-scoped) ----------------- */
[data-pane='conversation'] {
  position: relative;
}

[data-dsh-terminal-view] {
  position: absolute;
  inset: 0;
  display: none;
  z-index: 60;
  background: var(--dsw-alias-bg-base);
}

html[data-dsh-terminal-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-dsh-terminal-view] {
  display: block;
}

html[data-dsh-terminal-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-pane='conversation'] > :not([data-dsh-terminal-view]),
html[data-dsh-terminal-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [class*='centerCol'] > :not([data-dsh-terminal-view]) {
  display: none !important;
}

/* --- sidebar entry row ------------------------------------------------------- */
[data-dsh-terminal-entry] {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

[data-dsh-terminal-entry]:hover {
  background: var(--dsw-specific-sidebar-nav-item-hover);
  color: var(--dsw-alias-label-primary);
}

[data-dsh-terminal-entry][data-active] {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

[data-dsh-terminal-entry] .termEntryIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

[data-dsh-terminal-entry] .termEntryLabel {
  overflow: hidden;
  text-overflow: ellipsis;
}

[data-dsh-frame][data-sidebar-collapsed] [data-dsh-terminal-entry] {
  justify-content: center;
  padding: 0;
  width: 100%;
}

[data-dsh-frame][data-sidebar-collapsed] [data-dsh-terminal-entry] .termEntryLabel {
  display: none;
}

/* --- panel frame -------------------------------------------------------------- */
.dshTermView {
  height: 100%;
  overflow: hidden;
}

.dshTermPanel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 14px 16px 16px;
  gap: 10px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}

.dshTermHeader {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.dshTermTitle {
  margin: 0;
  flex: 1;
  font-size: 16px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
}

.dshTermMeta {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: none;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  overflow: hidden;
}

.dshTermMeta .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}

/* --- tab bar ------------------------------------------------------------------ */
.dshTermTabBar {
  display: flex;
  gap: 2px;
  flex: none;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  overflow-x: auto;
}

.dshTermTab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  white-space: nowrap;
}

.dshTermTab:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshTermTab[data-active] {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  border-bottom-color: var(--dsw-alias-state-business-primary);
}

.dshTermTabClose {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1;
  color: var(--dsw-alias-label-tertiary);
  background: transparent;
  border: none;
  cursor: pointer;
}

.dshTermTabClose:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dshTermNewTab {
  margin-left: 6px;
  padding: 4px 10px;
  font-size: 12.5px;
  border-radius: 6px;
  background: var(--dsw-specific-input-major);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}

.dshTermNewTab:hover {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-state-business-primary);
}

/* --- toolbar ------------------------------------------------------------------ */
.dshTermToolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  flex-wrap: wrap;
}

.dshTermButton {
  padding: 5px 12px;
  font-size: 12.5px;
  border-radius: 8px;
  background: var(--dsw-specific-input-major);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}

.dshTermButton:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-business-primary);
}

.dshTermButton:disabled {
  opacity: 0.5;
  cursor: default;
}

.dshTermButton[data-kind='primary'] {
  background: var(--dsw-alias-state-business-primary);
  border-color: transparent;
  color: var(--dsw-specific-input-major);
}

.dshTermButton[data-kind='danger']:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
}

/* --- status banner ------------------------------------------------------------- */
.dshTermBanner {
  flex: none;
  padding: 6px 12px;
  font-size: 12.5px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
}

.dshTermBanner[data-kind='ok'] {
  color: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-primary);
}

.dshTermBanner[data-kind='error'] {
  color: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
}

/* --- terminal ------------------------------------------------------------------ */
.dshTermBody {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.dshTermWrap {
  position: relative;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  overflow: hidden;
  background: #0b0e14;
}

.dshTermContainer {
  position: absolute;
  inset: 0;
  padding: 8px 10px;
}

.dshTermPlaceholder {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
  text-align: center;
  font-size: 12.5px;
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-base);
}
`