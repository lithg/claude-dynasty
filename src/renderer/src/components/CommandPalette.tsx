import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import { statusFor } from './Sidebar'

interface Item {
  key: string
  kind: 'tab' | 'project'
  id: string
  label: string
  sub: string
  dot: string
  hint?: string
}

/** Pontua o quanto `q` combina com `text`; null = não combina. Menor é melhor. */
function score(text: string, q: string): number | null {
  if (!q) return 0
  const t = text.toLowerCase()
  const i = t.indexOf(q)
  if (i >= 0) return i === 0 ? 0 : 1 + i / 100
  // subsequência: "mng" acha "Managol"
  let at = -1
  for (const ch of q) {
    at = t.indexOf(ch, at + 1)
    if (at < 0) return null
  }
  return 50 + at / 100
}

/** Ctrl+P: pular para uma sessão aberta ou um projeto sem tirar a mão do teclado. */
export default function CommandPalette(): React.JSX.Element | null {
  const open = useStore((s) => s.paletteOpen)
  const setOpen = useStore((s) => s.setPaletteOpen)
  const projects = useStore((s) => s.projects)
  const tabs = useStore((s) => s.tabs)
  const live = useStore((s) => s.live)
  const activeTabId = useStore((s) => s.activeTabId)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const selectProject = useStore((s) => s.selectProject)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
    }
  }, [open])

  const items = useMemo(() => {
    const out: Item[] = []
    for (const t of tabs) {
      const s = live.find((x) => x.tabId === t.id)
      const name = projects.find((p) => p.path === t.projectPath)?.name ?? t.projectPath
      const st = t.suspended ? 'dead' : t.exited != null ? 'dead' : (s?.status ?? 'none')
      out.push({
        key: `tab:${t.id}`,
        kind: 'tab',
        id: t.id,
        label: `${name} · ${s?.name || t.title}`,
        sub: t.suspended ? 'aba suspensa' : t.exited != null ? 'encerrada' : st === 'busy' ? 'trabalhando' : 'aguardando você',
        dot: st === 'busy' ? 'busy' : st === 'idle' ? 'idle' : st === 'waiting' ? 'waiting' : st === 'dead' ? 'dead' : 'none',
        hint: t.id === activeTabId ? 'atual' : undefined
      })
    }
    for (const p of projects) {
      if (p.hidden) continue
      out.push({
        key: `proj:${p.path}`,
        kind: 'project',
        id: p.path,
        label: p.name,
        sub: p.path,
        dot: statusFor(live, p.path)
      })
    }
    return out
  }, [tabs, projects, live, activeTabId])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return items
      .map((it) => {
        const s = score(it.label, query) ?? score(it.sub, query)
        return s == null ? null : { it, s: s + (it.kind === 'tab' ? 0 : 10) }
      })
      .filter((x): x is { it: Item; s: number } => x !== null)
      .sort((a, b) => a.s - b.s)
      .slice(0, 40)
      .map((x) => x.it)
  }, [items, q])

  useEffect(() => {
    listRef.current?.querySelector('.pal-item.sel')?.scrollIntoView({ block: 'nearest' })
  }, [sel, filtered])

  if (!open) return null

  const choose = (it?: Item): void => {
    if (!it) return
    setOpen(false)
    if (it.kind === 'tab') setActiveTab(it.id)
    else void selectProject(it.id)
  }

  return (
    <div className="modal-back" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="ir para sessão ou projeto…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setSel(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((i) => Math.min(i + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(filtered[sel])
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
            }
          }}
        />
        <div className="pal-list" ref={listRef}>
          {filtered.length === 0 && <div className="pal-empty muted">nada com esse nome</div>}
          {filtered.map((it, i) => (
            <div
              key={it.key}
              className={`pal-item ${i === sel ? 'sel' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(it)}
            >
              <span className={`dot ${it.dot}`} />
              <span className="pal-label">{it.label}</span>
              <span className="muted small pal-sub">{it.hint ?? it.sub}</span>
            </div>
          ))}
        </div>
        <div className="pal-foot muted small">↑↓ navega · Enter abre · Esc fecha · sessões primeiro, depois projetos</div>
      </div>
    </div>
  )
}
