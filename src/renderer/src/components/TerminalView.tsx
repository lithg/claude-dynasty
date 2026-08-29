import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import type { TermTab } from '@shared/types'
import type { TermColors } from '@shared/themes'
import { registerSearch, registerTerm, unregisterSearch, unregisterTerm } from '@/lib/terminals'

interface Props {
  tab: TermTab
  visible: boolean
  colors: TermColors
  fontSize: number
  fontFamily: string
}

export default function TerminalView({ tab, visible, colors, fontSize, fontFamily }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<{ index: number; count: number } | null>(null)

  const searchOpts = useCallback(
    () => ({
      // matchBackground/activeMatchBackground precisam ser #RRGGBB (não aceitam rgba)
      decorations: {
        matchBackground: colors.brightBlack,
        matchOverviewRuler: colors.brightBlack,
        activeMatchBackground: colors.blue,
        activeMatchColorOverviewRuler: colors.yellow
      }
    }),
    [colors]
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize,
      fontFamily,
      lineHeight: 1.15,
      scrollback: 8000,
      allowProposedApi: true,
      theme: colors,
      windowsPty: { backend: 'conpty', buildNumber: 26200 }
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.loadAddon(new WebLinksAddon((_e, uri) => void window.api.app.openExternal(uri)))
    term.open(el)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      /* fica no renderer DOM/canvas */
    }
    search.onDidChangeResults((r) => setHits(r ? { index: r.resultIndex + 1, count: r.resultCount } : null))

    term.onData((d) => window.api.pty.write(tab.id, d))
    term.onResize(({ cols, rows }) => window.api.pty.resize(tab.id, cols, rows))

    const pasteFromClipboard = (): void => {
      void (async () => {
        // Imagem: o Claude Code não reage ao Ctrl+V vindo do PTY, mas anexa um caminho .png
        // colado como [Image #N] (mesmo truque do Warp). Salvamos e colamos o caminho.
        if (tab.kind === 'claude') {
          const file = await window.api.app.saveClipboardImage()
          if (file) {
            term.paste(file + ' ')
            return
          }
        }
        const text = await navigator.clipboard.readText().catch(() => '')
        if (text) term.paste(text)
      })()
    }

    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true
      const key = ev.key.toLowerCase()
      if (ev.ctrlKey && ev.shiftKey && key === 'c') {
        const sel = term.getSelection()
        if (sel) void window.api.app.copy(sel)
        return false
      }
      if (ev.ctrlKey && !ev.shiftKey && key === 'c' && term.hasSelection()) {
        void window.api.app.copy(term.getSelection())
        term.clearSelection()
        return false
      }
      if (ev.ctrlKey && key === 'v') {
        pasteFromClipboard()
        return false
      }
      // Shift+Enter / Alt+Enter = quebra de linha sem enviar. O xterm mandaria só CR (= enviar);
      // o Claude Code entende ESC+CR, que é o que o /terminal-setup configura em iTerm/VS Code.
      if (ev.key === 'Enter' && (ev.shiftKey || ev.altKey) && !ev.ctrlKey) {
        window.api.pty.write(tab.id, '\x1b\r')
        return false
      }
      // Atalhos globais do app — deixa o React tratar.
      if (
        ev.ctrlKey &&
        (key === 't' ||
          key === 'w' ||
          key === 'tab' ||
          key === ',' ||
          key === 'b' ||
          key === 'f' ||
          key === 'i' ||
          key === 'k' ||
          key === ' ' ||
          /^[0-9]$/.test(key))
      )
        return false
      return true
    })

    // Arrastar arquivos (imagens, etc.) → cola os caminhos no prompt.
    const onDragOver = (e: DragEvent): void => e.preventDefault()
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (!files.length) return
      const paths = files.map((f) => {
        const p = window.api.app.pathForFile(f)
        return /\s/.test(p) ? `"${p}"` : p
      })
      term.paste(paths.join(' ') + ' ')
      term.focus()
    }
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('drop', onDrop)

    termRef.current = term
    fitRef.current = fit
    searchRef.current = search
    registerTerm(tab.id, term)
    registerSearch(tab.id, () => setSearchOpen(true))

    let raf = 0
    const doFit = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
          try {
            fit.fit()
          } catch {
            /* ignore */
          }
        }
      })
    }
    const ro = new ResizeObserver(doFit)
    ro.observe(el)
    doFit()

    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('drop', onDrop)
      unregisterSearch(tab.id)
      unregisterTerm(tab.id)
      term.dispose()
      termRef.current = null
      fitRef.current = null
      searchRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = colors
  }, [colors])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = fontSize
    term.options.fontFamily = fontFamily
    requestAnimationFrame(() => fitRef.current?.fit())
  }, [fontSize, fontFamily])

  useEffect(() => {
    if (!visible) return
    const id = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* ignore */
      }
      if (!searchOpen) termRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  const find = (dir: 1 | -1): void => {
    const s = searchRef.current
    if (!s || !query) return
    if (dir === 1) s.findNext(query, searchOpts())
    else s.findPrevious(query, searchOpts())
  }

  const closeSearch = (): void => {
    searchRef.current?.clearDecorations()
    setSearchOpen(false)
    setHits(null)
    termRef.current?.focus()
  }

  return (
    <div className="term" style={{ display: visible ? 'block' : 'none' }}>
      {searchOpen && (
        <div className="term-search">
          <input
            ref={inputRef}
            placeholder="buscar no terminal…"
            value={query}
            onChange={(e) => {
              const v = e.target.value
              setQuery(v)
              if (v) searchRef.current?.findNext(v, { ...searchOpts(), incremental: true })
              else {
                searchRef.current?.clearDecorations()
                setHits(null)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                find(e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                closeSearch()
              }
            }}
          />
          <span className="muted small hits">{query ? (hits?.count ? `${hits.index}/${hits.count}` : '0') : ''}</span>
          <button className="icon-btn" title="anterior (Shift+Enter)" onClick={() => find(-1)}>
            ↑
          </button>
          <button className="icon-btn" title="próximo (Enter)" onClick={() => find(1)}>
            ↓
          </button>
          <button className="icon-btn" title="fechar (Esc)" onClick={closeSearch}>
            ×
          </button>
        </div>
      )}
      <div className="term-host" ref={ref} />
    </div>
  )
}
