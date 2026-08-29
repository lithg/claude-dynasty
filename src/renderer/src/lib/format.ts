export function relTime(ts: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function fullDate(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** "em 3h 12min · 29/08 18:59" */
export function humanizeReset(iso: string | null): string {
  if (!iso) return ''
  const dt = new Date(iso)
  if (isNaN(dt.getTime())) return ''
  const delta = (dt.getTime() - Date.now()) / 1000
  const local = dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  if (delta <= 0) return 'reset iminente'
  const hours = Math.floor(delta / 3600)
  const minutes = Math.floor((delta % 3600) / 60)
  let rel: string
  if (hours >= 24) rel = `em ${Math.floor(hours / 24)}d ${hours % 24}h`
  else if (hours) rel = `em ${hours}h ${String(minutes).padStart(2, '0')}min`
  else rel = `em ${minutes}min`
  return `${rel} · ${local}`
}

export function usageColor(pct: number): string {
  if (pct >= 90) return 'var(--danger)'
  if (pct >= 70) return 'var(--warn)'
  return 'var(--ok)'
}

export const STACK_LABEL: Record<string, string> = {
  node: 'Node',
  laravel: 'Laravel',
  php: 'PHP',
  flutter: 'Flutter',
  godot: 'Godot',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  unity: 'Unity',
  next: 'Next',
  vue: 'Vue',
  react: 'React'
}
