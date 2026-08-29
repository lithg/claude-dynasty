import { create } from 'zustand'
import type {
  AppConfig,
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
  settingsOpen: boolean
  panelOpen: boolean
  showHidden: boolean
  filter: string

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
  setActiveTab: (id: string) => void
  markExited: (id: string, code: number) => void

  setSettingsOpen: (v: boolean) => void
  setPanelOpen: (v: boolean) => void
  setShowHidden: (v: boolean) => void
  setFilter: (v: string) => void
  togglePin: (name: string) => Promise<void>
  toggleHidden: (name: string) => Promise<void>
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
  settingsOpen: false,
  panelOpen: true,
  showHidden: false,
  filter: '',

  init: async () => {
    const [config, live, tabs] = await Promise.all([
      window.api.config.get(),
      window.api.sessions.live(),
      window.api.tabs.list()
    ])
    set({ config, live, tabs: tabs.filter((t) => t.exited == null) })
    await get().loadProjects()
    void get().refreshUsage()
    const first = get().projects[0]
    if (tabs.length) {
      const t = tabs[0]
      set({ activeTabId: t.id, activeProject: t.projectPath })
      void get().loadDetails(t.projectPath)
      void get().loadHistory(t.projectPath)
    } else if (first) {
      set({ activeProject: first.path })
      void get().loadDetails(first.path)
      void get().loadHistory(first.path)
    }
  },

  loadProjects: async () => {
    const projects = await window.api.projects.list()
    set({ projects })
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
    // Falha transitória (429, token sendo renovado, rede): tenta de novo em 30s.
    if (usage.error) {
      setTimeout(() => {
        if (get().usage?.error) void get().refreshUsage()
      }, 30_000)
    }
  },

  saveConfig: async (patch) => {
    const config = await window.api.config.set(patch)
    set({ config })
    if ('pinned' in patch || 'hidden' in patch || 'rootDir' in patch) await get().loadProjects()
  },

  selectProject: async (path) => {
    const { tabs, config } = get()
    set({ activeProject: path })
    void get().loadDetails(path, true)
    void get().loadHistory(path)
    const mine = tabs.filter((t) => t.projectPath === path)
    if (mine.length) {
      const current = mine.find((t) => t.id === get().activeTabId)
      set({ activeTabId: current?.id ?? mine[mine.length - 1].id })
    } else if (config?.autoOpenClaude) {
      await get().openClaude(path)
    } else {
      set({ activeTabId: null })
    }
  },

  openClaude: async (path, opts) => {
    const tab = await window.api.pty.spawnClaude({ projectPath: path, ...opts })
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, activeProject: path }))
  },

  openShell: async (path, command) => {
    const tab = await window.api.pty.spawnShell({ projectPath: path, command })
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, activeProject: path }))
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
    set({ activeTabId: id, activeProject: t?.projectPath ?? get().activeProject })
    if (t) {
      void get().loadDetails(t.projectPath)
      void get().loadHistory(t.projectPath)
    }
  },

  markExited: (id, code) => {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, exited: code } : t)) }))
  },

  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  setShowHidden: (v) => set({ showHidden: v }),
  setFilter: (v) => set({ filter: v }),

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
