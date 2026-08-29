export type StackKind =
  | 'node'
  | 'laravel'
  | 'php'
  | 'flutter'
  | 'godot'
  | 'python'
  | 'rust'
  | 'go'
  | 'unity'
  | 'next'
  | 'vue'
  | 'react'

export interface ProjectInfo {
  id: string
  name: string
  path: string
  hasGit: boolean
  hasClaudeMd: boolean
  stacks: StackKind[]
  pinned: boolean
  hidden: boolean
  mtime: number
}

export interface GitInfo {
  branch: string
  dirty: number
  ahead: number
  behind: number
  lastCommit: string
  lastCommitAt: number
  remote?: string
}

export interface ClaudeMdInfo {
  title?: string
  summary?: string
  urls: string[]
  ssh: string[]
  sections: { title: string; body: string }[]
  raw: string
}

export interface ProjectDetails {
  path: string
  git?: GitInfo
  claudeMd?: ClaudeMdInfo
  scripts?: Record<string, string>
  scriptsRunner?: 'npm' | 'pnpm' | 'yarn' | 'bun'
}

export interface LiveSession {
  pid: number
  sessionId: string
  cwd: string
  /** idle | busy | ... (vem do ~/.claude/sessions/<pid>.json) */
  status: string
  name: string
  startedAt: number
  updatedAt: number
  version: string
  /** id da aba do wrapper, se a sessão foi aberta por ele */
  tabId?: string
}

export interface HistorySession {
  sessionId: string
  title: string
  firstPrompt?: string
  mtime: number
  size: number
  gitBranch?: string
}

export type TabKind = 'claude' | 'shell'

export interface TermTab {
  id: string
  projectPath: string
  kind: TabKind
  title: string
  sessionId?: string
  createdAt: number
  pid: number
  exited?: number | null
}

export interface ProjectOverride {
  skipPermissions?: boolean
  model?: string
  effort?: string
  extraArgs?: string
  label?: string
}

export interface AppConfig {
  rootDir: string
  pinned: string[]
  hidden: string[]
  skipPermissions: boolean
  perProject: Record<string, ProjectOverride>
  theme: 'dark' | 'light' | 'system'
  fontSize: number
  fontFamily: string
  claudeBin: string
  shell: string
  extraArgs: string
  model: string
  effort: string
  notifyOnIdle: boolean
  autoOpenClaude: boolean
  /** fechar a janela esconde na bandeja em vez de sair (sessões continuam vivas) */
  closeToTray: boolean
  windowBounds?: { x?: number; y?: number; width: number; height: number; maximized?: boolean }
}

export interface UsageLimit {
  kind: string
  label: string
  percent: number
  resetsAt: string | null
  isActive: boolean
}

export interface UsageInfo {
  limits: UsageLimit[]
  credits: { percent: number; used?: number; limit?: number; currency: string } | null
  fetchedAt: number
  error?: string
}

export interface SpawnClaudeOpts {
  projectPath: string
  resume?: string
  continueLast?: boolean
  cols?: number
  rows?: number
}

export interface SpawnShellOpts {
  projectPath: string
  command?: string
  cols?: number
  rows?: number
}
