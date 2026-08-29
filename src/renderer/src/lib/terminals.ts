import type { Terminal } from '@xterm/xterm'

/** Registro global de terminais: 1 listener IPC alimenta N xterms. */
const terms = new Map<string, Terminal>()
const pending = new Map<string, string[]>()

export function registerTerm(id: string, term: Terminal): void {
  terms.set(id, term)
  const buf = pending.get(id)
  if (buf) {
    for (const d of buf) term.write(d)
    pending.delete(id)
  }
}

export function unregisterTerm(id: string): void {
  terms.delete(id)
  pending.delete(id)
}

export function feedTerm(id: string, data: string): void {
  const t = terms.get(id)
  if (t) {
    t.write(data)
    return
  }
  const buf = pending.get(id) ?? []
  buf.push(data)
  if (buf.length > 2000) buf.shift()
  pending.set(id, buf)
}

export function getTerm(id: string): Terminal | undefined {
  return terms.get(id)
}

export const DARK_THEME = {
  background: '#0f1115',
  foreground: '#d4d4d8',
  cursor: '#f4f4f5',
  cursorAccent: '#0f1115',
  selectionBackground: 'rgba(148, 163, 184, 0.30)',
  black: '#18181b',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e4e4e7',
  brightBlack: '#71717a',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#fafafa'
}

export const LIGHT_THEME = {
  background: '#fafaf9',
  foreground: '#27272a',
  cursor: '#18181b',
  cursorAccent: '#fafaf9',
  selectionBackground: 'rgba(59, 130, 246, 0.25)',
  black: '#27272a',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#d4d4d8',
  brightBlack: '#71717a',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#f4f4f5'
}
