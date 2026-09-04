import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import type { ImageThumb, TermTab } from '@shared/types'
import type { TermColors } from '@shared/themes'
import { registerSearch, registerTerm, setImagens, unregisterSearch, unregisterTerm } from '@/lib/terminals'
import { acharImagens } from '@/lib/imagePaths'
import { useStore } from '@/store'

/** Tamanho da miniatura, em células do terminal (decoration não empurra texto: é sobreposição). */
const MINI_COLS = 13
const MINI_ROWS = 6
/** Quantas linhas fora da tela a varredura olha, para a miniatura já estar pronta ao rolar. */
const MARGEM = 150
/** Throttle da varredura: o TUI redesenha muito, não adianta varrer a cada escrita. */
const ESPERA = 400

/** Uma pergunta por caminho: o `null` (não existe / não é imagem) também fica guardado. */
const cacheThumb = new Map<string, ImageThumb | null>()

async function miniatura(path: string, cwd: string): Promise<ImageThumb | null> {
  const chave = `${cwd}|${path}`
  const guardado = cacheThumb.get(chave)
  if (guardado !== undefined) return guardado
  const r = await window.api.images.thumb(path, cwd).catch(() => null)
  if (cacheThumb.size > 400) cacheThumb.clear()
  cacheThumb.set(chave, r)
  return r
}

function tamanho(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface Props {
  tab: TermTab
  visible: boolean
  colors: TermColors
  fontSize: number
  fontFamily: string
  /** Ctrl+roda do mouse: +1 / -1 no tamanho da fonte deste projeto */
  onZoom: (delta: number) => void
  /** miniatura em cima dos caminhos de imagem que o Claude escreve */
  inlineImages: boolean
}

export default function TerminalView({
  tab,
  visible,
  colors,
  fontSize,
  fontFamily,
  onZoom,
  inlineImages
}: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<{ index: number; count: number } | null>(null)
  // mostra o tamanho enquanto você dá Ctrl+roda, e some sozinho
  const [zoomBadge, setZoomBadge] = useState(false)
  const onZoomRef = useRef(onZoom)
  onZoomRef.current = onZoom

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

    /** Shift+Enter (e Alt+Enter): quebra de linha, não "enviar". */
    const quebraLinha = (ev: KeyboardEvent): boolean => ev.key === 'Enter' && (ev.shiftKey || ev.altKey) && !ev.ctrlKey

    term.attachCustomKeyEventHandler((ev) => {
      // o `keypress` é quem manda o caractere: sem barrar aqui também, o xterm mandaria o CR
      // logo depois da quebra de linha (= o Claude enviaria o prompt)
      if (ev.type !== 'keydown') return !quebraLinha(ev)
      const key = ev.key.toLowerCase()
      /**
       * Devolver `false` só faz o xterm ignorar o **keydown**: o caractere ainda chega pelo
       * `keypress` seguinte. Sem o `preventDefault` aqui, o Shift+Espaço mandava a quebra de
       * linha *e* o espaço logo depois.
       */
      const meu = (): false => {
        ev.preventDefault()
        return false
      }
      if (ev.ctrlKey && ev.shiftKey && key === 'c') {
        const sel = term.getSelection()
        if (sel) void window.api.app.copy(sel)
        return meu()
      }
      if (ev.ctrlKey && !ev.shiftKey && key === 'c' && term.hasSelection()) {
        void window.api.app.copy(term.getSelection())
        term.clearSelection()
        return meu()
      }
      if (ev.ctrlKey && key === 'v') {
        pasteFromClipboard()
        return meu()
      }
      // Ctrl+Shift+L: limpa e manda o TUI se redesenhar. Serve quando algo de fora escreve
      // por cima da tela (outro processo herdando o console, saída perdida de um comando…).
      if (ev.ctrlKey && ev.shiftKey && key === 'l') {
        term.clear()
        term.reset()
        const { cols, rows } = term
        window.api.pty.resize(tab.id, Math.max(2, cols - 1), rows)
        setTimeout(() => window.api.pty.resize(tab.id, cols, rows), 80)
        return meu()
      }
      // O xterm mandaria só CR (= enviar); o Claude Code entende ESC+CR, que é o que o
      // /terminal-setup configura no VS Code. Medido num PTY com o claude.exe de verdade.
      if (quebraLinha(ev)) {
        window.api.pty.write(tab.id, '\x1b\r')
        return meu()
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
          key === 'k' ||
          key === ' ' ||
          /^[0-9]$/.test(key))
      )
        return false
      return true
    })

    // Ctrl + roda do mouse = zoom só deste terminal (o xterm usaria a roda para rolar,
    // por isso o listener é em captura e barra o evento antes dele).
    let badgeTimer: ReturnType<typeof setTimeout> | null = null
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      onZoomRef.current(e.deltaY > 0 ? -1 : 1)
      setZoomBadge(true)
      if (badgeTimer) clearTimeout(badgeTimer)
      badgeTimer = setTimeout(() => setZoomBadge(false), 1200)
    }
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })

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
      el.removeEventListener('wheel', onWheel, { capture: true })
      if (badgeTimer) clearTimeout(badgeTimer)
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

  /**
   * Miniatura clicável em cima do caminho de imagem que o Claude escreve no terminal.
   *
   * O Claude Code não emite Sixel/iTerm2/Kitty: o que chega no PTY é texto, não há imagem para o
   * xterm renderizar (por isso o @xterm/addon-image não resolveria). A varredura acha o caminho
   * no buffer e desenha um cartão por cima da linha onde ele termina.
   *
   * **Por que não usa `registerDecoration`:** o TUI do Claude roda no **buffer alternativo**
   * (medido: `buffer.active.type === 'alternate'`), e o xterm força `display:none` em toda
   * decoration enquanto o buffer alternativo está ativo. O marker e a decoration até nasciam —
   * nasciam invisíveis. Então a camada é nossa, um `<div>` absoluto dentro do `.xterm-screen`,
   * posicionado na mão a partir do tamanho da célula.
   *
   * A célula sai de `.xterm-screen`: `clientWidth / cols` e `clientHeight / rows` batem exatamente
   * com o que a própria decoration do xterm usa (conferido: 8,25 × 18 px).
   *
   * O cartão é **opaco** e fica encostado na margem direita: nada empurra o texto do terminal,
   * então ele cobre o que estiver embaixo, e à direita é onde quase sempre sobra espaço.
   */
  useEffect(() => {
    const term = termRef.current
    const host = ref.current
    if (!term || !host) return
    if (!inlineImages) {
      setImagens(tab.id, [])
      return
    }
    const cwd = tab.projectPath
    // DIAGNÓSTICO TEMPORÁRIO → %APPDATA%/claude-dynasty/miniaturas.log
    const diag = (txt: string): void => window.api.images.log(`[${tab.id.slice(0, 4)}] ${txt}`)

    interface Cartao {
      el: HTMLDivElement
      /** linha absoluta no buffer onde o caminho termina */
      linha: number
      /** caminho já resolvido pelo main (é o que o lightbox abre) */
      real: string
    }
    /** chaveado pelo caminho cru do terminal; a última ocorrência na tela é a que vale */
    const cartoes = new Map<string, Cartao>()
    let camada: HTMLDivElement | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let rodando = false
    let morto = false
    let ultimoDiag = 0

    const tela = (): HTMLElement | null =>
      (term.element?.querySelector('.xterm-screen') as HTMLElement | null) ?? null

    /** Tamanho da célula em px. null quando a aba está escondida (largura zero). */
    const celula = (): { w: number; h: number } | null => {
      const t = tela()
      if (!t || !term.cols || !term.rows) return null
      const w = t.clientWidth / term.cols
      const h = t.clientHeight / term.rows
      return w > 0 && h > 0 ? { w, h } : null
    }

    const pegarCamada = (): HTMLDivElement | null => {
      const t = tela()
      if (!t) return null
      if (!camada || !camada.isConnected) {
        camada = document.createElement('div')
        camada.className = 'term-img-camada'
        t.appendChild(camada)
      }
      return camada
    }

    const posicionar = (): void => {
      const cel = celula()
      if (!cel) return
      const vy = term.buffer.active.viewportY
      for (const c of cartoes.values()) {
        const y = c.linha - vy
        if (y < 0 || y >= term.rows) {
          c.el.style.display = 'none'
          continue
        }
        c.el.style.display = 'block'
        c.el.style.top = `${Math.round(y * cel.h)}px`
        c.el.style.right = `${Math.round(cel.w)}px`
        c.el.style.width = `${Math.round(MINI_COLS * cel.w)}px`
        c.el.style.height = `${Math.round(MINI_ROWS * cel.h)}px`
      }
    }

    const publicar = (): void =>
      setImagens(
        tab.id,
        [...cartoes.values()].sort((a, b) => a.linha - b.linha).map((c) => c.real)
      )

    const criar = (info: ImageThumb): HTMLDivElement => {
      const el = document.createElement('div')
      el.className = 'term-img'
      const dim = info.width ? ` · ${info.width}×${info.height}` : ''
      el.title = [info.path, `${tamanho(info.size)}${dim}`, 'clique para abrir'].join(String.fromCharCode(10))
      const img = document.createElement('img')
      img.src = info.thumb
      img.draggable = false
      el.appendChild(img)
      // sem isto o xterm começa a selecionar o texto que está por baixo do cartão
      el.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      el.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        useStore.getState().openLightbox(tab.id, info.path, cwd)
      })
      return el
    }

    const varrer = async (): Promise<void> => {
      if (morto || rodando || document.hidden) return
      rodando = true
      try {
        const buf = term.buffer.active
        const de = Math.max(0, buf.viewportY - MARGEM)
        const ate = Math.min(buf.length - 1, buf.viewportY + term.rows + MARGEM)
        const achados = acharImagens(term, de, ate)

        // caminho repetido na tela: vale a última ocorrência
        const desejado = new Map<string, number>()
        for (const a of achados) desejado.set(a.path, a.linha)

        if (achados.length || Date.now() - ultimoDiag > 20000) {
          ultimoDiag = Date.now()
          diag(
            `varrer tipo=${buf.type} viewportY=${buf.viewportY} rows=${term.rows} ` +
              `achados=${achados.length} cartoes=${cartoes.size} celula=${JSON.stringify(celula())}`
          )
          for (const a of achados) {
            diag(`  achado linha=${a.linha} path=[${a.path}]`)
            // linhas cruas em volta: é onde se vê por que a remontagem colou ou não
            for (let y = Math.max(0, a.linha - 2); y <= a.linha; y++) {
              const t = term.buffer.active.getLine(y)?.translateToString(true) ?? ''
              diag(`    L${y}=<<${t.slice(0, 220)}>>`)
            }
          }
        }

        for (const [path, c] of cartoes) {
          if (desejado.has(path)) continue
          c.el.remove()
          cartoes.delete(path)
        }

        for (const [path, linha] of desejado) {
          if (morto) break
          const existente = cartoes.get(path)
          if (existente) {
            existente.linha = linha
            continue
          }
          if (cacheThumb.get(`${cwd}|${path}`) === null) continue // já perguntamos: não existe
          const info = await miniatura(path, cwd)
          if (!info || morto || cartoes.has(path)) continue
          const cam = pegarCamada()
          if (!cam) continue
          const el = criar(info)
          cam.appendChild(el)
          cartoes.set(path, { el, linha, real: info.path })
          diag(`  cartao criado linha=${linha} ${info.width}x${info.height} ${info.path}`)
        }

        posicionar()
        publicar()
      } finally {
        rodando = false
      }
    }

    // Throttle, não debounce: `onWriteParsed` dispara a cada escrita e o TUI do Claude escreve
    // em rajada, então um debounce ficaria se reiniciando e a varredura nunca rodaria.
    const agendar = (): void => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        void varrer()
      }, ESPERA)
    }

    const off = [
      term.onWriteParsed(agendar),
      // rolar não muda o que existe, só onde desenhar: reposiciona na hora e revarre depois
      term.onScroll(() => {
        posicionar()
        agendar()
      }),
      term.onResize(() => {
        posicionar()
        agendar()
      })
    ]
    document.addEventListener('visibilitychange', agendar)
    agendar()

    return () => {
      morto = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', agendar)
      for (const d of off) d.dispose()
      for (const c of cartoes.values()) c.el.remove()
      cartoes.clear()
      camada?.remove()
      camada = null
      setImagens(tab.id, [])
    }
  }, [tab.id, tab.projectPath, inlineImages])

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
      {zoomBadge && <div className="term-zoom">{fontSize} px</div>}
      <div className="term-host" ref={ref} />
    </div>
  )
}
