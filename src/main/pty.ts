import * as nodePty from 'node-pty'
import type { IPty } from 'node-pty'

export interface SpawnSpec {
  file: string
  args: string[]
  cwd: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}

export class PtyManager {
  private ptys = new Map<string, IPty>()

  constructor(private send: (channel: string, ...args: unknown[]) => void) {}

  spawn(id: string, spec: SpawnSpec): number {
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string') env[k] = v
    // Electron injeta variáveis que confundem processos filhos Node.
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_NO_ATTACH_CONSOLE
    // Se o wrapper foi aberto de dentro de uma sessão do Claude Code, o filho herdaria
    // marcadores de "sessão filha" (transcript off, não registra em ~/.claude/sessions).
    for (const k of Object.keys(env)) {
      if (
        k === 'CLAUDECODE' ||
        k === 'CLAUDE_PID' ||
        k === 'CLAUDE_EFFORT' ||
        /^CLAUDE_CODE_(CHILD|SESSION|MESSAGING|BRIDGE|ENTRYPOINT|EXECPATH|SSE|PARENT)/.test(k)
      ) {
        delete env[k]
      }
    }
    Object.assign(env, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'claude-dynasty',
      WRAPPER_CLAUDE: '1',
      WRAPPER_TAB_ID: id,
      ...(spec.env ?? {})
    })

    const p = nodePty.spawn(spec.file, spec.args, {
      name: 'xterm-256color',
      cols: spec.cols ?? 120,
      rows: spec.rows ?? 30,
      cwd: spec.cwd,
      env,
      useConpty: true
    })
    p.onData((d) => this.send('pty:data', id, d))
    p.onExit((e) => {
      this.ptys.delete(id)
      this.send('pty:exit', id, e.exitCode)
    })
    this.ptys.set(id, p)
    return p.pid
  }

  write(id: string, data: string): void {
    this.ptys.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    if (cols < 2 || rows < 2) return
    try {
      this.ptys.get(id)?.resize(cols, rows)
    } catch {
      /* pty já morreu */
    }
  }

  kill(id: string): void {
    const p = this.ptys.get(id)
    if (!p) return
    try {
      p.kill()
    } catch {
      /* ignore */
    }
    this.ptys.delete(id)
  }

  has(id: string): boolean {
    return this.ptys.has(id)
  }

  killAll(): void {
    for (const id of Array.from(this.ptys.keys())) this.kill(id)
  }
}
