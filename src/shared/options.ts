/** Opções dos dropdowns de modelo/effort ('' = usa o padrão global / do Claude). */
export const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'padrão' },
  { value: 'fable', label: 'Fable 5' },
  { value: 'claude-fable-5[1m]', label: 'Fable 5 · 1M ctx' },
  { value: 'opus', label: 'Opus 5' },
  { value: 'claude-opus-5[1m]', label: 'Opus 5 · 1M ctx' },
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
