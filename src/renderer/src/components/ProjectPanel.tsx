import { useState } from 'react'
import { useStore } from '@/store'
import { sessionsFor } from './Sidebar'
import { fullDate, relTime, STACK_LABEL } from '@/lib/format'
import type { ProjectOverride } from '@shared/types'
import { EFFORT_OPTIONS, MODEL_OPTIONS, modelLabel } from '@shared/options'

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }): React.JSX.Element {
  return (
    <section className="sec">
      <div className="sec-head">
        <span>{title}</span>
        {right}
      </div>
      {children}
    </section>
  )
}

export default function ProjectPanel(): React.JSX.Element | null {
  const activeProject = useStore((s) => s.activeProject)
  const projects = useStore((s) => s.projects)
  const details = useStore((s) => s.details)
  const history = useStore((s) => s.history)
  const live = useStore((s) => s.live)
  const config = useStore((s) => s.config)
  const openClaude = useStore((s) => s.openClaude)
  const openShell = useStore((s) => s.openShell)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const loadDetails = useStore((s) => s.loadDetails)
  const loadHistory = useStore((s) => s.loadHistory)
  const saveConfig = useStore((s) => s.saveConfig)
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  if (!activeProject || !config) return null
  const p = projects.find((x) => x.path === activeProject)
  if (!p) return null
  const d = details[activeProject]
  const h = history[activeProject] ?? []
  const sessions = sessionsFor(live, activeProject)
  const ov: ProjectOverride = config.perProject[p.name] ?? {}

  const copy = (t: string): void => {
    void window.api.app.copy(t)
    setCopied(t)
    setTimeout(() => setCopied(null), 1200)
  }

  const setOv = (patch: ProjectOverride): void => {
    const next = { ...ov, ...patch }
    for (const k of Object.keys(next) as (keyof ProjectOverride)[]) {
      if (next[k] === undefined || next[k] === '') delete next[k]
    }
    void saveConfig({ perProject: { ...config.perProject, [p.name]: next } })
  }


  const skipEffective = ov.skipPermissions ?? config.skipPermissions

  return (
    <aside className="panel">
      <div className="panel-head">
        <div className="panel-title">{d?.claudeMd?.title ?? p.name}</div>
        <button className="path" title="copiar caminho" onClick={() => copy(p.path)}>
          {copied === p.path ? 'copiado ✓' : p.path}
        </button>
        <div className="row gap">
          <button className="btn ghost sm" onClick={() => void window.api.projects.openExplorer(p.path)}>
            Explorer
          </button>
          <button className="btn ghost sm" onClick={() => void window.api.projects.openVsCode(p.path)}>
            VS Code
          </button>
          {p.hasClaudeMd && (
            <button className="btn ghost sm" onClick={() => setShowRaw(!showRaw)}>
              {showRaw ? 'fechar CLAUDE.md' : 'CLAUDE.md'}
            </button>
          )}
          <button
            className="btn ghost sm"
            title="recarregar git/CLAUDE.md/histórico"
            onClick={() => {
              void loadDetails(p.path, true)
              void loadHistory(p.path)
            }}
          >
            ⟳
          </button>
        </div>
        <div className="row wrap">
          {p.stacks.map((s) => (
            <span key={s} className="chip">
              {STACK_LABEL[s] ?? s}
            </span>
          ))}
          <span className={`chip ${skipEffective ? 'warn' : ''}`} title="--dangerously-skip-permissions">
            {skipEffective ? 'skip-permissions' : 'com permissões'}
          </span>
        </div>
      </div>

      <div className="panel-body">
        {showRaw && d?.claudeMd && (
          <Section title="CLAUDE.md">
            <pre className="raw">{d.claudeMd.raw}</pre>
          </Section>
        )}

        <Section title="Status">
          {d?.git ? (
            <div className="kv">
              <span>branch</span>
              <span className="mono">
                {d.git.branch}
                {d.git.ahead > 0 && <span className="muted"> ↑{d.git.ahead}</span>}
                {d.git.behind > 0 && <span className="muted"> ↓{d.git.behind}</span>}
              </span>
              <span>working tree</span>
              <span className={d.git.dirty ? 'warn-text' : 'ok-text'}>
                {d.git.dirty ? `${d.git.dirty} arquivo(s) alterado(s)` : 'limpo'}
              </span>
              <span>último commit</span>
              <span title={fullDate(d.git.lastCommitAt)}>
                {d.git.lastCommit || '—'} <span className="muted">· {relTime(d.git.lastCommitAt)}</span>
              </span>
            </div>
          ) : (
            <div className="muted small">{p.hasGit ? 'lendo git…' : 'sem repositório git'}</div>
          )}

          <div className="sub-label">Sessões do Claude nesta pasta</div>
          {sessions.length === 0 && <div className="muted small">nenhuma sessão viva</div>}
          {sessions.map((s) => (
            <div key={s.pid} className="live-row">
              <span className={`dot ${s.status === 'busy' ? 'busy' : s.status === 'waiting' ? 'waiting' : 'idle'}`} />
              <span className="mono">{s.name || s.sessionId.slice(0, 8)}</span>
              <span className="muted small">
                {s.status} · {relTime(s.startedAt)} · {s.tabId ? 'wrapper' : 'externa'}
              </span>
              {s.model && (
                <span className="model-chip" title={s.model}>
                  {modelLabel(s.model)}
                </span>
              )}
              {s.bridgeSessionId && (
                <button
                  className="rc-badge"
                  title={`Remote Control conectado — abrir https://claude.ai/code/${s.bridgeSessionId}`}
                  onClick={() => void window.api.app.openExternal(`https://claude.ai/code/${s.bridgeSessionId}`)}
                >
                  RC
                </button>
              )}
              {s.tabId ? (
                <button className="btn ghost sm" onClick={() => setActiveTab(s.tabId!)}>
                  ir
                </button>
              ) : (
                <button
                  className="btn ghost sm"
                  title="abre um novo processo retomando esta sessão (a externa continua viva)"
                  onClick={() => void openClaude(p.path, { resume: s.sessionId })}
                >
                  resume
                </button>
              )}
            </div>
          ))}
        </Section>

        {d?.claudeMd && (
          <Section title="Infos (CLAUDE.md)">
            {d.claudeMd.summary && <p className="summary">{d.claudeMd.summary}</p>}
            {d.claudeMd.urls.length > 0 && (
              <div className="links">
                {d.claudeMd.urls.map((u) => (
                  <button key={u} className="link" onClick={() => void window.api.app.openExternal(u)}>
                    {u.replace(/^https?:\/\//, '')}
                  </button>
                ))}
              </div>
            )}
            {d.claudeMd.ssh.length > 0 && (
              <div className="links">
                {d.claudeMd.ssh.map((s) => (
                  <button key={s} className="link mono" title="copiar" onClick={() => copy(s)}>
                    {copied === s ? 'copiado ✓' : s}
                  </button>
                ))}
              </div>
            )}
          </Section>
        )}

        {d?.scripts && Object.keys(d.scripts).length > 0 && (
          <Section title={`Scripts (${d.scriptsRunner})`}>
            <div className="row wrap">
              {Object.entries(d.scripts)
                .slice(0, 16)
                .map(([k, v]) => (
                  <button
                    key={k}
                    className="btn ghost sm"
                    title={v}
                    onClick={() => void openShell(p.path, `${d.scriptsRunner} run ${k}`)}
                  >
                    ▶ {k}
                  </button>
                ))}
            </div>
          </Section>
        )}

        <Section title="Opções deste projeto">
          <div className="kv form">
            <span>permissões</span>
            <select
              value={ov.skipPermissions === undefined ? 'default' : ov.skipPermissions ? 'skip' : 'ask'}
              onChange={(e) => {
                const v = e.target.value
                setOv({ skipPermissions: v === 'default' ? undefined : v === 'skip' })
              }}
            >
              <option value="default">padrão global ({config.skipPermissions ? 'skip' : 'perguntar'})</option>
              <option value="skip">--dangerously-skip-permissions</option>
              <option value="ask">perguntar (normal)</option>
            </select>
            <span>modelo</span>
            <select value={ov.model ?? ''} onChange={(e) => setOv({ model: e.target.value })}>
              {MODEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value ? o.label : `padrão global (${MODEL_OPTIONS.find((m) => m.value === config.model)?.label ?? config.model ?? 'Claude'})`}
                </option>
              ))}
            </select>
            <span>effort</span>
            <select value={ov.effort ?? ''} onChange={(e) => setOv({ effort: e.target.value })}>
              {EFFORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value ? o.label : `padrão global (${config.effort || 'Claude'})`}
                </option>
              ))}
            </select>
            <span>remote control</span>
            <select
              value={ov.remoteControl === undefined ? 'default' : ov.remoteControl ? 'on' : 'off'}
              onChange={(e) => {
                const v = e.target.value
                setOv({ remoteControl: v === 'default' ? undefined : v === 'on' })
              }}
              title="novas sessões deste projeto já abrem com --remote-control"
            >
              <option value="default">padrão global ({config.remoteControl ? 'ligado' : 'desligado'})</option>
              <option value="on">abrir com --remote-control</option>
              <option value="off">desligado</option>
            </select>
            <span>args extras</span>
            <input placeholder="ex.: --add-dir ../outro" value={ov.extraArgs ?? ''} onChange={(e) => setOv({ extraArgs: e.target.value })} />
          </div>
        </Section>

        <Section
          title="Histórico de sessões"
          right={<span className="muted small">{h.length}</span>}
        >
          {h.length === 0 && <div className="muted small">nenhuma sessão registrada em ~/.claude</div>}
          {h.map((s) => (
            <div key={s.sessionId} className="hist-row" title={s.firstPrompt ?? ''}>
              <div className="hist-main">
                <div className="hist-title">{s.title}</div>
                <div className="muted small">
                  {relTime(s.mtime)} · {fullDate(s.mtime)}
                  {s.gitBranch && ` · ${s.gitBranch}`}
                </div>
              </div>
              <button className="btn ghost sm" title={`claude --resume ${s.sessionId}`} onClick={() => void openClaude(p.path, { resume: s.sessionId })}>
                retomar
              </button>
            </div>
          ))}
        </Section>
      </div>
    </aside>
  )
}
