import { useEffect, useState } from 'react'
import { useStore } from '@/store'

/**
 * Primeira vez que o app abre nesta máquina: pergunta onde ficam os projetos e oferece
 * criar os atalhos. Só aparece enquanto não existe `config.json`.
 */
export default function WelcomeModal(): React.JSX.Element | null {
  const firstRun = useStore((s) => s.firstRun)
  const setFirstRun = useStore((s) => s.setFirstRun)
  const config = useStore((s) => s.config)
  const saveConfig = useStore((s) => s.saveConfig)
  const loadProjects = useStore((s) => s.loadProjects)
  const [dir, setDir] = useState('')
  const [shortcuts, setShortcuts] = useState(true)
  const [bin, setBin] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  useEffect(() => {
    if (!firstRun) return
    setDir(config?.rootDir ?? '')
    void window.api.app.claudeBin().then((b) => setBin(b.file))
  }, [firstRun, config?.rootDir])

  if (!firstRun) return null
  const semClaude = /cmd\.exe$/i.test(bin)

  const escolher = async (): Promise<void> => {
    const p = await window.api.app.pickFolder(dir)
    if (p) setDir(p)
  }

  const comecar = async (): Promise<void> => {
    setBusy(true)
    await saveConfig({ rootDir: dir })
    if (shortcuts) {
      const r = await window.api.app.createShortcuts()
      setDone(r.error ? `atalhos: ${r.error}` : '')
    }
    await loadProjects()
    setBusy(false)
    setFirstRun(false)
  }

  return (
    <div className="modal-back">
      <div className="modal welcome" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Bem-vindo ao Claude Wrapper</span>
        </div>
        <div className="modal-body">
          <p>
            Este painel lista as pastas de projeto de um diretório e abre uma sessão do{' '}
            <code>claude</code> dentro de cada uma com um clique. Só falta dizer onde ficam os seus
            projetos — <b>cada subpasta vira um projeto na barra da esquerda</b>.
          </p>
          <div className="row gap">
            <input
              value={dir}
              placeholder="ex.: C:\Users\voce\Documents\GitHub"
              onChange={(e) => setDir(e.target.value)}
            />
            <button className="btn ghost" onClick={() => void escolher()}>
              escolher…
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={shortcuts} onChange={(e) => setShortcuts(e.target.checked)} />
            criar atalhos no Menu Iniciar e na área de trabalho
          </label>
          {semClaude && (
            <p className="danger-fg small">
              Não encontrei o <code>claude.exe</code> nos lugares de sempre. O wrapper vai tentar pelo{' '}
              <code>cmd</code>; se as sessões não abrirem, instale o Claude Code (
              <code>npm i -g @anthropic-ai/claude-code</code>), rode <code>claude</code> uma vez para
              entrar na conta, e aponte o caminho em Configurações.
            </p>
          )}
          <p className="muted small">
            Dá para mudar tudo isso depois em Configurações (Ctrl+,). Nada aqui é enviado para
            lugar nenhum: o app só lê as suas pastas e os arquivos que o Claude Code já grava em{' '}
            <code>~/.claude</code>.
          </p>
          {done && <p className="danger-fg small">{done}</p>}
        </div>
        <div className="modal-foot">
          <span className="muted small">{bin}</span>
          <button className="btn" disabled={!dir.trim() || busy} onClick={() => void comecar()}>
            {busy ? 'preparando…' : 'começar'}
          </button>
        </div>
      </div>
    </div>
  )
}
