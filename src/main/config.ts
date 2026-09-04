import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { AppConfig } from '@shared/types'

const DEFAULTS: AppConfig = {
  rootDir: join(homedir(), 'Documents', 'GitHub'),
  pinned: [],
  hidden: [],
  skipPermissions: true,
  perProject: {},
  theme: 'dracula',
  fontSize: 13,
  fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
  claudeBin: '',
  shell: 'powershell.exe',
  extraArgs: '',
  model: '',
  effort: '',
  notifyOnIdle: true,
  notifyExternal: false,
  autoOpenClaude: true,
  closeToTray: true,
  remoteControl: false,
  restoreTabs: true,
  autoSuggest: true,
  startWithWindows: true,
  docsDir: '',
  docsOrder: [],
  projectOrder: [],
  inlineImages: true
}

let cache: AppConfig | null = null

function file(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const atual = join(dir, 'config.json')
  // O app já se chamou "Claude Wrapper": traz config e abas da pasta antiga uma única vez,
  // senão quem já usava perderia raiz, fixados, zoom e as abas abertas.
  if (!existsSync(atual)) {
    const antiga = join(app.getPath('appData'), 'wrapper-claude')
    for (const nome of ['config.json', 'tabs.json']) {
      try {
        if (existsSync(join(antiga, nome))) copyFileSync(join(antiga, nome), join(dir, nome))
      } catch {
        /* sem permissão: começa do zero mesmo */
      }
    }
  }
  return atual
}

export function configPath(): string {
  return file()
}

/** Ainda não existe config gravado: primeira vez que o app abre nesta máquina. */
export function isFirstRun(): boolean {
  return !existsSync(file())
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
