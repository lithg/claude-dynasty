/** Ponte para pedir a sugestão da caixa de prompt de fora dela (fim de resposta do Claude). */
const suggesters = new Map<string, (auto: boolean) => void>()

export function registerSuggest(id: string, fn: (auto: boolean) => void): void {
  suggesters.set(id, fn)
}

export function unregisterSuggest(id: string): void {
  suggesters.delete(id)
}

/** `auto` = veio do fim de uma resposta, não de um clique: não atropela o que já está escrito. */
export function requestSuggest(id: string | null | undefined, auto = false): void {
  if (id) suggesters.get(id)?.(auto)
}
