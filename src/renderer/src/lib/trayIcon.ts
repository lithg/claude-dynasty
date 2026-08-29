/**
 * Ícone da bandeja: anel de progresso com o número no meio — mesma arte do
 * Usage Tray (tray_icon.py). Desenha em 64x64; o main reduz para 32.
 */
const SIZE = 64
const RING_INSET = 4
const RING_WIDTH = 6
const DISC = 'rgba(24, 24, 27, 0.92)'
const TRACK = '#3f3f46'
const TEXT = '#fafafa'
const DIM = '#a1a1aa'

const BANDS: [number, string][] = [
  [50, '#4ade80'],
  [80, '#facc15'],
  [95, '#fb923c'],
  [1000, '#ef4444']
]

export function colorFor(percent: number): string {
  for (const [ceiling, color] of BANDS) if (percent < ceiling) return color
  return BANDS[BANDS.length - 1][1]
}

function base(): CanvasRenderingContext2D {
  const c = document.createElement('canvas')
  c.width = SIZE
  c.height = SIZE
  const g = c.getContext('2d')!
  g.clearRect(0, 0, SIZE, SIZE)
  g.fillStyle = DISC
  g.beginPath()
  g.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = TRACK
  g.lineWidth = RING_WIDTH
  g.beginPath()
  g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - RING_INSET - RING_WIDTH / 2, 0, Math.PI * 2)
  g.stroke()
  return g
}

function centered(g: CanvasRenderingContext2D, text: string, px: number, color: string): void {
  g.fillStyle = color
  g.font = `700 ${px}px "Segoe UI", "Segoe UI Variable", Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, SIZE / 2, SIZE / 2 + px * 0.06)
}

export function renderTrayIcon(percent: number | null): string {
  const g = base()
  if (percent === null) {
    centered(g, '?', 34, DIM)
    return g.canvas.toDataURL('image/png')
  }
  const clamped = Math.max(0, Math.min(percent, 100))
  if (clamped > 0) {
    g.strokeStyle = colorFor(percent)
    g.lineWidth = RING_WIDTH
    g.lineCap = 'butt'
    g.beginPath()
    const r = SIZE / 2 - RING_INSET - RING_WIDTH / 2
    g.arc(SIZE / 2, SIZE / 2, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * clamped) / 100)
    g.stroke()
  }
  const label = String(Math.round(percent))
  centered(g, label, label.length > 2 ? 25 : 35, TEXT)
  return g.canvas.toDataURL('image/png')
}
