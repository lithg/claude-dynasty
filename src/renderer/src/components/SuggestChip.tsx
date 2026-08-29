import { useEffect, useRef, useState } from 'react'
import type { TermTab } from '@shared/types'
import { getTerm } from '@/lib/terminals'
import { registerSuggest, unregisterSuggest } from '@/lib/promptBus'

/**
 * Sugestão de resposta (o "prompt pré-preenchido" do Warp), agora sem caixa própria: a única
 * caixa de digitação é a do próprio Claude, dentro do terminal.
 *
 * A sugestão vem sozinha quando a sessão volta a ficar ociosa (config `autoSuggest`) ou pelo
 * botão ✨ / Ctrl+Espaço, e aparece como uma faixa fina acima do terminal. **Tab** (ou o clique)
 * escreve o texto na caixa do Claude como colagem — dá para editar e nada é enviado até você
 * apertar Enter. **Esc** descarta.
 */
export default function SuggestChip({ tab }: { tab: TermTab }): React.JSX.Element | null {
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [erro, setErro] = useState('')

  const pedir = (auto = false): void => {
    if (pensando || tab.kind !== 'claude' || !tab.sessionId) return
    // automática não atropela uma sugestão que ainda está na tela
    if (auto && texto) return
    setPensando(true)
    setErro('')
    void window.api.app
      .suggestReply(tab.projectPath, tab.sessionId)
      .then((r) => {
        if (r.text) setTexto(r.text.trim())
        else setErro(r.error ?? 'não deu para sugerir')
      })
      .finally(() => setPensando(false))
  }

  const pedirRef = useRef(pedir)
  pedirRef.current = pedir
  useEffect(() => {
    registerSuggest(tab.id, (auto) => pedirRef.current(auto))
    return () => unregisterSuggest(tab.id)
  }, [tab.id])

  // o erro some sozinho: é aviso, não estado
  useEffect(() => {
    if (!erro) return
    const t = setTimeout(() => setErro(''), 5000)
    return () => clearTimeout(t)
  }, [erro])

  const aceitar = (): void => {
    if (!texto) return
    const term = getTerm(tab.id)
    // paste = bracketed paste: entra na caixa do Claude como texto, sem enviar
    term?.paste(texto)
    term?.focus()
    setTexto('')
  }

  // Tab aceita, Esc descarta — só enquanto a sugestão está na tela (senão são teclas do Claude).
  // Em captura, para chegar antes do xterm; Shift+Tab continua indo para o Claude (troca de modo).
  useEffect(() => {
    if (!texto) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        aceitar()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setTexto('')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  if (!texto && !pensando && !erro) return null

  return (
    <div className="suggest-bar">
      <span className="suggest-icon">✨</span>
      {pensando ? (
        <span className="muted small">pensando numa resposta…</span>
      ) : erro ? (
        <span className="small danger-fg">{erro}</span>
      ) : (
        <>
          <button
            className="suggest-texto"
            title={`${texto}\n\nTab (ou clique) escreve isso na caixa do Claude — dá para editar, nada é enviado.`}
            onClick={aceitar}
          >
            {texto.replace(/\s+/g, ' ')}
          </button>
          <span className="muted small nowrap">Tab escreve · Esc descarta</span>
          <button className="icon-btn" title="Descartar a sugestão (Esc)" onClick={() => setTexto('')}>
            ×
          </button>
        </>
      )}
    </div>
  )
}
