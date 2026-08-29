import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { feedTerm } from '@/lib/terminals'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import TerminalView from './components/TerminalView'
import PromptBox from './components/PromptBox'
import ProjectPanel from './components/ProjectPanel'
import SettingsModal from './components/SettingsModal'

function useDark(theme: 'dark' | 'light' | 'system' | undefined): boolean {
  const [sys, setSys] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = (e: MediaQueryListEvent): void => setSys(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return theme === 'system' || !theme ? sys : theme === 'dark'
}

export default function App(): React.JSX.Element {
  const init = useStore((s) => s.init)
  const config = useStore((s) => s.config)
  const tabs = useStore((s) => s.tabs)
  const activeTabId = useStore((s) => s.activeTabId)
  const activeProject = useStore((s) => s.activeProject)
  const panelOpen = useStore((s) => s.panelOpen)
  const projects = useStore((s) => s.projects)
  const dark = useDark(config?.theme)

  useEffect(() => {
    void init()
    const offData = window.api.pty.onData((id, data) => feedTerm(id, data))
    const offExit = window.api.pty.onExit((id, code) => useStore.getState().markExited(id, code))
    const offLive = window.api.sessions.onLive((live) => useStore.setState({ live }))
    const usageTimer = setInterval(() => void useStore.getState().refreshUsage(), 60_000)
    const detailsTimer = setInterval(() => {
      const p = useStore.getState().activeProject
      if (p) void useStore.getState().loadDetails(p, true)
    }, 30_000)
    return () => {
      offData()
      offExit()
      offLive()
      clearInterval(usageTimer)
      clearInterval(detailsTimer)
    }
  }, [init])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey) return
      const s = useStore.getState()
      const key = e.key.toLowerCase()
      if (key === 't' && s.activeProject) {
        e.preventDefault()
        void s.openClaude(s.activeProject)
      } else if (key === 'w' && s.activeTabId) {
        e.preventDefault()
        void s.closeTab(s.activeTabId)
      } else if (key === 'tab') {
        e.preventDefault()
        const mine = s.tabs.filter((t) => t.projectPath === s.activeProject)
        if (mine.length < 2) return
        const i = mine.findIndex((t) => t.id === s.activeTabId)
        const next = mine[(i + (e.shiftKey ? -1 : 1) + mine.length) % mine.length]
        s.setActiveTab(next.id)
      } else if (key === ',') {
        e.preventDefault()
        s.setSettingsOpen(true)
      } else if (key === 'b') {
        e.preventDefault()
        s.setPanelOpen(!s.panelOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const project = projects.find((p) => p.path === activeProject)

  return (
    <div className={`app ${panelOpen ? '' : 'no-panel'}`}>
      <TopBar />
      <Sidebar />
      <main className="main">
        <TabBar />
        <div className="term-area">
          {tabs.map((t) => (
            <TerminalView
              key={t.id}
              tab={t}
              visible={t.id === activeTabId}
              dark={dark}
              fontSize={config?.fontSize ?? 13}
              fontFamily={config?.fontFamily ?? 'Consolas, monospace'}
            />
          ))}
          {!activeTab && (
            <div className="empty-state">
              {project ? (
                <>
                  <div className="empty-title">{project.name}</div>
                  <div className="muted">Nenhuma aba aberta neste projeto.</div>
                  <div className="row gap">
                    <button className="btn" onClick={() => void useStore.getState().openClaude(project.path)}>
                      Abrir Claude
                    </button>
                    <button className="btn ghost" onClick={() => void useStore.getState().openClaude(project.path, { continueLast: true })}>
                      Continuar última
                    </button>
                    <button className="btn ghost" onClick={() => void useStore.getState().openShell(project.path)}>
                      Shell
                    </button>
                  </div>
                </>
              ) : (
                <div className="muted">Escolha um projeto na esquerda.</div>
              )}
            </div>
          )}
        </div>
        {activeTab && activeTab.kind === 'claude' && activeTab.exited == null && <PromptBox tabId={activeTab.id} />}
      </main>
      {panelOpen && <ProjectPanel />}
      <SettingsModal />
    </div>
  )
}
