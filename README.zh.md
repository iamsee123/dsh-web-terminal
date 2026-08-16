# dsh-web-terminal

为 DeepSeek Harness Web GUI 提供的**本地终端**插件：侧边栏「终端」入口打开多标签 [xterm.js](https://xtermjs.org/) 终端面板，每个标签在宿主进程通过 [node-pty](https://github.com/microsoft/node-pty) 起一个真实 PTY shell，输入输出经 `/api/dsh-terminal` WebSocket 转发。支持交互式程序（vim/top/htop）、Ctrl-C 中断、resize、多标签与断线重连。

完全热插拔：无需修改 dsh 源码，通过 web profile 的 bundle 列表挂载（同 dsh-ssh 的"双面插件"模式）。

## 架构

| 半 | 入口 | 职责 |
|---|---|---|
| host（node） | `lib/index.js`（`src/index.ts`） | node-pty shell 会话、`/api/dsh-terminal/info` 路由、`/api/dsh-terminal/terminal` WebSocket 升级、系统提示词声明、设置命名空间（shell/cwd） |
| client（browser） | `lib/client.js`（`src/client/index.ts`） | 侧边栏「终端」入口（DOM 注入、自愈式）、多标签终端面板（React + xterm.js） |

协议（`src/protocol.ts`）：

- client → host：`{type:"input",data}`、`{type:"resize",cols,rows}`
- host → client：`{type:"ready",shell}`、`{type:"output",data}`、`{type:"exit",code,error?}`

安全：所有路由带 loopback-only 信任栅栏（同源 + 127.0.0.1/localhost 校验）；终端以宿主用户权限执行命令，等效于直接 shell 访问。

## 安装到 web profile

方式 A — bundle 列表（推荐）：

```sh
# 1) 一次性：在 ~/.dsh/profiles/web/pnpm-workspace.yaml 的 allowBuilds 增加
#      esbuild: true
#      node-pty: true

# 2) 添加依赖（路径换成你的 checkout）
cd ~/.dsh/profiles/web
pnpm add dsh-web-terminal@link:/路径/dsh-web-terminal

# 3) package.json 的 dsh.profile.bundles 追加 "dsh-web-terminal"
#    （bundle 自带的 cordis.patch.yml 会插入 id=terminal 的插件行）

# 4) 重启 dsh web
```

方式 B — 在 `~/.dsh/profiles/web/cordis.patch.yml` 手动插入：

```yaml
- insert:
    - id: terminal
      name: 'dsh-web-terminal'
```

## 配置（设置面板 / patch yaml）

```yaml
- id: terminal
  config:
    enabled: true
    announceToAgent: true
    shell: /bin/zsh      # 默认取 $SHELL
    cwd: /path/to/work   # 默认取宿主进程 cwd（workspace 根）
```

## 开发

```sh
pnpm install            # 需要 pnpm-workspace.yaml 放行 esbuild / node-pty 构建脚本
pnpm run typecheck      # tsc --noEmit
pnpm run build          # esbuild：lib/index.js（host）+ lib/client.js（ModuleLoader 包装）
pnpm test               # client bundle 语法 + jsdom ModuleLoader 模拟
node scripts/smoke.mjs  # host 端 WebSocket 链路冒烟
node scripts/browser-diag.mjs  # Playwright 打开真实 GUI，点击「终端」，输入命令验证
```

构建脚本会把 `node_modules/@xterm/xterm/css/xterm.css` 内嵌为 `src/client/xterm-css.ts`（生成文件，ModuleLoader 环境无 CSS loader）。

## 踩坑记录

1. **client 端 external 限制**：只能 external 平台种子词（react 系列）与 shell 自有模块（`@deepseek-ai/*`）。`@xterm/*` 必须**打进 bundle**——否则 ModuleLoader 报 `require("@xterm/xterm") missed the module table`（dsh-ssh 同样打包 xterm）。
2. **面板高度链**：`[data-dsh-terminal-view]` 是 absolute 容器，直接子级 `.dshTermView` 必须 `height: 100%`，否则内部 `.dshTermPanel { height: 100% }` 因父级高度 auto 失效，flex 链崩溃，终端被压成 2px 细条。
3. **node-pty spawn-helper 权限**：prebuild 的 `prebuilds/<platform>/spawn-helper` 可能丢失可执行位（`posix_spawnp failed`），执行 `pnpm run fix:spawn-helper` 一键修复（`pnpm install` 时也会通过 postinstall 自动执行）。注意 dsh 文件沙箱内 node-pty spawn 会被拦截，冒烟测试需在真实 dsh 进程中跑。

## 验证

```sh
curl http://127.0.0.1:3080/api/dsh-terminal/info
# {"shell":"/bin/zsh","platform":"darwin",...}

# 浏览器：刷新 GUI → 侧边栏「终端」→ 新建标签 → 输入命令
```

## License

MIT