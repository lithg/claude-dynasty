import { create } from 'zustand'
import type {
  AppConfig,
  DocInfo,
  HistorySession,
  LiveSession,
  ProjectDetails,
  ProjectInfo,
  TermTab,
  UsageInfo
} from '@shared/types'

interface State {
  config: AppConfig | null
  projects: ProjectInfo[]
  details: Record<string, ProjectDetails>
  history: Record<string, HistorySession[]>
  live: LiveSession[]
  tabs: TermTab[]
  activeTabId: string | null
  activeProject: string | null
  usage: UsageInfo | null
  docs: DocInfo[]
  docsDir: string
  /** documento aberto na área central (quando tem um, o terminal fica de lado) */
  activeDoc: string | null
  docText: string
  docSaving: boolean
  settingsOpen: boolean
  paletteOpen: boolean
  /** imagem aberta em tela cheia (veio de uma miniatura do terminal) */
  lightbox: { tabId: string; path: string; cwd: string } | null
  /** primeira vez que o app abre nesta máquina (sem config.json) */
  firstRun: boolean
  panelOpen: boolean
  showHidden: boolean
  filter: string
  /** caminhos com sessão sendo aberta agora — é o que a página do projeto usa para o loading */
  abrindo: string[]

  init: () => Promise<void>
  loadProjects: () => Promise<void>
  loadDetails: (path: string, force?: boolean) => Promise<void>
  loadHistory: (path: string) => Promise<void>
  refreshUsage: (force?: boolean) => Promise<void>
  saveConfig: (patch: Partial<AppConfig>) => Promise<void>

  selectProject: (path: string) => Promise<void>
  openClaude: (path: string, opts?: { resume?: string; continueLast?: boolean }) => Promise<void>
  openShell: (path: string, command?: string) => Promise<void>
  closeTab: (id: string) => Promise<void>
  /** dá processo a uma aba suspensa/encerrada (claude --resume) */
  resumeTab: (id: string) => Promise<void>
  setActiveTab: (id: string) => void
  markExited: (id: string, code: number) => void
  updateTab: (tab: TermTab) => void
  /** envia /rc para a aba (liga/desliga Remote Control na sessão em andamento) */
  toggleRc: (id: string) => void

  loadDocs: () => Promise<void>
  openDoc: (path: string | null) => Promise<void>
  setDocText: (text: string, salvarJa?: boolean) => void
  createDoc: (nome: string) => Promise<void>
  renameDoc: (path: string, nome: string) => Promise<void>
  removeDoc: (path: string) => Promise<void>
  reorderDocs: (de: string, para: string) => Promise<void>
  reorderProjects: (de: string, para: string) => Promise<void>
  setProjectLabel: (name: string, label: string) => Promise<void>
  createProject: (nome: string) => Promise<void>

  setSettingsOpen: (v: boolean) => void
  setFirstRun: (v: boolean) => void
  setPaletteOpen: (v: boolean) => void
  openLightbox: (tabId: string, path: string, cwd: string) => void
  closeLightbox: () => void
  setPanelOpen: (v: boolean) => void
  setShowHidden: (v: boolean) => void
  setFilter: (v: string) => void
  /** Ctrl+roda no terminal: muda a fonte só deste projeto e guarda no config */
  zoomProject: (projectPath: string, delta: number) => void
  saveImgCard: (projectPath: string, box: { x: number; y: number; w: number; h: number }) => void
  togglePin: (name: string) => Promise<void>
  toggleHidden: (name: string) => Promise<void>
}

/** Nome da pasta = chave de `perProject`. */
export function projectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

let zoomTimer: ReturnType<typeof setTimeout> | null = null
let cardTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Espera o navegador pintar. O `node-pty` bloqueia o processo principal enquanto sobe o ConPTY,
 * e sem isto o spinner só apareceria **depois** do congelamento — ou seja, nunca.
 */
function pintar(): Promise<void> {
  return new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok())))
}
/** gravação adiada do documento aberto (auto save) */
let pendente: { path: string; text: string; timer: ReturnType<typeof setTimeout> } | null = null

function porOrdem<T>(itens: T[], ordem: string[], chave: (x: T) => string): T[] {
  const peso = new Map(ordem.map((n, i) => [n, i]))
  return [...itens].sort((a, b) => {
    const ia = peso.get(chave(a))
    const ib = peso.get(chave(b))
    if (ia != null && ib != null) return ia - ib
    if (ia != null) return -1
    if (ib != null) return 1
    return 0
  })
}

function ordenarDocs(docs: DocInfo[], ordem: string[]): DocInfo[] {
  return porOrdem(docs, ordem, (d) => d.name)
}

function ordenarProjetos(projects: ProjectInfo[], ordem: string[]): ProjectInfo[] {
  return porOrdem(projects, ordem, (p) => p.name)
}

export const useStore = create<State>((set, get) => ({
  config: null,
  projects: [],
  details: {},
  history: {},
  live: [],
  tabs: [],
  activeTabId: null,
  activeProject: null,
  usage: null,
  docs: [],
  docsDir: '',
  activeDoc: null,
  docText: '',
  docSaving: false,
  settingsOpen: false,
  paletteOpen: false,
  lightbox: null,
  firstRun: false,
  // painel do projeto começa fechado: quem abre o app quer o terminal, não a ficha do projeto
  panelOpen: false,
  showHidden: false,
  filter: '',
  abrindo: [],

  init: async () => {
    const [config, live, tabs, firstRun] = await Promise.all([
      window.api.config.get(),
      window.api.sessions.live(),
      window.api.tabs.list(),
      window.api.app.firstRun()
    ])
    set({ config, live, tabs: tabs.filter((t) => t.exited == null), firstRun })
    await get().loadProjects()
    void get().loadDocs()
    void get().refreshUsage()
    // Nada de projeto pré-selecionado: abrir o app não escolhe trabalho por você. Antes isto
    // caía na primeira aba restaurada (ou no primeiro projeto da lista), e dava a impressão de
    // que um projeto qualquer "grudava" na abertura.
  },

  loadProjects: async () => {
    const projects = await window.api.projects.list()
    set({ projects: ordenarProjetos(projects, get().config?.projectOrder ?? []) })
  },

  loadDetails: async (path, force) => {
    if (!force && get().details[path]) return
    const d = await window.api.projects.details(path)
    set((s) => ({ details: { ...s.details, [path]: d } }))
  },

  loadHistory: async (path) => {
    const h = await window.api.sessions.history(path)
    set((s) => ({ history: { ...s.history, [path]: h } }))
  },

  refreshUsage: async (force = false) => {
    const usage = await window.api.usage.get(force)
    set({ usage })
    // O main já tem cache/backoff; aqui só repete em falha sem dado nenhum (ex.: token renovando).
    if (usage.error && !usage.limits.length) {
      setTimeout(() => {
        if (get().usage?.error && !get().usage?.limits.length) void get().refreshUsage()
      }, 90_000)
    }
  },

  saveConfig: async (patch) => {
    const config = await window.api.config.set(patch)
    set({ config })
    if ('pinned' in patch || 'hidden' in patch || 'rootDir' in patch) await get().loadProjects()
  },

  /**
   * Clicar num projeto **nunca** abre sessão: só vai para uma que já esteja de pé, senão mostra a
   * página do projeto (`ProjectHome`), de onde você escolhe o que fazer. Antes ele spawnava o
   * `claude` sozinho, e o `node-pty` bloqueando o processo principal travava a janela inteira sem
   * nenhum aviso na tela.
   */
  selectProject: async (path) => {
    const { tabs } = get()
    set({ activeProject: path, activeDoc: null })
    void get().loadDetails(path, true)
    void get().loadHistory(path)
    // Só conta aba com processo de pé: suspensa (restaurada) ou encerrada não vale como sessão.
    const vivas = tabs.filter((t) => t.projectPath === path && !t.suspended && t.exited == null)
    const atual = vivas.find((t) => t.id === get().activeTabId)
    set({ activeTabId: atual?.id ?? vivas[vivas.length - 1]?.id ?? null })
  },

  openClaude: async (path, opts) => {
    if (get().abrindo.includes(path)) return // dois cliques rápidos não abrem duas sessões
    set((s) => ({ abrindo: [...s.abrindo, path] }))
    try {
      await pintar()
      const tab = await window.api.pty.spawnClaude({ projectPath: path, ...opts })
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, activeProject: path }))
    } finally {
      set((s) => ({ abrindo: s.abrindo.filter((p) => p !== path) }))
    }
  },

  openShell: async (path, command) => {
    if (get().abrindo.includes(path)) return
    set((s) => ({ abrindo: [...s.abrindo, path] }))
    try {
      await pintar()
      const tab = await window.api.pty.spawnShell({ projectPath: path, command })
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, activeProject: path }))
    } finally {
      set((s) => ({ abrindo: s.abrindo.filter((p) => p !== path) }))
    }
  },

  resumeTab: async (id) => {
    const alvo = get().tabs.find((t) => t.id === id)
    const path = alvo?.projectPath ?? id
    if (get().abrindo.includes(path)) return
    set((s) => ({ abrindo: [...s.abrindo, path] }))
    try {
      await pintar()
      const tab = await window.api.pty.resume(id)
      if (tab) set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...tab } : t)), activeTabId: id }))
    } finally {
      set((s) => ({ abrindo: s.abrindo.filter((p) => p !== path) }))
    }
  },

  closeTab: async (id) => {
    await window.api.pty.kill(id)
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeTabId = s.activeTabId
      if (activeTabId === id) {
        const sameProject = tabs.filter((t) => t.projectPath === s.activeProject)
        activeTabId = sameProject[sameProject.length - 1]?.id ?? tabs[tabs.length - 1]?.id ?? null
      }
      return { tabs, activeTabId }
    })
  },

  setActiveTab: (id) => {
    const t = get().tabs.find((x) => x.id === id)
    set({ activeTabId: id, activeProject: t?.projectPath ?? get().activeProject, activeDoc: null })
    if (t) {
      void get().loadDetails(t.projectPath)
      void get().loadHistory(t.projectPath)
    }
  },

  markExited: (id, code) => {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, exited: code } : t)) }))
  },

  updateTab: (tab) => {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, ...tab } : t)) }))
  },

  toggleRc: (id) => {
    window.api.pty.write(id, '/rc')
    setTimeout(() => window.api.pty.write(id, '\r'), 150)
  },

  loadDocs: async () => {
    const [docs, docsDir] = await Promise.all([window.api.docs.list(), window.api.docs.dir()])
    set({ docs: ordenarDocs(docs, get().config?.docsOrder ?? []), docsDir })
    // documento aberto sumiu (renomeado/apagado por fora)
    const aberto = get().activeDoc
    if (aberto && !docs.some((d) => d.path === aberto)) set({ activeDoc: null, docText: '' })
  },

  openDoc: async (path) => {
    if (pendente) {
      clearTimeout(pendente.timer)
      await window.api.docs.write(pendente.path, pendente.text)
      pendente = null
    }
    if (!path) {
      set({ activeDoc: null, docText: '' })
      return
    }
    const texto = await window.api.docs.read(path).catch(() => '')
    set({ activeDoc: path, docText: texto, docSaving: false })
  },

  setDocText: (text, salvarJa) => {
    const path = get().activeDoc
    if (!path) return
    set({ docText: text, docSaving: true })
    if (pendente) clearTimeout(pendente.timer)
    const gravar = async (): Promise<void> => {
      pendente = null
      await window.api.docs.write(path, text).catch(() => undefined)
      if (get().activeDoc === path) set({ docSaving: false })
      void get().loadDocs()
    }
    pendente = { path, text, timer: setTimeout(() => void gravar(), salvarJa ? 0 : 700) }
  },

  createDoc: async (nome) => {
    const doc = await window.api.docs.create(nome)
    // entra no fim da lista: a ordem manual precisa conter todos, senão o novo pularia para o topo
    const ordem = [...get().docs.map((d) => d.name).filter((n) => n !== doc.name), doc.name]
    await get().saveConfig({ docsOrder: ordem })
    await get().loadDocs()
    await get().openDoc(doc.path)
  },

  renameDoc: async (path, nome) => {
    const antigo = get().docs.find((d) => d.path === path)
    const doc = await window.api.docs.rename(path, nome)
    const cfg = get().config
    if (cfg && antigo) {
      const docsOrder = cfg.docsOrder.map((n) => (n === antigo.name ? doc.name : n))
      await get().saveConfig({ docsOrder: docsOrder.includes(doc.name) ? docsOrder : [...docsOrder, doc.name] })
    }
    await get().loadDocs()
    if (get().activeDoc === path) set({ activeDoc: doc.path })
  },

  removeDoc: async (path) => {
    await window.api.docs.remove(path)
    if (get().activeDoc === path) set({ activeDoc: null, docText: '' })
    await get().loadDocs()
  },

  reorderDocs: async (de, para) => {
    const nomes = get().docs.map((d) => d.name)
    const i = nomes.indexOf(de)
    const j = nomes.indexOf(para)
    if (i < 0 || j < 0 || i === j) return
    nomes.splice(j, 0, ...nomes.splice(i, 1))
    await get().saveConfig({ docsOrder: nomes })
    set({ docs: ordenarDocs(get().docs, nomes) })
  },

  reorderProjects: async (de, para) => {
    const nomes = get().projects.map((p) => p.name)
    const i = nomes.indexOf(de)
    const j = nomes.indexOf(para)
    if (i < 0 || j < 0 || i === j) return
    nomes.splice(j, 0, ...nomes.splice(i, 1))
    await get().saveConfig({ projectOrder: nomes })
    await get().loadProjects()
  },

  setProjectLabel: async (name, label) => {
    const cfg = get().config
    if (!cfg) return
    const atual = cfg.perProject[name] ?? {}
    const proximo = { ...atual, label: label.trim() || undefined }
    await get().saveConfig({ perProject: { ...cfg.perProject, [name]: proximo } })
  },

  createProject: async (nome) => {
    const dir = await window.api.projects.create(nome)
    await get().loadProjects()
    await get().selectProject(dir)
  },

  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setFirstRun: (v) => set({ firstRun: v }),
  openLightbox: (tabId, path, cwd) => set({ lightbox: { tabId, path, cwd } }),
  closeLightbox: () => set({ lightbox: null }),

  setPaletteOpen: (v) => set({ paletteOpen: v }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  setShowHidden: (v) => set({ showHidden: v }),
  setFilter: (v) => set({ filter: v }),

  zoomProject: (projectPath, delta) => {
    const cfg = get().config
    if (!cfg) return
    const name = projectName(projectPath)
    const current = cfg.perProject[name]?.fontSize ?? cfg.fontSize
    const next = Math.min(32, Math.max(8, current + delta))
    if (next === current) return
    const perProject = { ...cfg.perProject, [name]: { ...(cfg.perProject[name] ?? {}), fontSize: next } }
    set({ config: { ...cfg, perProject } })
    // grava depois da rajada de scroll, senão escreve o config.json a cada clique da roda
    if (zoomTimer) clearTimeout(zoomTimer)
    zoomTimer = setTimeout(() => {
      zoomTimer = null
      void window.api.config.set({ perProject: get().config!.perProject })
    }, 400)
  },

  /** posição/tamanho do cartão de imagem, gravados depois do arrasto (não a cada pixel) */
  saveImgCard: (projectPath, box) => {
    const cfg = get().config
    if (!cfg) return
    const name = projectName(projectPath)
    const perProject = { ...cfg.perProject, [name]: { ...(cfg.perProject[name] ?? {}), imgCard: box } }
    set({ config: { ...cfg, perProject } })
    if (cardTimer) clearTimeout(cardTimer)
    cardTimer = setTimeout(() => {
      cardTimer = null
      void window.api.config.set({ perProject: get().config!.perProject })
    }, 400)
  },

  togglePin: async (name) => {
    const cfg = get().config!
    const pinned = cfg.pinned.includes(name) ? cfg.pinned.filter((n) => n !== name) : [...cfg.pinned, name]
    await get().saveConfig({ pinned })
  },

  toggleHidden: async (name) => {
    const cfg = get().config!
    const hidden = cfg.hidden.includes(name) ? cfg.hidden.filter((n) => n !== name) : [...cfg.hidden, name]
    await get().saveConfig({ hidden })
  }
}))
