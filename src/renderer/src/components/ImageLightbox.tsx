import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImageFull } from '@shared/types'
import { useStore } from '@/store'
import { getImagens } from '@/lib/terminals'

const MIN_ZOOM = 0.15
const MAX_ZOOM = 10

function tamanho(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function nomeDe(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/**
 * Imagem em tela cheia, aberta ao clicar na miniatura que a varredura do terminal criou.
 * ←/→ percorrem as outras imagens da mesma aba (a lista vem do `lib/terminals`, na ordem em que
 * aparecem no buffer).
 */
export default function ImageLightbox(): React.JSX.Element | null {
  const lightbox = useStore((s) => s.lightbox)
  const fechar = useStore((s) => s.closeLightbox)
  const abrir = useStore((s) => s.openLightbox)
  const [info, setInfo] = useState<ImageFull | null>(null)
  const [erro, setErro] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const arrasto = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  const path = lightbox?.path
  const cwd = lightbox?.cwd
  const lista = lightbox ? getImagens(lightbox.tabId) : []
  const i = path ? lista.indexOf(path) : -1
  const temLista = lista.length > 1 && i >= 0

  const ir = useCallback(
    (d: 1 | -1): void => {
      if (!lightbox || !temLista) return
      abrir(lightbox.tabId, lista[(i + d + lista.length) % lista.length], lightbox.cwd)
    },
    [lightbox, temLista, lista, i, abrir]
  )

  useEffect(() => {
    if (!path || cwd == null) return
    setInfo(null)
    setErro(false)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    let vivo = true
    void window.api.images.full(path, cwd).then((r) => {
      if (!vivo) return
      setInfo(r)
      setErro(!r)
    })
    return () => {
      vivo = false
    }
  }, [path, cwd])

  useEffect(() => {
    if (!lightbox) return
    // captura: com o lightbox aberto nem o xterm nem os atalhos do App podem ver estas teclas
    const onKey = (e: KeyboardEvent): void => {
      const meu = (): void => {
        e.preventDefault()
        e.stopPropagation()
      }
      if (e.key === 'Escape') return meu(), fechar()
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key === 'ArrowRight' && temLista) return meu(), ir(1)
      if (e.key === 'ArrowLeft' && temLista) return meu(), ir(-1)
      if (e.key === '+' || e.key === '=') return meu(), setZoom((z) => Math.min(MAX_ZOOM, z * 1.25))
      if (e.key === '-') return meu(), setZoom((z) => Math.max(MIN_ZOOM, z / 1.25))
      if (e.key === '0') {
        meu()
        setZoom(1)
        setPan({ x: 0, y: 0 })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [lightbox, temLista, ir, fechar])

  useEffect(() => {
    if (!lightbox) return
    const onMove = (e: MouseEvent): void => {
      const a = arrasto.current
      if (!a) return
      setPan({ x: a.px + (e.clientX - a.x), y: a.py + (e.clientY - a.y) })
    }
    const onUp = (): void => {
      arrasto.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [lightbox])

  if (!lightbox) return null

  const dim = info?.width ? ` · ${info.width}×${info.height}` : ''

  return (
    <div className="lightbox">
      <div className="lightbox-bar">
        <span className="lightbox-nome" title={lightbox.path}>
          {nomeDe(lightbox.path)}
        </span>
        <span className="muted small">{info ? `${tamanho(info.size)}${dim}` : erro ? '' : 'carregando…'}</span>
        {temLista && (
          <span className="muted small">
            {i + 1}/{lista.length}
          </span>
        )}
        <div className="lightbox-espaco" />
        <button className="icon-btn" title="diminuir (−)" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.25))}>
          −
        </button>
        <span className="muted small lightbox-zoom">{Math.round(zoom * 100)}%</span>
        <button className="icon-btn" title="aumentar (+)" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.25))}>
          +
        </button>
        <button
          className="btn sm ghost"
          title="volta ao tamanho da janela (0)"
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
        >
          ajustar
        </button>
        <button className="btn sm ghost" onClick={() => void window.api.app.copy(lightbox.path)}>
          copiar caminho
        </button>
        <button className="btn sm ghost" onClick={() => void window.api.images.reveal(lightbox.path)}>
          abrir na pasta
        </button>
        <button className="btn sm ghost" onClick={() => void window.api.images.open(lightbox.path)}>
          abrir fora
        </button>
        <button className="icon-btn" title="fechar (Esc)" onClick={fechar}>
          ×
        </button>
      </div>

      <div
        className="lightbox-palco"
        onMouseDown={(e) => {
          // clique no vazio fecha; em cima da imagem, arrasta
          if (e.target === e.currentTarget) fechar()
        }}
        onWheel={(e) => {
          const fator = e.deltaY < 0 ? 1.15 : 1 / 1.15
          setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * fator)))
        }}
      >
        {erro && <div className="muted">Não consegui ler a imagem — ela pode ter sido apagada ou movida.</div>}
        {info && (
          <img
            className="lightbox-img"
            src={info.url}
            alt={nomeDe(lightbox.path)}
            draggable={false}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
            onMouseDown={(e) => {
              e.preventDefault()
              arrasto.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
            }}
            onDoubleClick={() => {
              setPan({ x: 0, y: 0 })
              setZoom((z) => (z === 1 ? 2 : 1))
            }}
          />
        )}
      </div>

      {temLista && (
        <>
          <button className="lightbox-nav esq" title="anterior (←)" onClick={() => ir(-1)}>
            ‹
          </button>
          <button className="lightbox-nav dir" title="próxima (→)" onClick={() => ir(1)}>
            ›
          </button>
        </>
      )}
    </div>
  )
}
