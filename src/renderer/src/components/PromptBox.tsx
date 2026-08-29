import { useEffect, useRef, useState } from 'react'
import type { TermTab } from '@shared/types'
import { useStore } from '@/store'
import { getTerm } from '@/lib/terminals'
import { registerSuggest, unregisterSuggest } from '@/lib/promptBus'

const HISTORY_KEY = 'wrapper-prompt-history'
const HISTORY_MAX = 100

function loadHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Caixa de prompt multi-linha (o que mais faz falta vindo do Warp): escreve à vontade,
 * Ctrl+Enter manda para a sessão como bracketed paste + Enter.
 */
export default function PromptBox({ tab }: { tab: TermTab }): React.JSX.Element {
  const saveConfig = useStore((s) => s.saveConfig)
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [error, setError] = useState('')
  // sugestão ainda não aceita: aparece só como placeholder apagado, Tab transforma em texto
  const [ghost, setGhost] = useState('')
  const [history, setHistory] = useState<string[]>(loadHistory)
  // -1 = escrevendo algo novo; 0+ = navegando no histórico (0 é o mais recente)
  const [cursor, setCursor] = useState(-1)

  /**
   * Sugere a resposta provável à última fala do Claude. Vem sozinha quando a sessão volta a
   * ficar ociosa (config `autoSuggest`) ou pelo botão ✨, e entra só como placeholder apagado:
   * **Tab** vira texto de verdade, Esc descarta, nada é enviado. Por trás é um `claude -p`
   * com Haiku, então nunca atropela o que você já escreveu.
   */
  const suggest = (auto = false): void => {
    if (suggesting || tab.kind !== 'claude' || !tab.sessionId) return
    if (auto && (value || ghost)) return
    setSuggesting(true)
    setError('')
    void window.api.app
      .suggestReply(tab.projectPath, tab.sessionId)
      .then((r) => {
        if (r.text) {
          setGhost(r.text)
          requestAnimationFrame(() => ref.current?.focus())
        } else {
          setError(r.error ?? 'não deu para sugerir')
        }
      })
      .finally(() => setSuggesting(false))
  }

  const acceptGhost = (): void => {
    setValue(ghost)
    setGhost('')
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.selectionStart = el.selectionEnd = el.value.length
    })
  }

  const suggestRef = useRef(suggest)
  suggestRef.current = suggest
  useEffect(() => {
    registerSuggest(tab.id, (auto) => suggestRef.current(auto))
    return () => unregisterSuggest(tab.id)
  }, [tab.id])

  // altura acompanha o conteúdo (ou a sugestão em placeholder), até 40% da janela
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const max = Math.round(window.innerHeight * 0.4)
    el.style.height = 'auto'
    let h = el.scrollHeight
    if (!value && ghost) {
      // scrollHeight ignora o placeholder: mede com o texto da sugestão dentro
      el.value = ghost
      h = el.scrollHeight
      el.value = ''
    }
    el.style.height = `${Math.min(h, max)}px`
  }, [value, ghost])

  const pushHistory = (text: string): void => {
    const next = [text, ...history.filter((h) => h !== text)].slice(0, HISTORY_MAX)
    setHistory(next)
    setCursor(-1)
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    } catch {
      /* localStorage cheio: histórico é conveniência, não dado */
    }
  }

  const send = (): void => {
    const text = value.replace(/\r\n/g, '\n').replace(/\s+$/, '')
    if (!text || tab.exited != null) return
    // bracketed paste: o Claude recebe as quebras de linha como texto, sem enviar a cada Enter
    window.api.pty.write(tab.id, `\x1b[200~${text}\x1b[201~`)
    setTimeout(() => window.api.pty.write(tab.id, '\r'), 90)
    pushHistory(text)
    setValue('')
  }

  const insert = (text: string): void => {
    const el = ref.current
    if (!el) {
      setValue((v) => v + text)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = value.slice(0, start) + text + value.slice(end)
    setValue(next)
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + text.length
    })
  }

  const navigate = (dir: -1 | 1): boolean => {
    if (!history.length) return false
    const next = cursor + (dir === -1 ? 1 : -1)
    if (next < -1 || next >= history.length) return false
    setCursor(next)
    setValue(next === -1 ? '' : history[next])
    return true
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      send()
      return
    }
    // sugestão pendente: Tab transforma o placeholder em texto editável
    if (ghost && !value) {
      if (e.key === 'Tab') {
        e.preventDefault()
        acceptGhost()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setGhost('')
        return
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      getTerm(tab.id)?.focus()
      return
    }
    if (e.key === ' ' && e.shiftKey && !e.ctrlKey) {
      e.preventDefault()
      insert('\n')
      return
    }
    if (e.key === ' ' && e.ctrlKey) {
      e.preventDefault()
      suggest()
      return
    }
    // histórico: só quando o cursor está na ponta do texto (senão é navegação normal)
    if (e.key === 'ArrowUp' && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (navigate(-1)) e.preventDefault()
    } else if (e.key === 'ArrowDown' && el.selectionStart === value.length && el.selectionEnd === value.length) {
      if (cursor > -1 && navigate(1)) e.preventDefault()
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const hasImage = Array.from(e.clipboardData.items).some((i) => i.type.startsWith('image/'))
    if (!hasImage) return
    e.preventDefault()
    void window.api.app.saveClipboardImage().then((file) => {
      if (file) insert(file + ' ')
    })
  }

  const onDrop = (e: React.DragEvent<HTMLTextAreaElement>): void => {
    const files = Array.from(e.dataTransfer.files ?? [])
    if (!files.length) return
    e.preventDefault()
    const paths = files.map((f) => {
      const p = window.api.app.pathForFile(f)
      return /\s/.test(p) ? `"${p}"` : p
    })
    insert(paths.join(' ') + ' ')
  }

  const lines = value ? value.split('\n').length : 0

  return (
    <div className="promptbox">
      <textarea
        ref={ref}
        rows={2}
        spellCheck={false}
        className={ghost && !value ? 'ghost' : undefined}
        placeholder={
          ghost && !value
            ? ghost
            : tab.kind === 'claude'
              ? 'Prompt para o Claude — Enter/Shift+Espaço quebram linha, Ctrl+Enter envia, Esc volta ao terminal'
              : 'Comando — Ctrl+Enter executa'
        }
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      />
      <div className="promptbox-foot">
        <span className={error ? 'small danger-fg' : 'muted small'}>
          {error
            ? error
            : ghost && !value
              ? 'sugestão pronta: Tab escreve na caixa · Esc descarta · nada é enviado'
              : `${lines > 1 ? `${lines} linhas · ` : ''}Ctrl+Enter envia · ↑ histórico · Ctrl+V cola imagem · Ctrl+I foca aqui`}
        </span>
        <div className="row gap">
          {tab.kind === 'claude' && tab.sessionId && (
            <button
              className="btn ghost sm"
              disabled={suggesting}
              title="Pede de novo a sugestão de resposta para a última mensagem do Claude — roda um claude -p com Haiku, então consome um pouquinho da cota."
              onClick={() => suggest()}
            >
              {suggesting ? 'pensando…' : '✨ sugerir'}
            </button>
          )}
          <button
            className="btn ghost sm"
            title="Esconder a caixa de prompt (volta em Configurações, Ctrl+,)"
            onClick={() => void saveConfig({ promptBox: false })}
          >
            esconder
          </button>
          <button className="btn sm" disabled={!value.trim() || tab.exited != null} onClick={send}>
            enviar
          </button>
        </div>
      </div>
    </div>
  )
}
