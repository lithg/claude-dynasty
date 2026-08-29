import { useMemo, useState } from 'react'
import type { LiveSession, ProjectInfo } from '@shared/types'
import { useStore } from '@/store'
import { STACK_LABEL } from '@/lib/format'

function norm(p: string): string {
  return p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

export function sessionsFor(live: LiveSession[], path: string): LiveSession[] {
  const n = norm(path)
  return live.filter((s) => {
    const c = norm(s.cwd)
    return c === n || c.startsWith(n + '\\')
  })
}

export function statusFor(live: LiveSession[], path: string): 'busy' | 'idle' | 'none' {
  const s = sessionsFor(live, path)
  if (!s.length) return 'none'
  return s.some((x) => x.status === 'busy') ? 'busy' : 'idle'
}

interface MenuState {
  x: number
  y: number
  project: ProjectInfo
}

export default function Sidebar(): React.JSX.Element {
  const projects = useStore((s) => s.projects)
  const live = useStore((s) => s.live)
  const tabs = useStore((s) => s.tabs)
  const activeProject = useStore((s) => s.activeProject)
  const filter = useStore((s) => s.filter)
  const showHidden = useStore((s) => s.showHidden)
  const selectProject = useStore((s) => s.selectProject)
  const setFilter = useStore((s) => s.setFilter)
  const setShowHidden = useStore((s) => s.setShowHidden)
  const togglePin = useStore((s) => s.togglePin)
  const toggleHidden = useStore((s) => s.toggleHidden)
  const loadProjects = useStore((s) => s.loadProjects)
  const [menu, setMenu] = useState<MenuState | null>(null)

  const list = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return projects.filter((p) => (showHidden || !p.hidden) && (!f || p.name.toLowerCase().includes(f)))
  }, [projects, filter, showHidden])

  const pinned = list.filter((p) => p.pinned)
  const rest = list.filter((p) => !p.pinned)

  const item = (p: ProjectInfo): React.JSX.Element => {
    const st = statusFor(live, p.path)
    const count = tabs.filter((t) => t.projectPath === p.path && t.exited == null).length
    const liveCount = sessionsFor(live, p.path).length
    return (
      <button
        key={p.path}
        className={`proj ${activeProject === p.path ? 'active' : ''} ${p.hidden ? 'hidden-proj' : ''}`}
        onClick={() => void selectProject(p.path)}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, project: p })
        }}
        title={p.path}
      >
        <span className={`dot ${st}`} />
        <span className="proj-name">{p.name}</span>
        <span className="proj-meta">
          {p.stacks.slice(0, 2).map((s) => (
            <span key={s} className="chip">
              {STACK_LABEL[s] ?? s}
            </span>
          ))}
          {liveCount > 0 && (
            <span className="count" title="sessões do Claude vivas nesta pasta">
              {liveCount}
            </span>
          )}
          {count > 0 && liveCount === 0 && <span className="count muted">{count}</span>}
        </span>
      </button>
    )
  }

  return (
    <aside className="sidebar" onClick={() => menu && setMenu(null)}>
      <div className="sidebar-head">
        <input
          className="search"
          placeholder="Filtrar projetos…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="icon-btn" title="Reescanear pasta" onClick={() => void loadProjects()}>
          ⟳
        </button>
      </div>
      <div className="sidebar-list">
        {pinned.length > 0 && <div className="group-label">Fixados</div>}
        {pinned.map(item)}
        {rest.length > 0 && <div className="group-label">Projetos</div>}
        {rest.map(item)}
        {list.length === 0 && <div className="empty small">Nenhum projeto encontrado.</div>}
      </div>
      <div className="sidebar-foot">
        <label className="check">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          mostrar ocultos
        </label>
        <span className="legend">
          <span className="dot busy" /> trabalhando <span className="dot idle" /> ocioso
        </span>
      </div>

      {menu && (
        <div className="ctx" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              void togglePin(menu.project.name)
              setMenu(null)
            }}
          >
            {menu.project.pinned ? 'Desafixar' : 'Fixar no topo'}
          </button>
          <button
            onClick={() => {
              void toggleHidden(menu.project.name)
              setMenu(null)
            }}
          >
            {menu.project.hidden ? 'Mostrar' : 'Ocultar'}
          </button>
          <hr />
          <button
            onClick={() => {
              void window.api.projects.openExplorer(menu.project.path)
              setMenu(null)
            }}
          >
            Abrir no Explorer
          </button>
          <button
            onClick={() => {
              void window.api.projects.openVsCode(menu.project.path)
              setMenu(null)
            }}
          >
            Abrir no VS Code
          </button>
        </div>
      )}
    </aside>
  )
}
