/**
 * Consumo da conta Claude — mesma chamada que o /usage do Claude Code faz
 * (porta do usage_api.py do Usage Tray). Só lê o token; nunca renova.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { UsageInfo, UsageLimit } from '@shared/types'

const CREDENTIALS_PATH = join(homedir(), '.claude', '.credentials.json')
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const OAUTH_BETA = 'oauth-2025-04-20'
const USER_AGENT = 'claude-dynasty/0.1'

const LABELS: Record<string, string> = {
  session: 'Sessão (5h)',
  weekly_all: 'Semanal · todos',
  weekly_scoped: 'Semanal · {model}'
}

function accessToken(): string {
  let raw: any
  try {
    raw = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'))
  } catch {
    throw new Error('Sem credenciais em ~/.claude — faça login no Claude Code.')
  }
  const creds = raw?.claudeAiOauth
  if (!creds?.accessToken) throw new Error('Credenciais sem accessToken.')
  const exp = creds.expiresAt
  if (typeof exp === 'number' && exp / 1000 <= Date.now() / 1000 + 60) {
    throw new Error('Token expirado — abra uma sessão do Claude para renovar.')
  }
  return creds.accessToken
}

function labelFor(e: any): string {
  const kind = e.kind ?? '?'
  let t = LABELS[kind] ?? String(kind).replace(/_/g, ' ')
  if (t.includes('{model}')) {
    const m = e.scope?.model?.display_name ?? 'modelo'
    t = t.replace('{model}', m)
  }
  return t
}

function limitsFrom(payload: any): UsageLimit[] {
  const entries: any[] = Array.isArray(payload.limits) ? payload.limits : []
  const limits: UsageLimit[] = entries
    .filter((e) => e && typeof e === 'object')
    .map((e) => ({
      kind: e.kind ?? '?',
      label: labelFor(e),
      percent: Number(e.percent ?? 0),
      resetsAt: e.resets_at ?? null,
      isActive: Boolean(e.is_active)
    }))
  if (limits.length) return limits
  const fallback = [
    ['five_hour', 'session'],
    ['seven_day', 'weekly_all']
  ] as const
  for (const [key, kind] of fallback) {
    const b = payload[key]
    if (b && typeof b === 'object') {
      limits.push({
        kind,
        label: LABELS[kind],
        percent: Number(b.utilization ?? 0),
        resetsAt: b.resets_at ?? null,
        isActive: true
      })
    }
  }
  return limits
}

let last: UsageInfo | null = null
let inflight: Promise<UsageInfo> | null = null
let lastAttempt = 0
let backoffUntil = 0
/** cache normal; a API de consumo limita consultas frequentes (429) */
const CACHE_MS = 150_000
/** mesmo com "força" (botão Atualizar), no máximo 1 consulta por minuto */
const MIN_GAP_MS = 60_000
/** depois de um 429, espera antes de tentar de novo */
const BACKOFF_MS = 5 * 60_000

/**
 * Uma única consulta real, compartilhada entre renderer e bandeja.
 * Em erro (ex.: 429), devolve o último valor bom marcado como `stale` + a mensagem.
 */
export function fetchUsage(force = false): Promise<UsageInfo> {
  if (inflight) return inflight
  const now = Date.now()
  const fresh = last && !last.error && now - last.fetchedAt < CACHE_MS
  if (!force && fresh) return Promise.resolve(last!)
  if (now < backoffUntil || now - lastAttempt < MIN_GAP_MS) {
    if (last) return Promise.resolve(last)
  }
  lastAttempt = now
  inflight = doFetch()
    .then((u) => {
      if (u.error) {
        if (/429/.test(u.error)) backoffUntil = Date.now() + BACKOFF_MS
        if (last?.limits.length) u = { ...last, error: u.error, stale: true, fetchedAt: last.fetchedAt }
      } else {
        backoffUntil = 0
      }
      last = u
      return u
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

async function doFetch(): Promise<UsageInfo> {
  try {
    const token = accessToken()
    const res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': OAUTH_BETA,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT
      },
      signal: AbortSignal.timeout(15000)
    })
    if (res.status === 401 || res.status === 403) {
      throw new Error('API recusou o token — abra o Claude para renovar.')
    }
    if (res.status === 429) throw new Error('API limitou as consultas (429) — nova tentativa em 5 min.')
    if (!res.ok) throw new Error(`HTTP ${res.status} ao consultar consumo.`)
    const payload: any = await res.json()
    const extra = payload.extra_usage
    const credits =
      extra && typeof extra === 'object' && extra.is_enabled
        ? {
            percent: Number(extra.utilization ?? 0),
            used: extra.used_credits,
            limit: extra.monthly_limit,
            currency: extra.currency ?? 'USD'
          }
        : null
    return { limits: limitsFrom(payload), credits, fetchedAt: Date.now() }
  } catch (err: any) {
    return { limits: [], credits: null, fetchedAt: Date.now(), error: err?.message ?? String(err) }
  }
}
