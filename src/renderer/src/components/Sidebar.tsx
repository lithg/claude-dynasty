import { useMemo, useRef, useState } from 'react'
import type { DocInfo, LiveSession, ProjectInfo } from '@shared/types'
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

export function statusFor(live: LiveSession[], path: string): 'busy' | 'waiting' | 'idle' | 'none' {
  const s = sessionsFor(live, path)
  if (!s.length) return 'none'
  if (s.some((x) => x.status === 'busy')) return 'busy'
  if (s.some((x) => x.status === 'waiting')) return 'waiting'
  return 'idle'
}

interface MenuState {
  x: number
  y: number
  project?: ProjectInfo
  doc?: DocInfo
}

/** Caixinha de texto que aparece no lugar do item para criar/renomear. */
function Prompt({
  valor,
  onOk,
  onCancel
}: {
  valor: string
  onOk: (v: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [v, setV] = useState(valor)
  return (
    <input
      className="inline-input"
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => (v.trim() && v !== valor ? onOk(v.trim()) : onCancel())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          if (v.trim()) onOk(v.trim())
          else onCancel()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
    />
  )
}

export default function Sidebar(): React.JSX.Element {
  const projects = useStore((s) => s.projects)
  const live = useStore((s) => s.live)
  const tabs = useStore((s) => s.tabs)
  const config = useStore((s) => s.config)
  const activeProject = useStore((s) => s.activeProject)
  const docs = useStore((s) => s.docs)
  const docsDir = useStore((s) => s.docsDir)
  const activeDoc = useStore((s) => s.activeDoc)
  const filter = useStore((s) => s.filter)
  const showHidden = useStore((s) => s.showHidden)
  const selectProject = useStore((s) => s.selectProject)
  const setFilter = useStore((s) => s.setFilter)
  const setShowHidden = useStore((s) => s.setShowHidden)
  const togglePin = useStore((s) => s.togglePin)
  const toggleHidden = useStore((s) => s.toggleHidden)
  const loadProjects = useStore((s) => s.loadProjects)
  const openDoc = useStore((s) => s.openDoc)
  const createDoc = useStore((s) => s.createDoc)
  const renameDoc = useStore((s) => s.renameDoc)
  const removeDoc = useStore((s) => s.removeDoc)
  const reorderDocs = useStore((s) => s.reorderDocs)
  const reorderProjects = useStore((s) => s.reorderProjects)
  const setProjectLabel = useStore((s) => s.setProjectLabel)
  const createProject = useStore((s) => s.createProject)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [novoProjeto, setNovoProjeto] = useState(false)
  const [novoDoc, setNovoDoc] = useState(false)
  const [renomeando, setRenomeando] = useState<string | null>(null)
  // o item arrastado fica num ref: o estado do React não chega a tempo do drop
  const arrastadoRef = useRef<string | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)

  const comecaArrasto = (chave: string): void => {
    arrastadoRef.current = chave
    setArrastando(chave)
  }
  const terminaArrasto = (): void => {
    arrastadoRef.current = null
    setArrastando(null)
  }

  const rotulo = (p: ProjectInfo): string => config?.perProject[p.name]?.label || p.name

  const list = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return projects.filter(
      (p) =>
        (showHidden || !p.hidden) &&
        (!f || p.name.toLowerCase().includes(f) || (config?.perProject[p.name]?.label ?? '').toLowerCase().includes(f))
    )
  }, [projects, filter, showHidden, config])

  const pinned = list.filter((p) => p.pinned)
  const rest = list.filter((p) => !p.pinned)

  const docsFiltrados = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return docs.filter((d) => !f || d.title.toLowerCase().includes(f) || d.name.toLowerCase().includes(f))
  }, [docs, filter])

  const item = (p: ProjectInfo): React.JSX.Element => {
    if (renomeando === `proj:${p.name}`) {
      return (
        <div className="proj" key={p.path}>
          <Prompt
            valor={rotulo(p)}
            onOk={(v) => {
              void setProjectLabel(p.name, v === p.name ? '' : v)
              setRenomeando(null)
            }}
            onCancel={() => setRenomeando(null)}
          />
        </div>
      )
    }
    const st = statusFor(live, p.path)
    const count = tabs.filter((t) => t.projectPath === p.path && t.exited == null).length
    const liveCount = sessionsFor(live, p.path).length
    return (
      <button
        key={p.path}
        draggable
        className={`proj ${activeProject === p.path && !activeDoc ? 'active' : ''} ${p.hidden ? 'hidden-proj' : ''} ${
          arrastando === `proj:${p.name}` ? 'dragging' : ''
        }`}
        onClick={() => void selectProject(p.path)}
        onDragStart={() => comecaArrasto(`proj:${p.name}`)}
        onDragEnd={terminaArrasto}
        onDragOver={(e) => {
          if (arrastadoRef.current?.startsWith('proj:')) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          const de = arrastadoRef.current?.startsWith('proj:') ? arrastadoRef.current.slice(5) : null
          if (de && de !== p.name) void reorderProjects(de, p.name)
          terminaArrasto()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, project: p })
        }}
        title={p.path}
      >
        <span className={`dot ${st}`} />
        <span className="proj-name">{rotulo(p)}</span>
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

  const itemDoc = (d: DocInfo): React.JSX.Element => {
    if (renomeando === `doc:${d.path}`) {
      return (
        <div className="proj" key={d.path}>
          <Prompt
            valor={d.name.replace(/\.md$/i, '')}
            onOk={(v) => {
              void renameDoc(d.path, v)
              setRenomeando(null)
            }}
            onCancel={() => setRenomeando(null)}
          />
        </div>
      )
    }
    return (
      <button
        key={d.path}
        draggable
        className={`proj doc ${activeDoc === d.path ? 'active' : ''} ${arrastando === `doc:${d.name}` ? 'dragging' : ''}`}
        onClick={() => void openDoc(d.path)}
        onDragStart={() => comecaArrasto(`doc:${d.name}`)}
        onDragEnd={terminaArrasto}
        onDragOver={(e) => {
          if (arrastadoRef.current?.startsWith('doc:')) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          const de = arrastadoRef.current?.startsWith('doc:') ? arrastadoRef.current.slice(4) : null
          if (de && de !== d.name) void reorderDocs(de, d.name)
          terminaArrasto()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, doc: d })
        }}
        title={d.path}
      >
        <span className="doc-icon">▤</span>
        <span className="proj-name">{d.title}</span>
      </button>
    )
  }

  return (
    <aside className="sidebar" onClick={() => menu && setMenu(null)}>
      <div className="sidebar-head">
        <input
          className="search"
          placeholder="Filtrar…"
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

        <div className="group-label with-action">
          <span>Projetos</span>
          <button className="icon-btn sm" title="Criar uma pasta nova na raiz dos projetos" onClick={() => setNovoProjeto(true)}>
            +
          </button>
        </div>
        {novoProjeto && (
          <div className="proj">
            <Prompt
              valor=""
              onOk={(v) => {
                void createProject(v)
                setNovoProjeto(false)
              }}
              onCancel={() => setNovoProjeto(false)}
            />
          </div>
        )}
        {rest.map(item)}
        {list.length === 0 && <div className="empty small">Nenhum projeto encontrado.</div>}

        <div className="group-label with-action">
          <span>Documentação</span>
          <button className="icon-btn sm" title="Novo documento" onClick={() => setNovoDoc(true)}>
            +
          </button>
        </div>
        {novoDoc && (
          <div className="proj">
            <Prompt
              valor=""
              onOk={(v) => {
                void createDoc(v)
                setNovoDoc(false)
              }}
              onCancel={() => setNovoDoc(false)}
            />
          </div>
        )}
        {docsFiltrados.map(itemDoc)}
        {docs.length === 0 && <div className="empty small">Nenhum documento ainda.</div>}
      </div>
      <div className="sidebar-foot">
        <label className="check">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          mostrar ocultos
        </label>
        <button className="legend-path" title={`Os documentos são arquivos .md em ${docsDir}`} onClick={() => void window.api.docs.reveal()}>
          abrir pasta dos documentos
        </button>
        <span className="legend">
          <span className="dot busy" /> trabalhando <span className="dot waiting" /> esperando você <span className="dot idle" /> ocioso
        </span>
      </div>

      {menu && (
        <div className="ctx" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.project && (
            <>
              <button
                onClick={() => {
                  setRenomeando(`proj:${menu.project!.name}`)
                  setMenu(null)
                }}
              >
                Renomear (só o rótulo)
              </button>
              <button
                onClick={() => {
                  void togglePin(menu.project!.name)
                  setMenu(null)
                }}
              >
                {menu.project.pinned ? 'Desafixar' : 'Fixar no topo'}
              </button>
              <button
                onClick={() => {
                  void toggleHidden(menu.project!.name)
                  setMenu(null)
                }}
              >
                {menu.project.hidden ? 'Mostrar' : 'Ocultar'}
              </button>
              <hr />
              <button
                onClick={() => {
                  void window.api.projects.openExplorer(menu.project!.path)
                  setMenu(null)
                }}
              >
                Abrir no Explorer
              </button>
              <button
                onClick={() => {
                  void window.api.projects.openVsCode(menu.project!.path)
                  setMenu(null)
                }}
              >
                Abrir no VS Code
              </button>
            </>
          )}
          {menu.doc && (
            <>
              <button
                onClick={() => {
                  setRenomeando(`doc:${menu.doc!.path}`)
                  setMenu(null)
                }}
              >
                Renomear
              </button>
              <button
                onClick={() => {
                  void window.api.docs.reveal()
                  setMenu(null)
                }}
              >
                Abrir a pasta
              </button>
              <hr />
              <button
                className="danger"
                onClick={() => {
                  void removeDoc(menu.doc!.path)
                  setMenu(null)
                }}
              >
                Excluir (vai para a lixeira)
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  )
}
