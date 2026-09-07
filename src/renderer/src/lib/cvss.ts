/**
 * CVSS 3.1 base score — a nota autoritativa vem do **vetor**, não do número que o Claude escreveu.
 * Fórmula oficial (https://www.first.org/cvss/v3.1/specification-document).
 */

const AV: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }
const AC: Record<string, number> = { L: 0.77, H: 0.44 }
const UI: Record<string, number> = { N: 0.85, R: 0.62 }
const PR_U: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 }
const PR_C: Record<string, number> = { N: 0.85, L: 0.68, H: 0.5 }
const CIA: Record<string, number> = { H: 0.56, L: 0.22, N: 0 }

export interface CvssResult {
  score: number
  /** rótulo qualitativo da nota (padrão CVSS) */
  nivel: 'Nenhuma' | 'Baixa' | 'Média' | 'Alta' | 'Crítica'
  vector: string
}

function nivelDe(score: number): CvssResult['nivel'] {
  if (score === 0) return 'Nenhuma'
  if (score < 4) return 'Baixa'
  if (score < 7) return 'Média'
  if (score < 9) return 'Alta'
  return 'Crítica'
}

/** Arredonda para cima na 1ª casa decimal, como manda o CVSS 3.1. */
function roundUp(x: number): number {
  return Math.ceil(Math.round(x * 100000) / 10000) / 10
}

/** Recebe um vetor CVSS 3.x e devolve a nota base, ou null se o vetor for inválido/incompleto. */
export function parseCvss(vector?: string): CvssResult | null {
  if (!vector) return null
  const partes = vector.trim().split('/')
  const m: Record<string, string> = {}
  for (const p of partes) {
    const [k, v] = p.split(':')
    if (k && v) m[k.toUpperCase()] = v.toUpperCase()
  }
  const av = AV[m.AV]
  const ac = AC[m.AC]
  const ui = UI[m.UI]
  const scope = m.S
  const pr = scope === 'C' ? PR_C[m.PR] : PR_U[m.PR]
  const c = CIA[m.C]
  const i = CIA[m.I]
  const a = CIA[m.A]
  if ([av, ac, ui, pr, c, i, a].some((x) => x == null) || (scope !== 'U' && scope !== 'C')) return null

  const iss = 1 - (1 - c) * (1 - i) * (1 - a)
  const impact = scope === 'C' ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss
  const exploit = 8.22 * av * ac * pr * ui
  let score: number
  if (impact <= 0) score = 0
  else if (scope === 'C') score = roundUp(Math.min(1.08 * (impact + exploit), 10))
  else score = roundUp(Math.min(impact + exploit, 10))

  return { score, nivel: nivelDe(score), vector: vector.trim() }
}
