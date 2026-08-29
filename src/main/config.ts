import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { AppConfig } from '@shared/types'

const DEFAULTS: AppConfig = {
  rootDir: join(homedir(), 'Documents', 'GitHub'),
  pinned: ['Lapides', 'Managol', 'Managol2.0', 'Managol-Godot'],
  hidden: [],
  skipPermissions: true,
  perProject: {},
  theme: 'dark',
  fontSize: 13,
  fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
  claudeBin: '',
  shell: 'powershell.exe',
  extraArgs: '',
  model: '',
  effort: '',
  notifyOnIdle: true,
  autoOpenClaude: true,
  closeToTray: true,
  remoteControl: false
}

let cache: AppConfig | null = null

function file(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'config.json')
}

export function configPath(): string {
  return file()
}

export function getConfig(): AppConfig {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf-8'))
    cache = { ...DEFAULTS, ...raw, perProject: { ...(raw.perProject ?? {}) } }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache!
}

export function setConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...getConfig(), ...patch }
  cache = next
  writeFileSync(file(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}
