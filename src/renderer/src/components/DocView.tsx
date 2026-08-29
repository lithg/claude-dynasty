import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import { render, toggleTask } from '@/lib/markdown'

/**
 * Documento aberto: visualização formatada por padrão, edição no texto puro.
 * Salva sozinho (a store adia a gravação) e as caixinhas podem ser marcadas na visualização.
 */
export default function DocView(): React.JSX.Element | null {
  const activeDoc = useStore((s) => s.activeDoc)
  const docs = useStore((s) => s.docs)
  const text = useStore((s) => s.docText)
  const saving = useStore((s) => s.docSaving)
  const setDocText = useStore((s) => s.setDocText)
  const openDoc = useStore((s) => s.openDoc)
  const [editando, setEditando] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const doc = docs.find((d) => d.path === activeDoc)

  const html = useMemo(() => render(text), [text])

  useEffect(() => setEditando(false), [activeDoc])
  useEffect(() => {
    if (editando) ref.current?.focus()
  }, [editando])

  if (!activeDoc) return null

  const onClickPreview = (e: React.MouseEvent<HTMLDivElement>): void => {
    const alvo = e.target as HTMLElement
    if (alvo instanceof HTMLInputElement && alvo.type === 'checkbox') {
      const i = Number(alvo.dataset.task)
      if (!Number.isNaN(i)) setDocText(toggleTask(text, i), true)
      return
    }
    const link = alvo.closest('a')
    if (link) {
      const href = link.getAttribute('href') ?? ''
      if (/^https?:/i.test(href)) {
        e.preventDefault()
        void window.api.app.openExternal(href)
      }
    }
  }

  return (
    <div className="docview">
      <div className="doc-head">
        <div className="doc-title">
          <span className="doc-icon">▤</span>
          <span>{doc?.title ?? ''}</span>
          <span className="muted small">{doc?.name}</span>
        </div>
        <div className="row gap">
          <span className="muted small">{saving ? 'salvando…' : 'salvo'}</span>
          <button
            className={`btn ghost sm ${editando ? 'on' : ''}`}
            title="Alterna entre o texto em markdown e o resultado formatado"
            onClick={() => setEditando((v) => !v)}
          >
            {editando ? 'ver' : 'editar'}
          </button>
          <button className="btn ghost sm" title="Fechar o documento e voltar para o terminal" onClick={() => void openDoc(null)}>
            fechar
          </button>
        </div>
      </div>

      {editando ? (
        <textarea
          ref={ref}
          className="doc-editor"
          spellCheck={false}
          value={text}
          onChange={(e) => setDocText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault()
              const el = e.currentTarget
              const i = el.selectionStart
              const novo = text.slice(0, i) + '  ' + text.slice(el.selectionEnd)
              setDocText(novo)
              requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = i + 2
              })
            }
          }}
        />
      ) : (
        <div className="doc-body markdown" onClick={onClickPreview} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  )
}
