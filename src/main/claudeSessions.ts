/**
 * Sessões do Claude Code:
 *  - vivas: ~/.claude/sessions/<pid>.json (status idle|busy, cwd, sessionId)
 *  - histórico: ~/.claude/projects/<slug>/<sessionId>.jsonl
 */
import { existsSync, readdirSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { HistorySession, LiveSession } from '@shared/types'
import { slugForPath } from './projects'

const CLAUDE_DIR = join(homedir(), '.claude')
const SESSIONS_DIR = join(CLAUDE_DIR, 'sessions')
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects')

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err: any) {
    return err?.code === 'EPERM'
  }
}

export function readLiveSessions(): LiveSession[] {
  if (!existsSync(SESSIONS_DIR)) return []
  const out: LiveSession[] = []
  for (const f of readdirSync(SESSIONS_DIR)) {
    if (!f.endsWith('.json')) continue
    try {
      const j = JSON.parse(readFileSync(join(SESSIONS_DIR, f), 'utf-8'))
      if (typeof j.pid !== 'number' || !pidAlive(j.pid)) continue
      out.push({
        pid: j.pid,
        sessionId: j.sessionId ?? '',
        cwd: j.cwd ?? '',
        status: j.status ?? 'unknown',
        name: j.name ?? '',
        startedAt: j.startedAt ?? 0,
        updatedAt: j.updatedAt ?? 0,
        version: j.version ?? '',
        bridgeSessionId: typeof j.bridgeSessionId === 'string' ? j.bridgeSessionId : undefined
      })
    } catch {
      /* arquivo sendo escrito — ignora este ciclo */
    }
  }
  return out.sort((a, b) => b.startedAt - a.startedAt)
}

export class LiveSessionWatcher {
  private timer: NodeJS.Timeout | null = null
  private last = ''
  private prevStatus = new Map<string, string>()

  constructor(
    private onChange: (sessions: LiveSession[]) => void,
    private onIdle: (s: LiveSession) => void,
    private intervalMs = 1500
  ) {}

  start(): void {
    this.tick()
    this.timer = setInterval(() => this.tick(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private tick(): void {
    const sessions = readLiveSessions()
    const key = JSON.stringify(sessions.map((s) => [s.pid, s.status, s.updatedAt, s.name, s.bridgeSessionId]))
    if (key === this.last) return
    this.last = key
    for (const s of sessions) {
      const prev = this.prevStatus.get(s.sessionId)
      if (prev === 'busy' && s.status === 'idle') this.onIdle(s)
      this.prevStatus.set(s.sessionId, s.status)
    }
    const alive = new Set(sessions.map((s) => s.sessionId))
    for (const id of Array.from(this.prevStatus.keys())) if (!alive.has(id)) this.prevStatus.delete(id)
    this.onChange(sessions)
  }
}

function readChunk(file: string, start: number, length: number): string {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(length)
    const n = readSync(fd, buf, 0, length, start)
    return buf.subarray(0, n).toString('utf-8')
  } finally {
    closeSync(fd)
  }
}

const historyCache = new Map<string, { mtime: number; item: HistorySession }>()

function summarize(file: string, sessionId: string, mtime: number, size: number): HistorySession {
  const cached = historyCache.get(file)
  if (cached && cached.mtime === mtime) return cached.item

  const head = readChunk(file, 0, Math.min(size, 96 * 1024))
  const tail = size > 96 * 1024 ? readChunk(file, Math.max(0, size - 32 * 1024), 32 * 1024) : ''
  let title = ''
  let firstPrompt: string | undefined
  let gitBranch: string | undefined

  for (const chunk of [tail, head]) {
    for (const line of chunk.split('\n')) {
      if (!title && line.includes('"type":"ai-title"')) {
        try {
          title = JSON.parse(line).aiTitle ?? ''
        } catch {
          /* linha cortada */
        }
      }
    }
  }
  for (const line of head.split('\n')) {
    if (firstPrompt) break
    if (!line.includes('"type":"user"')) continue
    try {
      const j = JSON.parse(line)
      if (j.isMeta) continue
      const c = j.message?.content
      const text = typeof c === 'string' ? c : Array.isArray(c) ? c.find((p: any) => p.type === 'text')?.text : ''
      if (!text || text.trim().startsWith('<')) continue
      firstPrompt = text.trim().slice(0, 200)
      gitBranch = j.gitBranch
    } catch {
      /* linha cortada */
    }
  }
  const item: HistorySession = {
    sessionId,
    title: title || firstPrompt || sessionId.slice(0, 8),
    firstPrompt,
    mtime,
    size,
    gitBranch
  }
  historyCache.set(file, { mtime, item })
  return item
}

export function readHistory(projectPath: string, limit = 40): HistorySession[] {
  const dir = join(PROJECTS_DIR, slugForPath(projectPath))
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const full = join(dir, f)
      const st = statSync(full)
      return { full, id: f.replace(/\.jsonl$/, ''), mtime: st.mtimeMs, size: st.size }
    })
    .filter((f) => f.size > 2048)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
  return files.map((f) => summarize(f.full, f.id, f.mtime, f.size))
}
