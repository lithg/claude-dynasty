import { useEffect, useMemo, useState } from 'react'
import type { ScanMode, SecurityReport, SecuritySchedule } from '@shared/types'
import { useStore } from '@/store'
import { relTime } from '@/lib/format'
import { assinatura, MODO_LABEL, ORDEM_SEV, SEV } from '@/lib/severity'
import { parseCvss } from '@/lib/cvss'

/**
 * View de Segurança de um projeto: dispara pentests (sessão do Claude seguindo um manual) e mostra
 * o relatório da verificação como checklist colorido, com "Resolver vulnerabilidade" por item.
 * Esconde o terminal enquanto está aberta (como o DocView), sem desmontá-lo.
 */

function statusLabel(s?: string): string {
  if (s === 'corrigido') return 'corrigido'
  if (s === 'aceito') return 'aceito'
  if (s === 'falso-positivo') return 'falso-positivo'
  return 'aberto'
}

export default function SecurityView(): React.JSX.Element {
  const path = useStore((s) => s.securityProject)!
  const projects = useStore((s) => s.projects)
  const details = useStore((s) => s.details)
  const config = useStore((s) => s.config)
  const scansAll = useStore((s) => s.scans)
  const tabs = useStore((s) => s.tabs)
  const abrindo = useStore((s) => s.abrindo)
  const startScan = useStore((s) => s.startScan)
  const resolveVulnerability = useStore((s) => s.resolveVulnerability)
  const setFindingStatus = useStore((s) => s.setFindingStatus)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const closeSecurity = useStore((s) => s.closeSecurity)
  const loadScans = useStore((s) => s.loadScans)
  const setSchedule = useStore((s) => s.setSchedule)

  const scans = scansAll[path] ?? []
  const p = projects.find((x) => x.path === path)
  const nome = (p && config?.perProject[p.name]?.label) || p?.name || path
  const carregando = abrindo.includes(path)

  const urlSugerida = details[path]?.claudeMd?.urls?.[0] ?? ''
  const [prodUrl, setProdUrl] = useState('')
  const [urlTocada, setUrlTocada] = useState(false)
  useEffect(() => {
    if (!urlTocada && urlSugerida && !prodUrl) setProdUrl(urlSugerida)
  }, [urlSugerida, urlTocada, prodUrl])

  const [armandoCustom, setArmandoCustom] = useState(false)
  const [custom, setCustom] = useState('')

  // sessão de pentest desta pasta ainda de pé
  const rodando = tabs.find((t) => t.projectPath === path && t.title.startsWith('🛡') && t.exited == null)

  // relatório selecionado (por padrão o mais recente que já tem relatório)
  const [selId, setSelId] = useState<string | null>(null)
  const selScan = useMemo(() => {
    const comReport = scans.filter((s) => s.hasReport)
    if (selId) return scans.find((s) => s.id === selId) ?? comReport[0] ?? null
    return comReport[0] ?? null
  }, [scans, selId])

  const [report, setReport] = useState<SecurityReport | null>(null)
  const [expandido, setExpandido] = useState<Set<string>>(new Set())
  const reportPath = selScan?.reportPath
  const finishedAt = selScan?.finishedAt
  useEffect(() => {
    let vivo = true
    if (!reportPath) {
      setReport(null)
      return
    }
    void window.api.security.read(reportPath).then((r) => {
      if (vivo) setReport(r)
    })
    return () => {
      vivo = false
    }
    // finishedAt muda quando o Claude regrava o relatório (novo scan ou status alterado)
  }, [reportPath, finishedAt])

  // verificação anterior (a mais recente, com relatório, iniciada antes da selecionada)
  const prevScan = useMemo(() => {
    if (!selScan) return null
    return scans.find((s) => s.hasReport && s.startedAt < selScan.startedAt) ?? null
  }, [scans, selScan])
  const [prevReport, setPrevReport] = useState<SecurityReport | null>(null)
  const prevReportPath = prevScan?.reportPath
  const prevFinishedAt = prevScan?.finishedAt
  useEffect(() => {
    let vivo = true
    if (!prevReportPath) {
      setPrevReport(null)
      return
    }
    void window.api.security.read(prevReportPath).then((r) => {
      if (vivo) setPrevReport(r)
    })
    return () => {
      vivo = false
    }
  }, [prevReportPath, prevFinishedAt])

  const findingsOrdenados = useMemo(() => {
    if (!report) return []
    return [...report.findings].sort((a, b) => (SEV[a.severidade]?.ord ?? 9) - (SEV[b.severidade]?.ord ?? 9))
  }, [report])

  // diff vs. verificação anterior (por assinatura título+local, já que o id é por-relatório)
  const diff = useMemo(() => {
    if (!report || !prevReport) return null
    const aberto = (f: { status?: string }): boolean => (f.status ?? 'aberto') === 'aberto'
    const prevAbertas = new Set(prevReport.findings.filter(aberto).map(assinatura))
    const prevCorrigidas = new Set(
      prevReport.findings.filter((f) => f.status === 'corrigido').map(assinatura)
    )
    const curAbertas = report.findings.filter(aberto)
    const curAbertasSig = new Set(curAbertas.map(assinatura))
    const novasSig = new Set<string>()
    let reabertas = 0
    for (const f of curAbertas) {
      const sig = assinatura(f)
      if (!prevAbertas.has(sig)) {
        if (prevCorrigidas.has(sig)) reabertas++
        else novasSig.add(sig)
      }
    }
    let resolvidas = 0
    for (const sig of prevAbertas) if (!curAbertasSig.has(sig)) resolvidas++
    const mantidas = curAbertas.length - novasSig.size - reabertas
    return { novasSig, novas: novasSig.size, resolvidas, reabertas, mantidas }
  }, [report, prevReport])

  const disparar = (mode: ScanMode): void => {
    if (carregando || rodando) return
    void startScan(path, mode, prodUrl.trim() || undefined, mode === 'customizado' ? custom.trim() || undefined : undefined)
    setArmandoCustom(false)
    setCustom('')
  }

  const excluir = async (rp: string): Promise<void> => {
    await window.api.security.remove(rp)
    setSelId(null)
    await loadScans(path)
  }

  const [exportando, setExportando] = useState(false)
  const exportarPdf = async (rp: string): Promise<void> => {
    setExportando(true)
    try {
      await window.api.security.exportPdf(rp)
    } finally {
      setExportando(false)
    }
  }

  // agendamento deste projeto (config) + status "no prazo / vencida"
  const nomeProj = p?.name
  const sched = nomeProj ? config?.perProject[nomeProj]?.securitySchedule : undefined
  const ultimoQualquer = scans[0]?.startedAt ?? 0
  const vencida =
    sched && sched.everyDays > 0 && (!ultimoQualquer || Date.now() > ultimoQualquer + sched.everyDays * 86_400_000)
  const salvarSchedule = (patch: Partial<SecuritySchedule>): void => {
    if (!nomeProj) return
    const base: SecuritySchedule = sched ?? { everyDays: 30, mode: 'basico' }
    const next = { ...base, ...patch, prodUrl: prodUrl.trim() || undefined }
    if (!next.everyDays) void setSchedule(nomeProj, null)
    else void setSchedule(nomeProj, next)
  }

  const toggle = (id: string): void =>
    setExpandido((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="seg">
      <div className="seg-rolo">
        <header className="seg-topo">
          <div className="seg-topo-linha">
            <h1 className="seg-titulo">
              <span className="seg-escudo">🛡</span> Segurança — {nome}
            </h1>
            <button className="btn ghost sm" onClick={closeSecurity}>
              voltar
            </button>
          </div>
          <p className="muted small">
            Pentest assistido pelo Claude: ele segue um manual e escreve um relatório. Você revê aqui e
            corrige item a item. Nada é alterado no código durante a verificação.
          </p>
        </header>

        {/* nova verificação */}
        <section className="seg-card">
          <h2 className="seg-sec-titulo">Nova verificação</h2>
          <label className="seg-campo">
            <span className="seg-campo-rot">URL de produção (opcional)</span>
            <input
              className="seg-input"
              placeholder="https://exemplo.com.br"
              value={prodUrl}
              onChange={(e) => {
                setProdUrl(e.target.value)
                setUrlTocada(true)
              }}
            />
            <span className="muted tiny">
              Se informada, entra nos testes passivos (cabeçalhos, TLS, arquivos expostos). Nada
              intrusivo contra produção.
            </span>
          </label>

          {rodando ? (
            <div className="seg-rodando">
              <span className="dot busy" /> Uma verificação está rodando nesta pasta.
              <button className="btn sm" onClick={() => setActiveTab(rodando.id)}>
                ir para a sessão
              </button>
            </div>
          ) : (
            <>
              <div className="seg-modos">
                <button className="btn primario" disabled={carregando} onClick={() => disparar('basico')}>
                  Básico
                  <span className="seg-modo-sub">código + prod passivo</span>
                </button>
                <button className="btn secundario" disabled={carregando} onClick={() => disparar('completo')}>
                  Completo
                  <span className="seg-modo-sub">sobe o projeto + DAST local</span>
                </button>
                <button
                  className="btn ghost"
                  disabled={carregando}
                  onClick={() => setArmandoCustom((v) => !v)}
                >
                  Customizado
                  <span className="seg-modo-sub">você define o foco</span>
                </button>
              </div>
              {armandoCustom && (
                <div className="seg-custom">
                  <textarea
                    className="seg-textarea"
                    autoFocus
                    placeholder="O que focar? Ex.: 'só a API de pagamentos' ou 'checar o fluxo de upload de imagens'."
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                  />
                  <button className="btn primario sm" disabled={carregando} onClick={() => disparar('customizado')}>
                    Iniciar verificação customizada
                  </button>
                </div>
              )}
            </>
          )}
          {carregando && <div className="muted small">Abrindo a sessão de pentest…</div>}
        </section>

        {/* agendamento */}
        {nomeProj && (
          <section className="seg-card">
            <h2 className="seg-sec-titulo">Agendamento</h2>
            <div className="seg-agenda">
              <label className="seg-mini">
                <span>A cada</span>
                <select
                  className="seg-select"
                  value={sched?.everyDays ?? 0}
                  onChange={(e) => salvarSchedule({ everyDays: Number(e.target.value) })}
                >
                  <option value={0}>desligado</option>
                  <option value={7}>7 dias</option>
                  <option value={14}>14 dias</option>
                  <option value={30}>30 dias</option>
                  <option value={90}>90 dias</option>
                </select>
              </label>
              <label className="seg-mini">
                <span>Modo</span>
                <select
                  className="seg-select"
                  value={sched?.mode ?? 'basico'}
                  disabled={!sched?.everyDays}
                  onChange={(e) => salvarSchedule({ mode: e.target.value as ScanMode })}
                >
                  <option value="basico">Básico</option>
                  <option value="completo">Completo</option>
                </select>
              </label>
              <label className="seg-mini check">
                <input
                  type="checkbox"
                  checked={Boolean(sched?.auto)}
                  disabled={!sched?.everyDays}
                  onChange={(e) => salvarSchedule({ auto: e.target.checked })}
                />
                <span>rodar sozinho quando vencer</span>
              </label>
            </div>
            {sched?.everyDays ? (
              <div className={`seg-agenda-status ${vencida ? 'vencida' : ''}`}>
                {ultimoQualquer ? `Última verificação há ${relTime(ultimoQualquer)}.` : 'Nunca verificado.'}{' '}
                {vencida
                  ? sched.auto
                    ? 'Vencida — vai rodar sozinha em breve.'
                    : 'Vencida — você será avisado para rodar.'
                  : `No prazo (a cada ${sched.everyDays} dias).`}
                {!sched.auto && ' Sem "rodar sozinho", o app só notifica; você dispara com um clique.'}
              </div>
            ) : (
              <div className="muted small">Desligado. Ligue para o app lembrar (ou rodar) de tempos em tempos.</div>
            )}
          </section>
        )}

        {/* histórico */}
        {scans.length > 0 && (
          <section className="seg-card">
            <h2 className="seg-sec-titulo">Verificações</h2>
            <ul className="seg-hist">
              {scans.map((s) => {
                const total = s.counts ? ORDEM_SEV.reduce((a, k) => a + (s.counts![k] ?? 0), 0) : 0
                const ativo = selScan?.id === s.id
                return (
                  <li key={s.id} className={`seg-hist-item ${ativo ? 'ativo' : ''}`}>
                    <button className="seg-hist-btn" onClick={() => setSelId(s.id)}>
                      <span className="seg-hist-modo">{MODO_LABEL[s.modo] ?? s.modo}</span>
                      <span className="muted small">
                        {s.hasReport ? relTime(s.finishedAt ?? s.startedAt) : 'sem relatório ainda'}
                      </span>
                      {s.hasReport && (
                        <span className="seg-hist-chips">
                          {ORDEM_SEV.map((k) =>
                            s.counts?.[k] ? (
                              <span key={k} className={`sev-chip sev-${k}`} title={SEV[k].label}>
                                {s.counts[k]}
                              </span>
                            ) : null
                          )}
                          {total === 0 && <span className="sev-chip sev-ok">limpo</span>}
                        </span>
                      )}
                    </button>
                    <button
                      className="icon-btn sm danger"
                      title="Excluir esta verificação"
                      onClick={() => void excluir(s.reportPath)}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* relatório selecionado */}
        {selScan && !selScan.hasReport && (
          <section className="seg-card">
            <div className="muted">
              Esta verificação ainda não tem relatório. Ela é gravada quando o Claude termina — a tela
              atualiza sozinha.
            </div>
          </section>
        )}

        {report && (
          <section className="seg-card seg-relatorio">
            <div className="seg-rel-topo">
              <h2 className="seg-sec-titulo">Relatório</h2>
              <span className="muted small">
                {MODO_LABEL[report.modo] ?? report.modo}
                {report.urlProducao ? ` · ${report.urlProducao}` : ''} · {relTime(finishedAt ?? Date.now())}
              </span>
              <button
                className="btn ghost sm"
                disabled={exportando}
                onClick={() => void exportarPdf(selScan!.reportPath)}
              >
                {exportando ? 'exportando…' : 'Exportar PDF'}
              </button>
            </div>
            {report.resumo && <p className="seg-resumo">{report.resumo}</p>}

            {diff && (
              <div className="seg-diff" title="Comparado com a verificação anterior desta pasta">
                <span className="seg-diff-rot">vs. anterior:</span>
                <span className={`seg-diff-item ${diff.novas ? 'ruim' : ''}`}>+{diff.novas} novas</span>
                {diff.reabertas > 0 && <span className="seg-diff-item ruim">{diff.reabertas} reabertas</span>}
                <span className={`seg-diff-item ${diff.resolvidas ? 'bom' : ''}`}>{diff.resolvidas} resolvidas</span>
                <span className="seg-diff-item">{diff.mantidas} mantidas</span>
              </div>
            )}

            {findingsOrdenados.length === 0 ? (
              <div className="seg-limpo">Nenhuma vulnerabilidade registrada nesta verificação.</div>
            ) : (
              <ul className="seg-findings">
                {findingsOrdenados.map((f) => {
                  const aberto = expandido.has(f.id)
                  const corrigido = f.status === 'corrigido'
                  const cv = parseCvss(f.cvss)
                  return (
                    <li key={f.id} className={`seg-finding sev-borda-${f.severidade} ${corrigido ? 'resolvido' : ''}`}>
                      <button className="seg-finding-cab" onClick={() => toggle(f.id)}>
                        <span className={`sev-badge sev-${f.severidade}`}>{SEV[f.severidade]?.label ?? f.severidade}</span>
                        <span className="seg-finding-titulo">{f.titulo}</span>
                        {cv && (
                          <span className="cvss-nota" title={`CVSS 3.1 ${cv.nivel} · ${cv.vector}`}>
                            {cv.score.toFixed(1)}
                          </span>
                        )}
                        {diff?.novasSig.has(assinatura(f)) && <span className="seg-nova">nova</span>}
                        {f.status && f.status !== 'aberto' && (
                          <span className={`seg-status seg-status-${f.status}`}>{statusLabel(f.status)}</span>
                        )}
                        <span className="seg-finding-seta">{aberto ? '▾' : '▸'}</span>
                      </button>
                      {f.local && <div className="seg-finding-local">{f.local}</div>}
                      {aberto && (
                        <div className="seg-finding-corpo">
                          {f.categoria && (
                            <div className="seg-linha">
                              <span className="seg-rot">categoria</span>
                              <span>{f.categoria}</span>
                            </div>
                          )}
                          {cv && (
                            <div className="seg-linha">
                              <span className="seg-rot">cvss 3.1</span>
                              <span>
                                <b>{cv.score.toFixed(1)}</b> ({cv.nivel}) · <code>{cv.vector}</code>
                              </span>
                            </div>
                          )}
                          <div className="seg-bloco">
                            <span className="seg-rot">o problema</span>
                            <p>{f.descricao}</p>
                          </div>
                          {f.evidencia && (
                            <div className="seg-bloco">
                              <span className="seg-rot">evidência</span>
                              <pre className="seg-evidencia">{f.evidencia}</pre>
                            </div>
                          )}
                          {f.correcao && (
                            <div className="seg-bloco">
                              <span className="seg-rot">como corrigir</span>
                              <p>{f.correcao}</p>
                            </div>
                          )}
                          {f.referencias && f.referencias.length > 0 && (
                            <div className="seg-bloco">
                              <span className="seg-rot">referências</span>
                              <ul className="seg-refs">
                                {f.referencias.map((r) => (
                                  <li key={r}>
                                    <button className="link" onClick={() => void window.api.app.openExternal(r)}>
                                      {r}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="seg-finding-acoes">
                            <button
                              className="btn primario sm"
                              disabled={carregando}
                              onClick={() => void resolveVulnerability(path, selScan!.reportPath, f)}
                            >
                              Resolver vulnerabilidade
                            </button>
                            {!corrigido ? (
                              <button
                                className="btn ghost sm"
                                onClick={() => void setFindingStatus(path, selScan!.reportPath, f.id, 'corrigido')}
                              >
                                Marcar como corrigido
                              </button>
                            ) : (
                              <button
                                className="btn ghost sm"
                                onClick={() => void setFindingStatus(path, selScan!.reportPath, f.id, 'aberto')}
                              >
                                Reabrir
                              </button>
                            )}
                            <button
                              className="btn ghost sm"
                              onClick={() => void setFindingStatus(path, selScan!.reportPath, f.id, 'falso-positivo')}
                            >
                              Falso positivo
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {scans.length === 0 && !carregando && (
          <div className="seg-vazio muted">
            Nenhuma verificação ainda. Escolha um modo acima para o Claude rodar o primeiro pentest.
          </div>
        )}
      </div>
    </div>
  )
}
