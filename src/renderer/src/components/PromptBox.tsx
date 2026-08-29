import { useState } from 'react'
import { getTerm } from '@/lib/terminals'

interface Props {
  tabId: string
}

/** Caixa para enviar prompt (multi-linha) ao Claude sem lutar com o TUI. */
export default function PromptBox({ tabId }: Props): React.JSX.Element {
  const [text, setText] = useState('')

  const send = (): void => {
    const t = text.trim()
    if (!t) return
    // bracketed paste: o Claude Code trata como colagem (quebras de linha não submetem)
    window.api.pty.write(tabId, `\x1b[200~${t}\x1b[201~`)
    setTimeout(() => window.api.pty.write(tabId, '\r'), 60)
    setText('')
    getTerm(tabId)?.focus()
  }

  return (
    <div className="promptbox">
      <textarea
        value={text}
        placeholder="Enviar prompt para esta sessão… (Enter envia, Shift+Enter quebra linha)"
        rows={text.includes('\n') ? Math.min(8, text.split('\n').length + 1) : 1}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
      />
      <button className="btn" onClick={send} disabled={!text.trim()}>
        enviar ↵
      </button>
    </div>
  )
}
