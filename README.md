# dsh-web-terminal

A **local terminal** plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI. Adds a sidebar **Terminal** entry with a multi-tab [xterm.js](https://xtermjs.org/) panel; every tab runs a real PTY shell on the host process via [node-pty](https://github.com/microsoft/node-pty), streamed over a WebSocket route.

Features:

- Real pseudo-terminal shells — interactive programs (`vim`, `top`, `htop`), Ctrl-C, resize all work
- Multi-tab terminal panel with new / close / disconnect / reconnect / clear controls
- Auto-fit on panel open, window resize, and container changes
- Shell and working directory configurable (settings panel or patch yaml)
- Loopback-only trust fence on every route
- Hot-pluggable: no dsh source changes, mounts through the web profile bundle list (same dual-face plugin pattern as [dsh-ssh](https://github.com/zhu1090093659/dsh-web-ui/tree/main/packages/dsh-ssh))

## Architecture

| Half | Entry | Responsibility |
|---|---|---|
| host (node) | `lib/index.js` (`src/index.ts`) | node-pty shell sessions, `/api/dsh-terminal/info` route, `/api/dsh-terminal/terminal` WebSocket upgrade, system-prompt announcement, settings namespace (shell/cwd) |
| client (browser) | `lib/client.js` (`src/client/index.ts`) | sidebar Terminal entry (DOM injection, self-healing), multi-tab terminal panel (React + xterm.js) |

Wire protocol (`src/protocol.ts`):

- client → host: `{type:"input",data}`, `{type:"resize",cols,rows}`
- host → client: `{type:"ready",shell}`, `{type:"output",data}`, `{type:"exit",code,error?}`

Security: all routes carry a loopback-only trust fence (same-origin + 127.0.0.1/localhost checks). The terminal executes commands with the host user's privileges — equivalent to direct shell access.

## Install into the web profile

Option A — bundle list (recommended):

```sh
# 1) one-time: allow node-pty build scripts in ~/.dsh/profiles/web/pnpm-workspace.yaml
#    allowBuilds:
#      esbuild: true
#      node-pty: true

# 2) add the dependency (adjust the path to your checkout)
cd ~/.dsh/profiles/web
pnpm add dsh-web-terminal@link:/path/to/dsh-web-terminal

# 3) append "dsh-web-terminal" to dsh.profile.bundles in package.json
#    (the bundle's cordis.patch.yml inserts the id=terminal plugin row)

# 4) restart dsh web
```

Option B — manual patch row in `~/.dsh/profiles/web/cordis.patch.yml` (with the package installed in the profile):

```yaml
- insert:
    - id: terminal
      name: 'dsh-web-terminal'
```

## Configuration (settings panel / patch yaml)

```yaml
- id: terminal
  config:
    enabled: true
    announceToAgent: true
    shell: /bin/zsh      # default: $SHELL
    cwd: /path/to/work   # default: host process cwd (workspace root)
```

## Development

```sh
pnpm install            # pnpm-workspace.yaml must allow esbuild / node-pty build scripts
pnpm run typecheck      # tsc --noEmit
pnpm run build          # esbuild: lib/index.js (host) + lib/client.js (ModuleLoader wrapper)
pnpm test               # client bundle syntax + jsdom ModuleLoader simulation
node scripts/smoke.mjs  # host WebSocket link smoke test
node scripts/browser-diag.mjs  # Playwright: open the real GUI, click Terminal, type a command
```

The build script embeds `node_modules/@xterm/xterm/css/xterm.css` into `src/client/xterm-css.ts` (generated) because the ModuleLoader environment has no CSS loader.

### Known pitfalls

1. **Client externals**: only platform seed words (react family) and shell-own modules (`@deepseek-ai/*`) may stay external. `@xterm/*` must be **bundled** — otherwise the ModuleLoader reports `require("@xterm/xterm") missed the module table` (dsh-ssh bundles xterm too).
2. **Panel height chain**: `[data-dsh-terminal-view]` is an absolute container; its direct child `.dshTermView` needs `height: 100%` or the inner `.dshTermPanel { height: 100% }` resolves against an auto-height parent and the whole flex chain collapses (terminal squashed to a 2px strip).
3. **node-pty spawn-helper permissions**: the prebuilt `prebuilds/<platform>/spawn-helper` may lose its executable bit (`posix_spawnp failed`); run `chmod +x node_modules/node-pty/prebuilds/*/spawn-helper`. Note node-pty spawn is blocked inside the dsh file sandbox — run smoke tests against a real dsh process.

## Verify

```sh
curl http://127.0.0.1:3080/api/dsh-terminal/info
# {"shell":"/bin/zsh","platform":"darwin",...}

# browser: refresh the GUI → sidebar Terminal → new tab → type commands
```

## License

MIT
