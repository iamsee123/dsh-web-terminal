/**
 * Fixes node-pty prebuilt spawn-helper executables that lost their exec bit
 * during prebuild download (symptom: posix_spawnp failed when opening a
 * terminal). Scans every node-pty install under node_modules (hoisted and
 * .pnpm stores) and chmod +x the helpers. Runs automatically via postinstall.
 */
import { readdirSync, chmodSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const walk = (dir, depth) => {
  if (depth > 6 || !existsSync(dir)) return
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node-pty') {
        const prebuilds = join(full, 'prebuilds')
        if (existsSync(prebuilds)) {
          for (const platform of readdirSync(prebuilds)) {
            const helper = join(prebuilds, platform, 'spawn-helper')
            if (existsSync(helper)) {
              try {
                chmodSync(helper, 0o755)
                console.log('[fix-spawn-helper] chmod +x', helper)
              } catch (error) {
                console.warn('[fix-spawn-helper] failed:', helper, error.message)
              }
            }
          }
        }
      } else {
        walk(full, depth + 1)
      }
    }
  }
}

walk(join(root, 'node_modules'), 0)
console.log('[fix-spawn-helper] done')
