import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getConfig } from './config'

/** Resolve o executável nativo do Claude Code (evita cmd.exe no meio do PTY). */
export function resolveClaudeBin(): { file: string; args: string[] } {
  const cfg = getConfig()
  if (cfg.claudeBin && existsSync(cfg.claudeBin)) return { file: cfg.claudeBin, args: [] }

  const home = homedir()
  const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
  const roaming = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
  const candidates = [
    join(local, 'nodejs', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    join(roaming, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    join(home, '.local', 'bin', 'claude.exe'),
    join(local, 'Programs', 'claude', 'claude.exe')
  ]
  for (const c of candidates) if (existsSync(c)) return { file: c, args: [] }

  // Fallback: deixa o cmd resolver o shim do npm.
  return { file: 'cmd.exe', args: ['/c', 'claude'] }
}
