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
import { projectName, useStore } from '@/store'

/** Tamanho e limites do cartão flutuante, em px. */
const CARD_W = 340
const CARD_H = 240
const CARD_MIN = 120
/** Margem mínima entre o cartão e a borda do terminal. */
const BORDA = 8
/** Folga entre dois cartões empilhados. */
const GAP = 10

export interface Caixa {
  x: number
  y: number
  w: number
  h: number
}
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
   * Cartão flutuante com a imagem que o Claude escreve como caminho no terminal.
   *
   * O Claude Code não emite Sixel/iTerm2/Kitty: o que chega no PTY é texto, não há imagem para o
   * xterm renderizar. A varredura acha o caminho no buffer e abre um cartão sobre o terminal.
   *
   * **Por que não é ancorado na linha:** foi, e ficou ruim. Duas imagens em linhas vizinhas
   * empilhavam uma sobre a outra, o cartão caía sempre na margem direita do terminal — que é onde
   * o TUI desenha o painel de `/diff` — e em janela pequena ia parar embaixo da barra do prompt.
   * A área livre muda conforme o TUI, então quem escolhe o lugar é o usuário: o cartão é
   * **arrastável** (pela barra) e **redimensionável** (pelo canto), e a posição fica gravada em
   * `perProject[nome].imgCard`.
   *
   * **Por que não usa `registerDecoration`:** o TUI roda no **buffer alternativo** e o xterm força
   * `display:none` em toda decoration enquanto ele está ativo — nasciam invisíveis.
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

    interface Cartao {
      el: HTMLDivElement
      /** caminho cru do terminal (chaveia a varredura) */
      path: string
      /** caminho resolvido pelo main (é o que o lightbox abre) */
      real: string
      box: Caixa
      /** foi arrastado: não some sozinho quando o caminho sai da tela */
      fixado: boolean
    }
    const cartoes = new Map<string, Cartao>()
    /** fechados na mão: não voltam sozinhos nesta sessão */
    const fechados = new Set<string>()
    let camada: HTMLDivElement | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let rodando = false
    let morto = false

    const pegarCamada = (): HTMLDivElement => {
      if (!camada || !camada.isConnected) {
        camada = document.createElement('div')
        camada.className = 'term-card-camada'
        host.appendChild(camada)
      }
      return camada
    }

    /** Mantém o cartão inteiro dentro do terminal — é o que evitava ele sumir em janela pequena. */
    const prender = (b: Caixa): Caixa => {
      const W = host.clientWidth || CARD_W + 32
      const H = host.clientHeight || CARD_H + 32
      const w = Math.min(Math.max(CARD_MIN, b.w), Math.max(CARD_MIN, W - 2 * BORDA))
      const h = Math.min(Math.max(CARD_MIN, b.h), Math.max(CARD_MIN, H - 2 * BORDA))
      return {
        w,
        h,
        x: Math.min(Math.max(BORDA, b.x), Math.max(BORDA, W - w - BORDA)),
        y: Math.min(Math.max(BORDA, b.y), Math.max(BORDA, H - h - BORDA))
      }
    }

    const aplicar = (c: Cartao): void => {
      c.box = prender(c.box)
      c.el.style.left = `${c.box.x}px`
      c.el.style.top = `${c.box.y}px`
      c.el.style.width = `${c.box.w}px`
      c.el.style.height = `${c.box.h}px`
    }

    /** Onde nasce o próximo cartão: o último lugar que você escolheu, ou o canto inferior direito. */
    const berco = (): Caixa => {
      const salvo = useStore.getState().config?.perProject[projectName(cwd)]?.imgCard
      if (salvo) return { ...salvo }
      const W = host.clientWidth || 900
      const H = host.clientHeight || 600
      return { x: W - CARD_W - 24, y: H - CARD_H - 72, w: CARD_W, h: CARD_H }
    }

    /**
     * Lugar do k-ésimo cartão solto: empilha para cima a partir do berço e pula de coluna quando
     * não cabe mais. Já foi um deslocamento fixo de 28 px, e com cartão de 340×240 o segundo
     * nascia praticamente atrás do primeiro — parecia que só uma imagem tinha aparecido.
     */
    const vaga = (b: Caixa, k: number): Caixa => {
      const passoY = b.h + GAP
      const passoX = b.w + GAP
      const porColuna = Math.max(1, Math.floor((b.y + b.h - BORDA) / passoY))
      return { ...b, x: b.x - Math.floor(k / porColuna) * passoX, y: b.y - (k % porColuna) * passoY }
    }

    /** Recoloca os cartões que você não arrastou; os arrastados só são presos na borda. */
    const arrumar = (): void => {
      const b = berco()
      let k = 0
      for (const c of cartoes.values()) {
        if (c.fixado) aplicar(c)
        else {
          c.box = vaga(b, k++)
          aplicar(c)
        }
      }
    }

    /**
     * A classe `arrastando` corta o ponteiro dos filhos (`pointer-events: none`) para o cursor não
     * ser roubado no meio do arrasto. Por isso ela só entra **quando o mouse anda de verdade**: se
     * entrasse já no `mousedown`, o botão perdia o ponteiro antes do `mouseup` e o clique em ×/⤢
     * nunca acontecia.
     */
    const arrastar = (c: Cartao, e: MouseEvent, modo: 'mover' | 'redim'): void => {
      e.preventDefault()
      e.stopPropagation()
      const x0 = e.clientX
      const y0 = e.clientY
      const b0 = { ...c.box }
      let andou = false
      const mover = (ev: MouseEvent): void => {
        const dx = ev.clientX - x0
        const dy = ev.clientY - y0
        if (!andou) {
          if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return
          andou = true
          c.el.classList.add('arrastando')
        }
        c.box =
          modo === 'mover' ? { ...b0, x: b0.x + dx, y: b0.y + dy } : { ...b0, w: b0.w + dx, h: b0.h + dy }
        c.fixado = true
        aplicar(c)
      }
      const soltar = (): void => {
        window.removeEventListener('mousemove', mover)
        window.removeEventListener('mouseup', soltar)
        c.el.classList.remove('arrastando')
        // grava depois de soltar, não a cada pixel — e só se saiu do lugar
        if (andou) useStore.getState().saveImgCard(cwd, c.box)
      }
      window.addEventListener('mousemove', mover)
      window.addEventListener('mouseup', soltar)
    }

    const remover = (path: string): void => {
      const c = cartoes.get(path)
      if (!c) return
      c.el.remove()
      cartoes.delete(path)
    }

    const criar = (info: ImageThumb, path: string): Cartao => {
      const el = document.createElement('div')
      el.className = 'term-card'

      const barra = document.createElement('div')
      barra.className = 'term-card-barra'
      const nome = document.createElement('span')
      nome.className = 'term-card-nome'
      nome.textContent = info.path.split(/[\\/]/).pop() ?? info.path
      const dim = info.width ? ` · ${info.width}×${info.height}` : ''
      nome.title = [info.path, `${tamanho(info.size)}${dim}`].join(String.fromCharCode(10))
      barra.appendChild(nome)

      const cheia = document.createElement('button')
      cheia.className = 'term-card-btn'
      cheia.textContent = '⤢'
      cheia.title = 'abrir em tela cheia'
      const fechar = document.createElement('button')
      fechar.className = 'term-card-btn'
      fechar.textContent = '×'
      fechar.title = 'fechar'
      barra.append(cheia, fechar)

      const corpo = document.createElement('div')
      corpo.className = 'term-card-corpo'
      const img = document.createElement('img')
      img.src = info.thumb
      img.draggable = false
      img.title = 'clique para abrir em tela cheia'
      corpo.appendChild(img)

      const canto = document.createElement('div')
      canto.className = 'term-card-canto'
      canto.title = 'arraste para redimensionar'

      el.append(barra, corpo, canto)

      const c: Cartao = { el, path, real: info.path, box: { x: 0, y: 0, w: CARD_W, h: CARD_H }, fixado: false }

      // o xterm começaria a selecionar texto por baixo do cartão
      el.addEventListener('mousedown', (e) => e.stopPropagation())
      // clique nos botões não é arrasto: sem esta guarda o `mousedown` deles subia para a barra
      barra.addEventListener('mousedown', (e) => {
        if ((e.target as HTMLElement).closest('.term-card-btn')) return
        arrastar(c, e, 'mover')
      })
      canto.addEventListener('mousedown', (e) => arrastar(c, e, 'redim'))
      const abrir = (e: Event): void => {
        e.preventDefault()
        e.stopPropagation()
        useStore.getState().openLightbox(tab.id, info.path, cwd)
      }
      img.addEventListener('click', abrir)
      cheia.addEventListener('click', abrir)
      fechar.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        fechados.add(path)
        remover(path)
        publicar()
      })
      return c
    }

    const publicar = (): void => setImagens(tab.id, [...cartoes.values()].map((c) => c.real))

    const varrer = async (): Promise<void> => {
      if (morto || rodando || document.hidden) return
      rodando = true
      try {
        const buf = term.buffer.active
        const de = Math.max(0, buf.viewportY - MARGEM)
        const ate = Math.min(buf.length - 1, buf.viewportY + term.rows + MARGEM)
        const naTela = new Set(acharImagens(term, de, ate).map((a) => a.path))

        // some quando o caminho sai da tela — a menos que você tenha arrastado o cartão
        for (const [path, c] of [...cartoes]) if (!naTela.has(path) && !c.fixado) remover(path)

        for (const path of naTela) {
          if (morto) break
          if (cartoes.has(path) || fechados.has(path)) continue
          if (cacheThumb.get(`${cwd}|${path}`) === null) continue // já perguntamos: não existe
          const info = await miniatura(path, cwd)
          if (!info || morto || cartoes.has(path)) continue
          const c = criar(info, path)
          pegarCamada().appendChild(c.el)
          cartoes.set(path, c)
        }

        arrumar()
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

    const recolocar = (): void => arrumar()

    const off = [
      term.onWriteParsed(agendar),
      term.onScroll(agendar),
      term.onResize(() => {
        recolocar()
        agendar()
      })
    ]
    const ro = new ResizeObserver(recolocar)
    ro.observe(host)
    document.addEventListener('visibilitychange', agendar)
    agendar()

    return () => {
      morto = true
      if (timer) clearTimeout(timer)
      ro.disconnect()
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
