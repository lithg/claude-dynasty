import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { ClaudeMdInfo, GitInfo, ProjectDetails, ProjectInfo, StackKind } from '@shared/types'
import { getConfig } from './config'

const run = promisify(execFile)

const MARKERS = [
  '.git',
  'CLAUDE.md',
  'package.json',
  'composer.json',
  'pubspec.yaml',
  'project.godot',
  'Cargo.toml',
  'pyproject.toml',
  'requirements.txt',
  'go.mod'
]

function detectStacks(dir: string): StackKind[] {
  const has = (f: string): boolean => existsSync(join(dir, f))
  const stacks: StackKind[] = []
  if (has('composer.json')) {
    stacks.push(has('artisan') ? 'laravel' : 'php')
  }
  if (has('pubspec.yaml')) stacks.push('flutter')
  if (has('project.godot')) stacks.push('godot')
  if (has('Cargo.toml')) stacks.push('rust')
  if (has('go.mod')) stacks.push('go')
  if (has('pyproject.toml') || has('requirements.txt')) stacks.push('python')
  if (has('Assets') && has('ProjectSettings')) stacks.push('unity')
  if (has('package.json')) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
      if (deps.next) stacks.push('next')
      else if (deps.react) stacks.push('react')
      if (deps.vue || deps.nuxt) stacks.push('vue')
      if (!stacks.some((s) => ['next', 'react', 'vue', 'laravel'].includes(s))) stacks.push('node')
    } catch {
      stacks.push('node')
    }
  }
  return stacks
}

export function slugForPath(p: string): string {
  // Mesmo esquema que o Claude Code usa em ~/.claude/projects/<slug>
  return p.replace(/[^a-zA-Z0-9]/g, '-')
}

export function listProjects(): ProjectInfo[] {
  const cfg = getConfig()
  const root = cfg.rootDir
  if (!existsSync(root)) return []
  const out: ProjectInfo[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const name = entry.name
    if (name.startsWith('.') || name.startsWith('_')) continue
    const dir = join(root, name)
    if (!MARKERS.some((m) => existsSync(join(dir, m)))) continue
    let mtime = 0
    try {
      mtime = statSync(dir).mtimeMs
    } catch {
      /* ignore */
    }
    out.push({
      id: slugForPath(dir),
      name,
      path: dir,
      hasGit: existsSync(join(dir, '.git')),
      hasClaudeMd: existsSync(join(dir, 'CLAUDE.md')),
      stacks: detectStacks(dir),
      pinned: cfg.pinned.includes(name),
      hidden: cfg.hidden.includes(name),
      mtime
    })
  }
  const pinIndex = (p: ProjectInfo): number => {
    const i = cfg.pinned.indexOf(p.name)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  out.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.pinned && b.pinned) return pinIndex(a) - pinIndex(b)
    return b.mtime - a.mtime
  })
  return out
}

async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd: dir, windowsHide: true, timeout: 8000 })
  return stdout.trim()
}

async function gitInfo(dir: string): Promise<GitInfo | undefined> {
  if (!existsSync(join(dir, '.git'))) return undefined
  try {
    const [branch, status, log] = await Promise.all([
      git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '?'),
      git(dir, ['status', '--porcelain', '-b']).catch(() => ''),
      git(dir, ['log', '-1', '--format=%s%n%ct']).catch(() => '')
    ])
    const lines = status.split('\n')
    const head = lines[0] ?? ''
    const dirty = lines.slice(1).filter((l) => l.trim().length > 0).length
    const ahead = Number(/ahead (\d+)/.exec(head)?.[1] ?? 0)
    const behind = Number(/behind (\d+)/.exec(head)?.[1] ?? 0)
    const [lastCommit = '', ts = '0'] = log.split('\n')
    let remote: string | undefined
    try {
      remote = await git(dir, ['remote', 'get-url', 'origin'])
    } catch {
      remote = undefined
    }
    return { branch, dirty, ahead, behind, lastCommit, lastCommitAt: Number(ts) * 1000, remote }
  } catch {
    return undefined
  }
}

function parseClaudeMd(dir: string): ClaudeMdInfo | undefined {
  const f = join(dir, 'CLAUDE.md')
  if (!existsSync(f)) return undefined
  let raw = ''
  try {
    raw = readFileSync(f, 'utf-8')
  } catch {
    return undefined
  }
  const lines = raw.split(/\r?\n/)
  const title = lines.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, '').trim()

  const sections: { title: string; body: string }[] = []
  let cur: { title: string; body: string[] } | null = null
  for (const l of lines) {
    const m = /^##\s+(.+)/.exec(l)
    if (m) {
      if (cur) sections.push({ title: cur.title, body: cur.body.join('\n').trim() })
      cur = { title: m[1].trim(), body: [] }
    } else if (cur) {
      cur.body.push(l)
    }
  }
  if (cur) sections.push({ title: cur.title, body: cur.body.join('\n').trim() })

  const summarySection = sections.find((s) => /o que [ée]|overview|sobre|descri/i.test(s.title))
  const summary = (summarySection?.body ?? sections[0]?.body ?? '')
    .split(/\n\s*\n/)[0]
    ?.replace(/\*\*/g, '')
    .trim()

  const urls = Array.from(new Set(raw.match(/https?:\/\/[^\s)>\]`"']+/g) ?? [])).filter(
    (u) => !/github\.com|npmjs|docs\.|developer\./i.test(u)
  )
  const ssh = Array.from(
    new Set(
      (raw.match(/ssh\s+(-\S+\s+\S+\s+)*\S+@\S+/g) ?? []).map((s) => s.replace(/[`*]/g, '').trim())
    )
  )

  return { title, summary, urls: urls.slice(0, 10), ssh: ssh.slice(0, 5), sections, raw }
}

function scriptsInfo(dir: string): Pick<ProjectDetails, 'scripts' | 'scriptsRunner'> {
  const pkg = join(dir, 'package.json')
  if (!existsSync(pkg)) return {}
  try {
    const json = JSON.parse(readFileSync(pkg, 'utf-8'))
    const scripts = json.scripts ?? {}
    let runner: ProjectDetails['scriptsRunner'] = 'npm'
    if (existsSync(join(dir, 'pnpm-lock.yaml'))) runner = 'pnpm'
    else if (existsSync(join(dir, 'yarn.lock'))) runner = 'yarn'
    else if (existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock'))) runner = 'bun'
    return { scripts, scriptsRunner: runner }
  } catch {
    return {}
  }
}

export async function projectDetails(dir: string): Promise<ProjectDetails> {
  const [git] = await Promise.all([gitInfo(dir)])
  return {
    path: dir,
    git,
    claudeMd: parseClaudeMd(dir),
    ...scriptsInfo(dir)
  }
}

export function projectName(dir: string): string {
  return basename(dir)
}
