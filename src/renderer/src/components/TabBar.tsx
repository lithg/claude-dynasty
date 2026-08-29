import { useStore } from '@/store'
import { requestSuggest } from '@/lib/promptBus'
import { EFFORT_OPTIONS, MODEL_OPTIONS, modelLabel } from '@shared/options'

export default function TabBar(): React.JSX.Element | null {
  const tabs = useStore((s) => s.tabs)
  const live = useStore((s) => s.live)
  const config = useStore((s) => s.config)
  const projects = useStore((s) => s.projects)
  const activeTabId = useStore((s) => s.activeTabId)
  const activeProject = useStore((s) => s.activeProject)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const closeTab = useStore((s) => s.closeTab)
  const resumeTab = useStore((s) => s.resumeTab)
  const openClaude = useStore((s) => s.openClaude)
  const openShell = useStore((s) => s.openShell)
  const saveConfig = useStore((s) => s.saveConfig)
  const toggleRc = useStore((s) => s.toggleRc)

  if (!activeProject || !config) return null
  const mine = tabs.filter((t) => t.projectPath === activeProject)
  const name = projects.find((p) => p.path === activeProject)?.name ?? ''
  const ov = config.perProject[name] ?? {}

  const active = mine.find((t) => t.id === activeTabId)

  /**
   * Muda o modelo/effort do projeto e **também da sessão que está rodando** (`/model X`).
   * O Claude pode responder que a troca só vale na próxima sessão — é o mesmo aviso de quando
   * você digita o comando à mão. Atenção: ele grava isso como padrão global no settings.json.
   */
  const setOv = (patch: { model?: string; effort?: string }): void => {
    const next = { ...ov, ...patch }
    void saveConfig({ perProject: { ...config.perProject, [name]: next } })
    const cmd = patch.model !== undefined ? 'model' : 'effort'
    const value = patch.model ?? patch.effort ?? ''
    // sem valor = "usar o padrão": não manda nada, senão o /model abre o seletor interativo
    if (!value || !active || active.kind !== 'claude' || active.suspended || active.exited != null) return
    window.api.pty.write(active.id, `/${cmd} ${value}`)
    setTimeout(() => window.api.pty.write(active.id, '\r'), 150)
  }
  const activeLive = active ? live.find((x) => x.tabId === active.id) : undefined
  const rcActive = Boolean(activeLive?.bridgeSessionId)
  const rcUrl = activeLive?.bridgeSessionId ? `https://claude.ai/code/${activeLive.bridgeSessionId}` : undefined

  const label = (opts: typeof MODEL_OPTIONS, v: string, fallback: string): string => {
    if (!v) return `padrão${fallback ? ` (${opts.find((o) => o.value === fallback)?.label ?? fallback})` : ''}`
    return opts.find((o) => o.value === v)?.label ?? v
  }

  return (
    <div className="tabbar">
      <div className="tabs">
        {mine.map((t) => {
          const s = live.find((x) => x.tabId === t.id)
          const st = t.suspended
            ? 'suspended'
            : t.exited != null
              ? 'dead'
              : s
                ? s.status
                : t.kind === 'claude'
                  ? 'starting'
                  : 'shell'
          const dot =
            st === 'busy'
              ? 'busy'
              : st === 'idle'
                ? 'idle'
                : st === 'waiting'
                  ? 'waiting'
                  : st === 'dead' || st === 'suspended'
                    ? 'dead'
                    : 'none'
          return (
            <div
              key={t.id}
              className={`tab ${t.id === activeTabId ? 'active' : ''} ${t.exited != null || t.suspended ? 'dead' : ''}`}
              onClick={() => setActiveTab(t.id)}
              onAuxClick={(e) => {
                if (e.button === 1) void closeTab(t.id)
              }}
              title={s?.name ? `${s.name} · ${s.sessionId}${s.model ? `\nmodelo em uso: ${modelLabel(s.model)} (${s.model})` : ''}` : t.kind}
            >
              <span className={`dot ${dot}`} />
              <span className="tab-title">
                {t.kind === 'claude' ? s?.name || t.title : t.title}
                {t.suspended ? ' (suspensa)' : t.exited != null ? ' (encerrado)' : ''}
              </span>
              {s?.model && <span className="model-chip">{modelLabel(s.model)}</span>}
              {s?.bridgeSessionId && (
                <span className="rc-badge" title={`Remote Control conectado · https://claude.ai/code/${s.bridgeSessionId}`}>
                  RC
                </span>
              )}
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
        <button
          className="tab-plus"
          title="Nova sessão do Claude neste projeto (Ctrl+T) · botão direito: shell"
          onClick={() => void openClaude(activeProject)}
          onContextMenu={(e) => {
            e.preventDefault()
            void openShell(activeProject)
          }}
        >
          +
        </button>
      </div>
      <div className="tab-actions">
        <label
          className="sel"
          title={
            'Troca o modelo da sessão aberta (manda /model) e fica lembrado para as próximas deste projeto.\n' +
            'O Claude pode avisar que a troca só vale na próxima sessão, e grava como padrão global no settings.json.'
          }
        >
          <span>modelo</span>
          <select value={ov.model ?? ''} onChange={(e) => setOv({ model: e.target.value })}>
            {MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value ? o.label : label(MODEL_OPTIONS, '', config.model)}
              </option>
            ))}
          </select>
        </label>
        <label
          className="sel"
          title="Troca o effort da sessão aberta (manda /effort) e fica lembrado para as próximas deste projeto."
        >
          <span>effort</span>
          <select value={ov.effort ?? ''} onChange={(e) => setOv({ effort: e.target.value })}>
            {EFFORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value ? o.label : label(EFFORT_OPTIONS, '', config.effort)}
              </option>
            ))}
          </select>
        </label>
        {active && active.kind === 'claude' && active.exited == null && !active.suspended && (
          <button
            className="btn ghost sm"
            title={
              'Sugere a resposta provável para a última mensagem do Claude (Ctrl+Espaço).\n' +
              'Ela aparece numa faixa acima do terminal: Tab escreve na caixa do Claude, sem enviar.\n' +
              'Roda um claude -p com Haiku, então consome um pouquinho da cota.'
            }
            onClick={() => requestSuggest(active.id)}
          >
            ✨ sugerir
          </button>
        )}
        {active && active.kind === 'claude' && active.exited == null && (
          <button
            className={`btn ghost rc-btn ${rcActive ? 'on' : ''}`}
            title={
              rcActive
                ? `Remote Control CONECTADO — clique: QR code / desconectar (/rc) · botão direito: abrir no claude.ai\n${rcUrl}`
                : 'Remote Control desconectado — clique para abrir o /rc na sessão'
            }
            onClick={() => toggleRc(active.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              if (rcUrl) void window.api.app.openExternal(rcUrl)
            }}
          >
            <span className={`dot ${rcActive ? 'idle' : 'none'}`} /> {rcActive ? 'RC conectado' : 'RC desconectado'}
          </button>
        )}
        {active && (active.suspended || active.exited != null) && (
          <button
            className="btn sm"
            title={
              active.sessionId
                ? `Dar processo a esta aba de novo (claude --resume ${active.sessionId})`
                : 'Abrir uma sessão nova nesta aba'
            }
            onClick={() => void resumeTab(active.id)}
          >
            ↻ retomar
          </button>
        )}
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
