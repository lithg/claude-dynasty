export type StackKind =
  | 'node'
  | 'laravel'
  | 'php'
  | 'flutter'
  | 'godot'
  | 'python'
  | 'rust'
  | 'go'
  | 'unity'
  | 'next'
  | 'vue'
  | 'react'

export interface ProjectInfo {
  id: string
  name: string
  path: string
  hasGit: boolean
  hasClaudeMd: boolean
  stacks: StackKind[]
  pinned: boolean
  hidden: boolean
  mtime: number
}

export interface GitInfo {
  branch: string
  dirty: number
  ahead: number
  behind: number
  lastCommit: string
  lastCommitAt: number
  remote?: string
}

export interface ClaudeMdInfo {
  title?: string
  summary?: string
  urls: string[]
  ssh: string[]
  sections: { title: string; body: string }[]
  raw: string
}

export interface ProjectDetails {
  path: string
  git?: GitInfo
  claudeMd?: ClaudeMdInfo
  scripts?: Record<string, string>
  scriptsRunner?: 'npm' | 'pnpm' | 'yarn' | 'bun'
}

export interface LiveSession {
  pid: number
  sessionId: string
  cwd: string
  /** idle | busy | ... (vem do ~/.claude/sessions/<pid>.json) */
  status: string
  name: string
  startedAt: number
  updatedAt: number
  version: string
  /** Remote Control: id da ponte com claude.ai (https://claude.ai/code/<id>) */
  bridgeSessionId?: string
  /** modelo da última resposta no transcript (ex.: claude-opus-5) */
  model?: string
  /** id da aba do wrapper, se a sessão foi aberta por ele */
  tabId?: string
}

export interface HistorySession {
  sessionId: string
  title: string
  firstPrompt?: string
  mtime: number
  size: number
  gitBranch?: string
}

export type TabKind = 'claude' | 'shell'

export interface TermTab {
  id: string
  projectPath: string
  kind: TabKind
  title: string
  sessionId?: string
  createdAt: number
  pid: number
  exited?: number | null
  /** restaurada da execução anterior: aparece na barra, mas só ganha processo ao ser retomada */
  suspended?: boolean
}

export interface DocInfo {
  /** nome do arquivo, com .md */
  name: string
  path: string
  /** primeiro `# titulo` do arquivo, ou o nome do arquivo */
  title: string
  mtime: number
  size: number
}

export interface ProjectOverride {
  skipPermissions?: boolean
  /** tamanho da fonte do terminal deste projeto (Ctrl+roda do mouse) */
  fontSize?: number
  model?: string
  effort?: string
  extraArgs?: string
  label?: string
  /** abrir novas sessões já com --remote-control */
  remoteControl?: boolean
  /** onde e de que tamanho nasce o cartão de imagem no terminal (você arrasta, ele lembra) */
  imgCard?: { x: number; y: number; w: number; h: number }
  /** agendamento de verificações de segurança deste projeto */
  securitySchedule?: SecuritySchedule
}

export interface AppConfig {
  rootDir: string
  pinned: string[]
  hidden: string[]
  skipPermissions: boolean
  perProject: Record<string, ProjectOverride>
  /** id em THEMES ou 'system' */
  theme: string
  fontSize: number
  fontFamily: string
  claudeBin: string
  shell: string
  extraArgs: string
  model: string
  effort: string
  notifyOnIdle: boolean
  /** notificar também sessões abertas fora do wrapper (Warp, terminal, etc.) */
  notifyExternal: boolean
  /** fechar a janela esconde na bandeja em vez de sair (sessões continuam vivas) */
  closeToTray: boolean
  /** padrão global: abrir sessões com --remote-control */
  remoteControl: boolean
  /** reabrir as abas da última execução (suspensas; retomam com --resume ao clicar) */
  restoreTabs: boolean
  /** sugerir sozinho a resposta quando o Claude termina (faixa acima do terminal, Tab aceita) */
  autoSuggest: boolean
  /** iniciar com o Windows, escondido na bandeja */
  startWithWindows: boolean
  /** pasta dos documentos ('' = <rootDir>/Documentacao) */
  docsDir: string
  /** ordem manual dos documentos (nomes de arquivo); o resto vai em ordem alfabética */
  docsOrder: string[]
  /** ordem manual dos projetos (nomes de pasta); o resto vai depois, por mtime */
  projectOrder: string[]
  /** miniatura clicável em cima dos caminhos de imagem que o Claude escreve no terminal */
  inlineImages: boolean
  windowBounds?: { x?: number; y?: number; width: number; height: number; maximized?: boolean }
}

export interface UsageLimit {
  kind: string
  label: string
  percent: number
  resetsAt: string | null
  isActive: boolean
}

export interface UsageInfo {
  limits: UsageLimit[]
  credits: { percent: number; used?: number; limit?: number; currency: string } | null
  fetchedAt: number
  error?: string
  /** limits vêm da última consulta boa; a atual falhou (ver error) */
  stale?: boolean
}

export interface SpawnClaudeOpts {
  projectPath: string
  resume?: string
  continueLast?: boolean
  cols?: number
  rows?: number
  /** mensagem já enviada à sessão recém-aberta (passada como argumento posicional do claude) */
  initialPrompt?: string
}

/* ---------------- Segurança (pentests) ---------------- */

export type Severity = 'critica' | 'alta' | 'media' | 'baixa' | 'info'
export type ScanMode = 'basico' | 'completo' | 'customizado'
export type FindingStatus = 'aberto' | 'corrigido' | 'aceito' | 'falso-positivo'

/** Uma vulnerabilidade no relatório (o Claude escreve isto seguindo o manual). */
export interface SecurityFinding {
  id: string
  titulo: string
  severidade: Severity
  categoria?: string
  /** arquivo:linha, endpoint, ou dependência@versão */
  local?: string
  descricao: string
  evidencia?: string
  correcao?: string
  referencias?: string[]
  status?: FindingStatus
  /** vetor CVSS 3.1 (ex.: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"); o app calcula a nota */
  cvss?: string
}

/** Agendamento de verificações de um projeto (guardado em perProject[nome].securitySchedule). */
export interface SecuritySchedule {
  /** intervalo em dias entre verificações recomendadas */
  everyDays: number
  mode: ScanMode
  prodUrl?: string
  /** rodar sozinho quando vencer (senão só notifica) */
  auto?: boolean
}

/** O relatório inteiro — arquivo `relatorio.json` de uma verificação. */
export interface SecurityReport {
  versao: number
  projeto: string
  modo: ScanMode | string
  urlProducao?: string
  geradoEm: string
  resumo?: string
  findings: SecurityFinding[]
}

/** Resumo de uma verificação para a lista/histórico (não carrega os findings inteiros). */
export interface ScanInfo {
  id: string
  projectPath: string
  modo: string
  reportPath: string
  startedAt: number
  finishedAt?: number
  hasReport: boolean
  /** total de findings por severidade (todos os status) */
  counts?: Record<Severity, number>
  /** findings ainda abertos por severidade (exclui corrigido/aceito/falso-positivo) */
  openCounts?: Record<Severity, number>
  resumo?: string
}

export interface StartScanOpts {
  projectPath: string
  mode: ScanMode
  prodUrl?: string
  custom?: string
  cols?: number
  rows?: number
}

export interface SpawnShellOpts {
  projectPath: string
  command?: string
  cols?: number
  rows?: number
}

/** Imagem encontrada no terminal, já resolvida e reduzida pelo main. */
export interface ImageThumb {
  path: string
  size: number
  /** dimensões do original (0 quando o nativeImage não decodifica, ex.: SVG) */
  width: number
  height: number
  /** data URL da miniatura */
  thumb: string
}

/** A mesma imagem em tamanho cheio, para o lightbox. */
export interface ImageFull {
  path: string
  size: number
  width: number
  height: number
  url: string
}
