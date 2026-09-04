import { useStore } from '@/store'
import { sessionsFor } from './Sidebar'
import { relTime, STACK_LABEL } from '@/lib/format'
import { render } from '@/lib/markdown'

/**
 * Página inicial de um projeto sem sessão aberta.
 *
 * Antes daqui existia só um `empty-state` de três botões, e clicar no projeto **abria uma sessão
 * sozinho** — o `node-pty` bloqueia o processo principal enquanto sobe o ConPTY, então a janela
 * inteira travava sem nenhum aviso. Agora clicar no projeto não abre nada: mostra isto, e quem
 * escolhe é você. O congelamento continua existindo (é o spawn), mas agora com um aviso na tela.
 */
export default function ProjectHome(): React.JSX.Element {
  const activeProject = useStore((s) => s.activeProject)
  const projects = useStore((s) => s.projects)
  const details = useStore((s) => s.details)
  const history = useStore((s) => s.history)
  const live = useStore((s) => s.live)
  const tabs = useStore((s) => s.tabs)
  const config = useStore((s) => s.config)
  const abrindo = useStore((s) => s.abrindo)
  const openClaude = useStore((s) => s.openClaude)
  const openShell = useStore((s) => s.openShell)
  const resumeTab = useStore((s) => s.resumeTab)
  const setActiveTab = useStore((s) => s.setActiveTab)

  if (!activeProject) {
    return (
      <div className="home vazio">
        <div className="home-nada">
          <div className="home-nada-titulo">Escolha um projeto na esquerda</div>
          <div className="muted">
            Nada é aberto sozinho. Você escolhe abrir sessão nova, continuar a última ou retomar uma
            do histórico.
          </div>
        </div>
      </div>
    )
  }

  const p = projects.find((x) => x.path === activeProject)
  const d = details[activeProject]
  const h = history[activeProject] ?? []
  const vivas = sessionsFor(live, activeProject)
  const suspensas = tabs.filter((t) => t.projectPath === activeProject && (t.suspended || t.exited != null))
  const nome = (p && config?.perProject[p.name]?.label) || p?.name || activeProject
  const carregando = abrindo.includes(activeProject)
  const cmd = d?.claudeMd

  return (
    <div className="home">
      <div className="home-rolo">
        <header className="home-topo">
          <div className="home-titulo-linha">
            <h1 className="home-titulo">{nome}</h1>
            {p?.stacks.map((s) => (
              <span key={s} className="chip">
                {STACK_LABEL[s] ?? s}
              </span>
            ))}
          </div>
          <button
            className="home-caminho"
            title="abrir a pasta no Explorer"
            onClick={() => void window.api.projects.openExplorer(activeProject)}
          >
            {activeProject}
          </button>
          {cmd?.summary && <p className="home-resumo">{cmd.summary}</p>}
        </header>

        <div className="home-status">
          {d?.git ? (
            <>
              <Status rotulo="branch" valor={d.git.branch} />
              <Status
                rotulo="working tree"
                valor={d.git.dirty ? `${d.git.dirty} alterado(s)` : 'limpo'}
                tom={d.git.dirty ? 'warn' : 'ok'}
              />
              {(d.git.ahead > 0 || d.git.behind > 0) && (
                <Status
                  rotulo="remoto"
                  valor={`${d.git.ahead ? `${d.git.ahead} à frente` : ''}${d.git.ahead && d.git.behind ? ' · ' : ''}${d.git.behind ? `${d.git.behind} atrás` : ''}`}
                  tom="warn"
                />
              )}
              <Status rotulo="último commit" valor={relTime(d.git.lastCommitAt)} titulo={d.git.lastCommit} />
            </>
          ) : (
            <Status rotulo="git" valor="sem repositório" />
          )}
          <Status
            rotulo="sessões vivas"
            valor={vivas.length ? `${vivas.length}` : 'nenhuma'}
            tom={vivas.some((s) => s.status === 'busy') ? 'ok' : undefined}
          />
        </div>

        <div className="home-acoes">
          <button className="btn primario" disabled={carregando} onClick={() => void openClaude(activeProject)}>
            Abrir sessão do Claude
          </button>
          <button
            className="btn"
            disabled={carregando}
            title="claude --continue: retoma a conversa mais recente desta pasta"
            onClick={() => void openClaude(activeProject, { continueLast: true })}
          >
            Continuar a última
          </button>
          <button className="btn ghost" disabled={carregando} onClick={() => void openShell(activeProject)}>
            Shell
          </button>
          <button className="btn ghost" onClick={() => void window.api.projects.openExplorer(activeProject)}>
            Explorer
          </button>
          <button className="btn ghost" onClick={() => void window.api.projects.openVsCode(activeProject)}>
            VS Code
          </button>
        </div>

        {(vivas.length > 0 || suspensas.length > 0) && (
          <section className="home-sec">
            <h2 className="home-sec-titulo">Sessões desta pasta</h2>
            <ul className="home-lista">
              {vivas.map((s) => {
                const aba = tabs.find((t) => t.id === s.tabId)
                return (
                  <li key={s.pid}>
                    <span className={`dot ${s.status === 'busy' ? 'busy' : 'idle'}`} />
                    <span className="home-lista-nome">{aba?.title ?? s.name ?? `pid ${s.pid}`}</span>
                    <span className="muted small">
                      {s.status === 'busy' ? 'trabalhando' : 'ocioso'} · {relTime(s.updatedAt)}
                      {!s.tabId && ' · fora do wrapper'}
                    </span>
                    {s.tabId && (
                      <button className="btn sm" onClick={() => setActiveTab(s.tabId!)}>
                        ir para
                      </button>
                    )}
                  </li>
                )
              })}
              {suspensas.map((t) => (
                <li key={t.id}>
                  <span className="dot dead" />
                  <span className="home-lista-nome">{t.title}</span>
                  <span className="muted small">{t.suspended ? 'suspensa' : 'encerrada'}</span>
                  <button className="btn sm" disabled={carregando} onClick={() => void resumeTab(t.id)}>
                    retomar
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {h.length > 0 && (
          <section className="home-sec">
            <h2 className="home-sec-titulo">Histórico de sessões</h2>
            <ul className="home-lista">
              {h.slice(0, 8).map((s) => (
                <li key={s.sessionId}>
                  <span className="home-lista-nome" title={s.firstPrompt}>
                    {s.title}
                  </span>
                  <span className="muted small">
                    {relTime(s.mtime)}
                    {s.gitBranch && ` · ${s.gitBranch}`}
                  </span>
                  <button
                    className="btn sm"
                    disabled={carregando}
                    onClick={() => void openClaude(activeProject, { resume: s.sessionId })}
                  >
                    retomar
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="home-sec">
          <h2 className="home-sec-titulo">CLAUDE.md</h2>
          {cmd?.raw ? (
            <div className="home-md markdown" dangerouslySetInnerHTML={{ __html: render(cmd.raw) }} />
          ) : (
            <div className="home-sem-md muted">
              Este projeto ainda não tem um <code>CLAUDE.md</code>. É o arquivo que o Claude Code lê
              como contexto — abra uma sessão e peça <code>/init</code> para ele escrever o primeiro.
            </div>
          )}
        </section>
      </div>

      {carregando && (
        <div className="home-carregando">
          <div className="home-carregando-caixa">
            <span className="rodela" />
            <div>
              <div className="home-carregando-titulo">Abrindo sessão…</div>
              <div className="muted small">A janela pode travar por um instante enquanto o terminal sobe.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Status({
  rotulo,
  valor,
  tom,
  titulo
}: {
  rotulo: string
  valor: string
  tom?: 'ok' | 'warn'
  titulo?: string
}): React.JSX.Element {
  return (
    <div className="home-status-item" title={titulo}>
      <span className="home-status-rotulo">{rotulo}</span>
      <span className={`home-status-valor ${tom ?? ''}`}>{valor}</span>
    </div>
  )
}
