import { useEffect, useRef, useState } from 'react'
import type { UsageInfo } from '@shared/types'
import { colorFor } from '@/lib/trayIcon'
import { humanizeReset } from '@/lib/format'

/** Popup escuro que abre ao clicar no ícone da bandeja — mesmo layout do Usage Tray. */
export default function TrayPopup(): React.JSX.Element {
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = window.api.usage.onUpdate((u) => setUsage(u))
    void window.api.usage.get().then(setUsage)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void window.api.app.hidePopup()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (ref.current) window.api.tray.popupHeight(ref.current.offsetHeight + 2)
  }, [usage])

  const metric = (label: string, percent: number, detail: string, muted: boolean): React.JSX.Element => (
    <div className="tp-row" key={label}>
      <div className="tp-line">
        <span className={muted ? 'tp-muted' : ''}>{label}</span>
        <b style={{ color: colorFor(percent) }}>{percent.toFixed(0)}%</b>
      </div>
      <div className="tp-track">
        <div className="tp-fill" style={{ width: `${Math.max(percent > 0 ? 1 : 0, Math.min(percent, 100))}%`, background: colorFor(percent) }} />
      </div>
      <div className="tp-detail">{detail}</div>
    </div>
  )

  return (
    <div className="tp" ref={ref}>
      <div className="tp-head">
        <span>Consumo do Claude</span>
        <button className="tp-x" onClick={() => void window.api.app.hidePopup()}>
          ✕
        </button>
      </div>
      <div className="tp-rows">
        {!usage && <div className="tp-msg tp-muted">Consultando…</div>}
        {usage?.error && !usage.stale && <div className="tp-msg tp-danger">{usage.error}</div>}
        {usage &&
          (!usage.error || usage.stale) &&
          usage.limits.map((l) =>
            metric(l.label, l.percent, humanizeReset(l.resetsAt) + (l.isActive ? '' : ' · inativo'), !l.isActive)
          )}
        {usage?.credits &&
          metric(
            'Créditos extras',
            usage.credits.percent,
            usage.credits.used != null && usage.credits.limit != null
              ? `${usage.credits.used} de ${usage.credits.limit} ${usage.credits.currency}`
              : 'créditos extras habilitados',
            false
          )}
        {usage?.stale && (
          <div className="tp-msg tp-muted" title={usage.error}>
            valores da última consulta boa · {usage.error}
          </div>
        )}
      </div>
      <div className="tp-foot">
        <span className="tp-muted">
          {usage ? `Atualizado ${new Date(usage.fetchedAt).toLocaleTimeString('pt-BR')}` : ''}
        </span>
        <span className="tp-actions">
          <button className="tp-link" onClick={() => void window.api.usage.get(true)}>
            Atualizar
          </button>
          <button className="tp-link tp-open" onClick={() => void window.api.app.showMain()}>
            Abrir Claude Wrapper
          </button>
        </span>
      </div>
    </div>
  )
}
