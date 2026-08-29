/** Ponte para acionar a caixa de prompt da aba ativa de fora dela (Ctrl+Espaço). */
const suggesters = new Map<string, () => void>()

export function registerSuggest(id: string, fn: () => void): void {
  suggesters.set(id, fn)
}

export function unregisterSuggest(id: string): void {
  suggesters.delete(id)
}

export function requestSuggest(id: string | null | undefined): void {
  if (id) suggesters.get(id)?.()
}
