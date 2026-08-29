import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import type { TermTab } from '@shared/types'
import type { TermColors } from '@shared/themes'
import { registerTerm, unregisterTerm } from '@/lib/terminals'

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
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((_e, uri) => void window.api.app.openExternal(uri)))
    term.open(el)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      /* fica no renderer DOM/canvas */
    }

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
      // Atalhos globais do app — deixa o React tratar.
      if (ev.ctrlKey && (key === 't' || key === 'w' || key === 'tab' || key === ',' || key === 'b')) return false
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
    registerTerm(tab.id, term)

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
      unregisterTerm(tab.id)
      term.dispose()
      termRef.current = null
      fitRef.current = null
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
      termRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [visible])

  return <div className="term" ref={ref} style={{ display: visible ? 'block' : 'none' }} />
}
