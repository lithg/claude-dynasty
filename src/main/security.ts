/**
 * Segurança: pentests assistidos pelo Claude, por projeto.
 *
 * O motor é uma sessão normal do Claude, aberta numa aba visível, seguindo um manual em
 * `resources/seguranca/*.md`. O prompt inicial (curto) manda ler o manual e gravar o **relatório
 * em JSON** num caminho fixo. Este módulo cuida só do lado de arquivos: onde guardar, montar o
 * prompt, ler/listar relatórios e observar mudanças. Quem faz o spawn é o `index.ts` (é lá que
 * vivem os PTYs e as abas).
 *
 * Cada verificação é uma pasta em `%APPDATA%/claude-dynasty/seguranca/<slug>/<id>/` com um
 * `meta.json` (modo, início) e o `relatorio.json` que o Claude escreve ao terminar.
 */
import { app, dialog, shell, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, watch, type FSWatcher } from 'node:fs'
import { join, dirname } from 'node:path'
import type { ScanInfo, SecurityReport, Severity } from '@shared/types'
import { slugForPath } from './projects'

const SEVERITIES: Severity[] = ['critica', 'alta', 'media', 'baixa', 'info']

function root(): string {
  const dir = join(app.getPath('userData'), 'seguranca')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function projectDir(projectPath: string): string {
  const dir = join(root(), slugForPath(projectPath))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Caminho do manual .md em resources/ (mesmo esquema dos ícones: relativo a out/). */
export function manualPath(mode: string): string {
  const dir = join(__dirname, '../../resources', 'seguranca')
  const file = mode === 'basico' ? 'basico.md' : 'completo.md'
  return join(dir, file)
}

export interface NewScan {
  scanId: string
  reportPath: string
  scanDir: string
}

/** Cria a pasta da verificação e devolve o caminho onde o relatório deve ser escrito. */
export function createScan(projectPath: string, mode: string): NewScan {
  const scanId = new Date().toISOString().replace(/[:.]/g, '-')
  const scanDir = join(projectDir(projectPath), scanId)
  mkdirSync(scanDir, { recursive: true })
  const reportPath = join(scanDir, 'relatorio.json')
  const meta = { id: scanId, projectPath, modo: mode, startedAt: Date.now() }
  try {
    writeFileSync(join(scanDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8')
  } catch {
    /* segue mesmo sem meta: o relatório é a fonte de verdade */
  }
  return { scanId, reportPath, scanDir }
}

/** Monta o prompt inicial da sessão de pentest (curto: o peso está no manual .md). */
export function buildPrompt(o: {
  mode: string
  prodUrl?: string
  reportPath: string
  custom?: string
}): string {
  const manual = manualPath(o.mode === 'basico' ? 'basico' : 'completo')
  return [
    'Você vai executar um PENTEST DE SEGURANÇA autorizado neste projeto, que é de propriedade do usuário.',
    `Modo da verificação: ${o.mode}.`,
    `Leia o manual e siga-o passo a passo, na ordem, sem pular etapas: ${manual}`,
    o.prodUrl
      ? `URL de produção autorizada para os testes passivos descritos no manual: ${o.prodUrl}`
      : 'Nenhuma URL de produção foi informada — foque no código e no que der para rodar localmente.',
    o.custom ? `Objetivo extra pedido pelo usuário: ${o.custom}` : '',
    `Ao terminar, escreva o relatório em JSON EXATAMENTE neste caminho (crie o arquivo): ${o.reportPath}`,
    'IMPORTANTE: não altere código, não instale nada e não aplique correções — apenas analise e relate. A correção é feita depois, numa sessão separada, item a item.'
  ]
    .filter(Boolean)
    .join('\n')
}

function readReport(reportPath: string): SecurityReport | null {
  try {
    const raw = JSON.parse(readFileSync(reportPath, 'utf-8'))
    if (!raw || !Array.isArray(raw.findings)) return null
    return raw as SecurityReport
  } catch {
    return null
  }
}

export function listScans(projectPath: string): ScanInfo[] {
  const dir = projectDir(projectPath)
  const out: ScanInfo[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const scanDir = join(dir, entry.name)
    const reportPath = join(scanDir, 'relatorio.json')
    let meta: { modo?: string; startedAt?: number } = {}
    try {
      meta = JSON.parse(readFileSync(join(scanDir, 'meta.json'), 'utf-8'))
    } catch {
      /* verificação sem meta (raro): usa o que der do relatório */
    }
    const report = readReport(reportPath)
    const info: ScanInfo = {
      id: entry.name,
      projectPath,
      modo: meta.modo ?? report?.modo ?? '?',
      reportPath,
      startedAt: meta.startedAt ?? 0,
      hasReport: Boolean(report)
    }
    if (report) {
      try {
        info.finishedAt = statSync(reportPath).mtimeMs
      } catch {
        /* ignore */
      }
      const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>
      const openCounts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>
      for (const f of report.findings) {
        if (counts[f.severidade] == null) continue
        counts[f.severidade]++
        const st = f.status ?? 'aberto'
        if (st === 'aberto') openCounts[f.severidade]++
      }
      info.counts = counts
      info.openCounts = openCounts
      info.resumo = report.resumo
    }
    out.push(info)
  }
  return out.sort((a, b) => b.startedAt - a.startedAt)
}

export function readScan(reportPath: string): SecurityReport | null {
  return readReport(reportPath)
}

/** Quando foi a verificação mais recente deste projeto (para o agendador). 0 = nunca. */
export function lastScanAt(projectPath: string): number {
  let latest = 0
  try {
    const dir = projectDir(projectPath)
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      try {
        const meta = JSON.parse(readFileSync(join(dir, e.name, 'meta.json'), 'utf-8'))
        if (typeof meta.startedAt === 'number' && meta.startedAt > latest) latest = meta.startedAt
      } catch {
        /* pasta sem meta: ignora */
      }
    }
  } catch {
    /* projeto sem histórico ainda */
  }
  return latest
}

/** Marca o status de um finding (ex.: 'corrigido') e regrava o relatório. */
export function setFindingStatus(reportPath: string, findingId: string, status: string): SecurityReport | null {
  const report = readReport(reportPath)
  if (!report) return null
  const f = report.findings.find((x) => x.id === findingId)
  if (f) {
    f.status = status as SecurityReport['findings'][number]['status']
    try {
      writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
    } catch {
      /* disco cheio: devolve o que dá */
    }
  }
  return report
}

/** Manda a verificação inteira (pasta do scan) para a lixeira. */
export async function deleteScan(reportPath: string): Promise<void> {
  await shell.trashItem(dirname(reportPath))
}

let watcher: FSWatcher | null = null

/** Avisa quando um relatório aparece/muda (o Claude terminou de gravar). */
export function watchSecurity(onChange: () => void): void {
  stopWatchSecurity()
  try {
    let timer: NodeJS.Timeout | null = null
    watcher = watch(root(), { persistent: false, recursive: true }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(onChange, 300)
    })
  } catch {
    /* sem watcher: a lista atualiza quando você reabre a view */
  }
}

export function stopWatchSecurity(): void {
  watcher?.close()
  watcher = null
}

/* ---------------- exportar PDF ---------------- */

const SEV_COR: Record<string, string> = {
  critica: '#c0264a',
  alta: '#d9480f',
  media: '#b7791f',
  baixa: '#1d6fb8',
  info: '#6b7280'
}
const SEV_ROTULO: Record<string, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
  info: 'Info'
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function reportHtml(report: SecurityReport): string {
  const ordem = ['critica', 'alta', 'media', 'baixa', 'info']
  const findings = [...report.findings].sort(
    (a, b) => ordem.indexOf(a.severidade) - ordem.indexOf(b.severidade)
  )
  const itens = findings
    .map((f) => {
      const cor = SEV_COR[f.severidade] ?? '#6b7280'
      const bloco = (rot: string, val?: string): string =>
        val ? `<div class="b"><span class="r">${esc(rot)}</span><div class="v">${esc(val)}</div></div>` : ''
      const status = f.status && f.status !== 'aberto' ? `<span class="st">${esc(f.status)}</span>` : ''
      return `<div class="f" style="border-left-color:${cor}">
        <div class="fh"><span class="badge" style="background:${cor}">${SEV_ROTULO[f.severidade] ?? esc(f.severidade)}</span>
        <span class="ft">${esc(f.titulo)}</span>${status}</div>
        ${f.local ? `<div class="loc">${esc(f.local)}</div>` : ''}
        ${f.cvss ? `<div class="cvss">${esc(f.cvss)}</div>` : ''}
        ${bloco('categoria', f.categoria)}
        ${bloco('o problema', f.descricao)}
        ${f.evidencia ? `<div class="b"><span class="r">evidência</span><pre>${esc(f.evidencia)}</pre></div>` : ''}
        ${bloco('como corrigir', f.correcao)}
      </div>`
    })
    .join('\n')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { font: 13px -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; margin: 32px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
    .resumo { background: #f4f4f5; border-radius: 8px; padding: 12px 14px; margin-bottom: 20px; }
    .f { border: 1px solid #e4e4e7; border-left: 4px solid #999; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; page-break-inside: avoid; }
    .fh { display: flex; align-items: center; gap: 8px; }
    .badge { color: #fff; font-weight: 700; font-size: 10px; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; }
    .ft { font-weight: 600; font-size: 14px; }
    .st { margin-left: auto; font-size: 11px; color: #16a34a; border: 1px solid #16a34a; padding: 1px 6px; border-radius: 4px; }
    .loc { font-family: monospace; font-size: 11px; color: #666; margin: 6px 0; word-break: break-all; }
    .cvss { font-family: monospace; font-size: 11px; color: #444; margin: 4px 0; }
    .b { margin-top: 10px; }
    .r { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #888; font-weight: 700; }
    .v { margin-top: 2px; white-space: pre-wrap; }
    pre { background: #f4f4f5; border-radius: 6px; padding: 8px 10px; font-size: 11px; white-space: pre-wrap; word-break: break-word; margin: 3px 0 0; }
  </style></head><body>
    <h1>Relatório de segurança — ${esc(report.projeto)}</h1>
    <div class="meta">Modo: ${esc(String(report.modo))}${report.urlProducao ? ` · ${esc(report.urlProducao)}` : ''} · ${esc(report.geradoEm)} · ${findings.length} achado(s)</div>
    ${report.resumo ? `<div class="resumo">${esc(report.resumo)}</div>` : ''}
    ${itens || '<p>Nenhuma vulnerabilidade registrada.</p>'}
  </body></html>`
}

/** Gera um PDF do relatório e deixa o usuário escolher onde salvar. Devolve o caminho ou null. */
export async function exportPdf(reportPath: string): Promise<string | null> {
  const report = readReport(reportPath)
  if (!report) throw new Error('relatório não encontrado ou inválido')
  const nomeSugerido = `seguranca-${slugForPath(report.projeto)}-${report.geradoEm.slice(0, 10)}.pdf`
  const r = await dialog.showSaveDialog({
    title: 'Salvar relatório em PDF',
    defaultPath: nomeSugerido,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (r.canceled || !r.filePath) return null

  const w = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(reportHtml(report)))
    const pdf = await w.webContents.printToPDF({ printBackground: true, margins: { marginType: 'default' } })
    writeFileSync(r.filePath, pdf)
  } finally {
    w.destroy()
  }
  return r.filePath
}
