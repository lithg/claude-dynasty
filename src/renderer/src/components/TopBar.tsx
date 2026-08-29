import { useStore } from '@/store'
import { humanizeReset, usageColor } from '@/lib/format'
import { THEMES } from '@shared/themes'

export default function TopBar(): React.JSX.Element {
  const usage = useStore((s) => s.usage)
  const config = useStore((s) => s.config)
  const activeProject = useStore((s) => s.activeProject)
  const projects = useStore((s) => s.projects)
  const live = useStore((s) => s.live)
  const refreshUsage = useStore((s) => s.refreshUsage)
  const saveConfig = useStore((s) => s.saveConfig)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const panelOpen = useStore((s) => s.panelOpen)
  const setPanelOpen = useStore((s) => s.setPanelOpen)

  const name = projects.find((p) => p.path === activeProject)?.name
  const busy = live.filter((s) => s.status === 'busy').length


  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">◆</span>
        <span>Claude Wrapper</span>
        {name && <span className="crumb">/ {name}</span>}
      </div>

      <div className="live-summary" title="sessões do Claude vivas (todas as pastas)">
        <span className={`dot ${busy ? 'busy' : live.length ? 'idle' : 'none'}`} />
        {live.length} sessão{live.length === 1 ? '' : 'ões'}
        {busy > 0 && ` · ${busy} trabalhando`}
      </div>

      <div className="usage">
        {usage?.error && (
          <span className="usage-err" title={usage.error}>
            {usage.stale ? '⚠ desatualizado' : 'consumo indisponível'}
          </span>
        )}
        {usage?.limits.map((l) => (
          <div key={l.kind} className="meter" title={`${l.label}: ${l.percent.toFixed(0)}%\n${humanizeReset(l.resetsAt)}`}>
            <span className="meter-label">{l.label}</span>
            <span className="meter-track">
              <span className="meter-fill" style={{ width: `${Math.min(100, l.percent)}%`, background: usageColor(l.percent) }} />
            </span>
            <span className="meter-pct">{l.percent.toFixed(0)}%</span>
          </div>
        ))}
        <button className="icon-btn" title="Atualizar consumo" onClick={() => void refreshUsage(true)}>
          ⟳
        </button>
      </div>

      <div className="actions">
        <select className="theme-sel" title="Tema" value={config?.theme ?? 'dark'} onChange={(e) => void saveConfig({ theme: e.target.value })}>
          <option value="system">sistema</option>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="icon-btn" title="Painel do projeto (Ctrl+B)" onClick={() => setPanelOpen(!panelOpen)}>
          {panelOpen ? '▸' : '◂'}
        </button>
        <button className="icon-btn" title="Configurações (Ctrl+,)" onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </div>
    </header>
  )
}
