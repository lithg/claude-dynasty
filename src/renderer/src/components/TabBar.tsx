import { useStore } from '@/store'

export default function TabBar(): React.JSX.Element | null {
  const tabs = useStore((s) => s.tabs)
  const live = useStore((s) => s.live)
  const activeTabId = useStore((s) => s.activeTabId)
  const activeProject = useStore((s) => s.activeProject)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const closeTab = useStore((s) => s.closeTab)
  const openClaude = useStore((s) => s.openClaude)
  const openShell = useStore((s) => s.openShell)

  if (!activeProject) return null
  const mine = tabs.filter((t) => t.projectPath === activeProject)

  return (
    <div className="tabbar">
      <div className="tabs">
        {mine.map((t) => {
          const s = live.find((x) => x.tabId === t.id)
          const st = t.exited != null ? 'dead' : s ? s.status : t.kind === 'claude' ? 'starting' : 'shell'
          return (
            <div
              key={t.id}
              className={`tab ${t.id === activeTabId ? 'active' : ''} ${t.exited != null ? 'dead' : ''}`}
              onClick={() => setActiveTab(t.id)}
              onAuxClick={(e) => {
                if (e.button === 1) void closeTab(t.id)
              }}
              title={s?.name ? `${s.name} · ${s.sessionId}` : t.kind}
            >
              <span className={`dot ${st === 'busy' ? 'busy' : st === 'idle' ? 'idle' : st === 'dead' ? 'dead' : 'none'}`} />
              <span className="tab-title">
                {t.kind === 'claude' ? (s?.name || t.title) : t.title}
                {t.exited != null && ' (encerrado)'}
              </span>
              <button
                className="tab-close"
                title="Fechar (Ctrl+W)"
                onClick={(e) => {
                  e.stopPropagation()
                  void closeTab(t.id)
                }}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      <div className="tab-actions">
        <button className="btn" title="Nova sessão do Claude (Ctrl+T)" onClick={() => void openClaude(activeProject)}>
          + Claude
        </button>
        <button className="btn ghost" title="claude --continue" onClick={() => void openClaude(activeProject, { continueLast: true })}>
          ↩ continuar
        </button>
        <button className="btn ghost" title="Terminal (PowerShell) na pasta" onClick={() => void openShell(activeProject)}>
          + Shell
        </button>
      </div>
    </div>
  )
}
