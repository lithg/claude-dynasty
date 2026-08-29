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
const USER_AGENT = 'wrapper-claude/0.1'

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

export async function fetchUsage(): Promise<UsageInfo> {
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
