import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { feedTerm } from '@/lib/terminals'
import { renderTrayIcon } from '@/lib/trayIcon'
import { resolveTheme, type Theme } from '@shared/themes'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import TerminalView from './components/TerminalView'
import ProjectPanel from './components/ProjectPanel'
import SettingsModal from './components/SettingsModal'
import TrayPopup from './components/TrayPopup'

const IS_POPUP = new URLSearchParams(window.location.search).has('popup')

function useSystemDark(): boolean {
  const [sys, setSys] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = (e: MediaQueryListEvent): void => setSys(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return sys
}

const UI_VARS: Record<keyof Theme['ui'], string> = {
  bg: '--bg',
  bg2: '--bg-2',
  bg3: '--bg-3',
  border: '--border',
  fg: '--fg',
  fg2: '--fg-2',
  muted: '--muted',
  accent: '--accent',
  accentFg: '--accent-fg',
  ok: '--ok',
  warn: '--warn',
  danger: '--danger'
}

function applyTheme(t: Theme): void {
  const root = document.documentElement
  for (const [k, v] of Object.entries(UI_VARS)) root.style.setProperty(v, t.ui[k as keyof Theme['ui']])
  root.dataset.theme = t.dark ? 'dark' : 'light'
  root.style.setProperty('color-scheme', t.dark ? 'dark' : 'light')
}

export default function App(): React.JSX.Element {
  if (IS_POPUP) return <TrayPopup />
  return <Main />
}

function Main(): React.JSX.Element {
  const init = useStore((s) => s.init)
  const config = useStore((s) => s.config)
  const tabs = useStore((s) => s.tabs)
  const activeTabId = useStore((s) => s.activeTabId)
  const activeProject = useStore((s) => s.activeProject)
  const panelOpen = useStore((s) => s.panelOpen)
  const projects = useStore((s) => s.projects)
  const systemDark = useSystemDark()
  const theme = useMemo(() => resolveTheme(config?.theme ?? 'dark', systemDark), [config?.theme, systemDark])

  useEffect(() => {
    void init()
    const offData = window.api.pty.onData((id, data) => feedTerm(id, data))
    const offExit = window.api.pty.onExit((id, code) => useStore.getState().markExited(id, code))
    const offLive = window.api.sessions.onLive((live) => useStore.setState({ live }))
    const offUsage = window.api.usage.onUpdate((usage) => {
      if (usage) useStore.setState({ usage })
    })
    const offCfg = window.api.config.onUpdate((config) => useStore.setState({ config }))
    const offTabs = window.api.tabs.onUpdate((tab) => useStore.getState().updateTab(tab))
    const offTray = window.api.tray.onRender((percent) => window.api.tray.rendered(renderTrayIcon(percent)))
    const detailsTimer = setInterval(() => {
      const p = useStore.getState().activeProject
      if (p) void useStore.getState().loadDetails(p, true)
    }, 30_000)
    return () => {
      offData()
      offExit()
      offLive()
      offUsage()
      offCfg()
      offTabs()
      offTray()
      clearInterval(detailsTimer)
    }
  }, [init])

  useEffect(() => applyTheme(theme), [theme])

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
  const fontFamily = theme.font ?? config?.fontFamily ?? 'Consolas, monospace'

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
              colors={theme.term}
              fontSize={config?.fontSize ?? 13}
              fontFamily={fontFamily}
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
      </main>
      {panelOpen && <ProjectPanel />}
      <SettingsModal />
    </div>
  )
}
