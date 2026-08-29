import { useEffect, useState } from 'react'
import type { AppConfig } from '@shared/types'
import { useStore } from '@/store'
import { EFFORT_OPTIONS, MODEL_OPTIONS } from '@shared/options'
import { THEMES } from '@shared/themes'

export default function SettingsModal(): React.JSX.Element | null {
  const open = useStore((s) => s.settingsOpen)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const config = useStore((s) => s.config)
  const saveConfig = useStore((s) => s.saveConfig)
  const [draft, setDraft] = useState<AppConfig | null>(null)
  const [bin, setBin] = useState('')
  const [cfgPath, setCfgPath] = useState('')

  useEffect(() => {
    if (open && config) {
      setDraft({ ...config })
      void window.api.app.claudeBin().then((b) => setBin(b.args.length ? `${b.file} ${b.args.join(' ')}` : b.file))
      void window.api.config.path().then(setCfgPath)
    }
  }, [open, config])

  if (!open || !draft) return null
  const set = (patch: Partial<AppConfig>): void => setDraft({ ...draft, ...patch })

  const save = async (): Promise<void> => {
    const { windowBounds: _wb, ...rest } = draft
    await saveConfig(rest)
    setOpen(false)
  }

  return (
    <div className="modal-back" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Configurações</span>
          <button className="icon-btn" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <div className="modal-body kv form">
          <span>pasta raiz</span>
          <input value={draft.rootDir} onChange={(e) => set({ rootDir: e.target.value })} />

          <span>permissões</span>
          <label className="check">
            <input type="checkbox" checked={draft.skipPermissions} onChange={(e) => set({ skipPermissions: e.target.checked })} />
            usar <code>--dangerously-skip-permissions</code> por padrão
          </label>

          <span>ao clicar</span>
          <label className="check">
            <input type="checkbox" checked={draft.autoOpenClaude} onChange={(e) => set({ autoOpenClaude: e.target.checked })} />
            abrir o Claude automaticamente se o projeto não tiver aba
          </label>

          <span>notificar</span>
          <label className="check">
            <input type="checkbox" checked={draft.notifyOnIdle} onChange={(e) => set({ notifyOnIdle: e.target.checked })} />
            notificação do Windows quando uma sessão termina e a janela não está em foco
          </label>
          <span></span>
          <label className="check">
            <input type="checkbox" checked={draft.notifyExternal} onChange={(e) => set({ notifyExternal: e.target.checked })} />
            incluir sessões abertas fora do wrapper (terminal, Warp…)
          </label>

          <span>remote control</span>
          <label className="check">
            <input type="checkbox" checked={draft.remoteControl} onChange={(e) => set({ remoteControl: e.target.checked })} />
            abrir toda sessão nova com <code>--remote-control</code> (controle pelo celular / claude.ai/code)
          </label>

          <span>abas</span>
          <label className="check">
            <input type="checkbox" checked={draft.restoreTabs} onChange={(e) => set({ restoreTabs: e.target.checked })} />
            reabrir as abas da última execução (suspensas, retomadas com <code>--resume</code>)
          </label>
          <span></span>
          <label className="check">
            <input type="checkbox" checked={draft.promptBox} onChange={(e) => set({ promptBox: e.target.checked })} />
            caixa de prompt multi-linha embaixo do terminal (Ctrl+Enter envia)
          </label>

          <span>windows</span>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.startWithWindows}
              onChange={(e) => set({ startWithWindows: e.target.checked })}
            />
            iniciar junto com o Windows, escondido na bandeja
          </label>

          <span>bandeja</span>
          <label className="check">
            <input type="checkbox" checked={draft.closeToTray} onChange={(e) => set({ closeToTray: e.target.checked })} />
            fechar a janela esconde na bandeja (sair de verdade pelo menu do ícone)
          </label>

          <span>modelo</span>
          <select value={draft.model} onChange={(e) => set({ model: e.target.value })}>
            {MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value ? o.label : 'padrão do Claude (settings.json)'}
              </option>
            ))}
          </select>

          <span>effort</span>
          <select value={draft.effort} onChange={(e) => set({ effort: e.target.value })}>
            {EFFORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value ? o.label : 'padrão do Claude (settings.json)'}
              </option>
            ))}
          </select>

          <span>args extras</span>
          <input placeholder="passados em toda sessão" value={draft.extraArgs} onChange={(e) => set({ extraArgs: e.target.value })} />

          <span>shell</span>
          <input value={draft.shell} onChange={(e) => set({ shell: e.target.value })} />

          <span>claude.exe</span>
          <div>
            <input placeholder={bin} value={draft.claudeBin} onChange={(e) => set({ claudeBin: e.target.value })} />
            <div className="muted small">detectado: {bin}</div>
          </div>

          <span>tema</span>
          <select value={draft.theme} onChange={(e) => set({ theme: e.target.value })}>
            <option value="system">sistema (escuro/claro automático)</option>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <span>fonte</span>
          <div className="row gap">
            <input type="number" min={9} max={24} style={{ width: 70 }} value={draft.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
            <input value={draft.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} />
          </div>

          <span>ocultos</span>
          <div className="row wrap">
            {draft.hidden.length === 0 && <span className="muted small">nenhum</span>}
            {draft.hidden.map((n) => (
              <button key={n} className="chip btn-chip" title="mostrar de novo" onClick={() => set({ hidden: draft.hidden.filter((x) => x !== n) })}>
                {n} ×
              </button>
            ))}
          </div>

          <span>fixados</span>
          <input
            value={draft.pinned.join(', ')}
            onChange={(e) => set({ pinned: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          />
        </div>
        <div className="modal-foot">
          <span className="muted small">{cfgPath}</span>
          <div className="row gap">
            <button className="btn ghost" onClick={() => setOpen(false)}>
              cancelar
            </button>
            <button className="btn" onClick={() => void save()}>
              salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
