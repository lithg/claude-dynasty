import type { Severity } from '@shared/types'

export const SEV: Record<Severity, { label: string; ord: number }> = {
  critica: { label: 'Crítica', ord: 0 },
  alta: { label: 'Alta', ord: 1 },
  media: { label: 'Média', ord: 2 },
  baixa: { label: 'Baixa', ord: 3 },
  info: { label: 'Info', ord: 4 }
}

export const ORDEM_SEV: Severity[] = ['critica', 'alta', 'media', 'baixa', 'info']

export const MODO_LABEL: Record<string, string> = {
  basico: 'Básico',
  completo: 'Completo',
  customizado: 'Customizado'
}

/** Assinatura estável de um finding entre verificações (o `id` é por-relatório, não serve). */
export function assinatura(f: { titulo: string; local?: string }): string {
  return `${f.titulo}|${f.local ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim()
}
