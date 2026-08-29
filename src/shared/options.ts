/** Opções dos dropdowns de modelo/effort ('' = usa o padrão global / do Claude). */
export const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'padrão' },
  { value: 'fable', label: 'Fable 5 (200k)' },
  { value: 'claude-fable-5[1m]', label: 'Fable 5 (1M contexto)' },
  { value: 'opus', label: 'Opus 5 (200k)' },
  { value: 'claude-opus-5[1m]', label: 'Opus 5 (1M contexto)' },
  { value: 'sonnet', label: 'Sonnet 5' },
  { value: 'haiku', label: 'Haiku 4.5' }
]

export const EFFORT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'padrão' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
  { value: 'xhigh', label: 'xhigh' },
  { value: 'max', label: 'max' }
]

/** Nome curto a partir do id que aparece no transcript (ex.: claude-opus-5). */
export function modelLabel(id: string | undefined): string {
  if (!id) return ''
  const m = id.toLowerCase()
  if (m.includes('fable')) return 'Fable 5'
  if (m.includes('opus')) return m.includes('4') ? 'Opus 4.x' : 'Opus 5'
  if (m.includes('sonnet')) return m.includes('4') ? 'Sonnet 4.x' : 'Sonnet 5'
  if (m.includes('haiku')) return 'Haiku 4.5'
  return id
}
