import { app, BrowserWindow, ipcMain, Menu, Notification, shell, nativeTheme, clipboard, Tray } from 'electron'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import type {
  AppConfig,
  LiveSession,
  SpawnClaudeOpts,
  SpawnShellOpts,
  TermTab
} from '@shared/types'
import { getConfig, setConfig, configPath } from './config'
import { listProjects, projectDetails } from './projects'
import { LiveSessionWatcher, readHistory, readLiveSessions } from './claudeSessions'
import { PtyManager } from './pty'
import { resolveClaudeBin } from './claudeBin'
import { fetchUsage } from './usage'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let ptys: PtyManager
let watcher: LiveSessionWatcher
let quitting = false
const tabs = new Map<string, TermTab>()

const RESOURCES = join(__dirname, '../../resources')
const APP_NAME = 'Claude Wrapper'

function showWindow(): void {
  if (!win || win.isDestroyed()) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

function splitArgs(s: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s ?? ''))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

function createWindow(): void {
  const cfg = getConfig()
  const b = cfg.windowBounds
  nativeTheme.themeSource = cfg.theme
  win = new BrowserWindow({
    width: b?.width ?? 1500,
    height: b?.height ?? 920,
    x: b?.x,
    y: b?.y,
    minWidth: 900,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: cfg.theme === 'light' ? '#f5f5f4' : '#0f1115',
    title: APP_NAME,
    icon: join(RESOURCES, 'icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (b?.maximized) win.maximize()
  win.once('ready-to-show', () => win?.show())

  const saveBounds = (): void => {
    if (!win) return
    const maximized = win.isMaximized()
    const nb = win.getNormalBounds()
    setConfig({ windowBounds: { ...nb, maximized } })
  }
  win.on('close', (e) => {
    saveBounds()
    // Fechar = esconder na bandeja (as sessões continuam vivas). Sair de verdade pelo menu da bandeja.
    if (!quitting && getConfig().closeToTray && tray) {
      e.preventDefault()
      win?.hide()
    }
  })
  win.on('closed', () => {
    win = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('config:get', () => getConfig())
  ipcMain.handle('config:set', (_e, patch: Partial<AppConfig>) => {
    const next = setConfig(patch)
    if (patch.theme) nativeTheme.themeSource = patch.theme
    return next
  })
  ipcMain.handle('config:path', () => configPath())

  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:details', (_e, path: string) => projectDetails(path))
  ipcMain.handle('projects:openExplorer', (_e, path: string) => shell.openPath(path))
  ipcMain.handle('projects:openVsCode', (_e, path: string) => {
    execFile('cmd.exe', ['/c', 'code', path], { windowsHide: true }, () => undefined)
  })

  ipcMain.handle('sessions:live', () => readLiveSessions())
  ipcMain.handle('sessions:history', (_e, path: string) => readHistory(path))

  ipcMain.handle('usage:get', () => fetchUsage())

  ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('app:copy', (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle('app:claudeBin', () => resolveClaudeBin())

  ipcMain.handle('tabs:list', () => Array.from(tabs.values()))

  ipcMain.handle('pty:spawnClaude', (_e, opts: SpawnClaudeOpts): TermTab => {
    const cfg = getConfig()
    const name = basename(opts.projectPath)
    const ov = cfg.perProject[name] ?? {}
    const bin = resolveClaudeBin()
    const args = [...bin.args]

    const skip = ov.skipPermissions ?? cfg.skipPermissions
    if (skip) args.push('--dangerously-skip-permissions')
    const model = ov.model || cfg.model
    if (model) args.push('--model', model)
    const effort = ov.effort || cfg.effort
    if (effort) args.push('--effort', effort)

    let sessionId: string | undefined
    if (opts.resume) {
      args.push('--resume', opts.resume)
      sessionId = opts.resume
    } else if (opts.continueLast) {
      args.push('--continue')
    } else {
      sessionId = randomUUID()
      args.push('--session-id', sessionId)
    }
    args.push(...splitArgs(cfg.extraArgs), ...splitArgs(ov.extraArgs ?? ''))

    const id = randomUUID()
    const pid = ptys.spawn(id, {
      file: bin.file,
      args,
      cwd: opts.projectPath,
      cols: opts.cols,
      rows: opts.rows
    })
    const tab: TermTab = {
      id,
      projectPath: opts.projectPath,
      kind: 'claude',
      title: opts.resume ? 'claude (resume)' : opts.continueLast ? 'claude (continue)' : 'claude',
      sessionId,
      createdAt: Date.now(),
      pid
    }
    tabs.set(id, tab)
    return tab
  })

  ipcMain.handle('pty:spawnShell', (_e, opts: SpawnShellOpts): TermTab => {
    const cfg = getConfig()
    const id = randomUUID()
    const file = cfg.shell || 'powershell.exe'
    const args = /powershell|pwsh/i.test(file) ? ['-NoLogo'] : []
    const pid = ptys.spawn(id, { file, args, cwd: opts.projectPath, cols: opts.cols, rows: opts.rows })
    const tab: TermTab = {
      id,
      projectPath: opts.projectPath,
      kind: 'shell',
      title: opts.command ? opts.command.slice(0, 24) : 'shell',
      createdAt: Date.now(),
      pid
    }
    tabs.set(id, tab)
    if (opts.command) {
      const cmd = opts.command
      setTimeout(() => ptys.write(id, cmd + '\r'), 700)
    }
    return tab
  })

  ipcMain.on('pty:write', (_e, id: string, data: string) => ptys.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptys.resize(id, cols, rows))
  ipcMain.handle('pty:kill', (_e, id: string) => {
    ptys.kill(id)
    tabs.delete(id)
  })
}

function attachTabIds(sessions: LiveSession[]): LiveSession[] {
  const byId = new Map<string, string>()
  for (const t of tabs.values()) if (t.sessionId) byId.set(t.sessionId, t.id)
  return sessions.map((s) => ({ ...s, tabId: byId.get(s.sessionId) }))
}

function createTray(): void {
  tray = new Tray(join(RESOURCES, 'tray.png'))
  tray.setToolTip(APP_NAME)
  tray.on('click', showWindow)
  tray.on('double-click', showWindow)
  updateTray(null)
  const refresh = async (): Promise<void> => updateTray(await fetchUsage())
  void refresh()
  setInterval(() => void refresh(), 60_000)
}

function updateTray(usage: Awaited<ReturnType<typeof fetchUsage>> | null): void {
  if (!tray) return
  const lines = [APP_NAME]
  const items: Electron.MenuItemConstructorOptions[] = [{ label: 'Abrir', click: showWindow }, { type: 'separator' }]
  if (usage?.error) {
    lines.push(`consumo: ${usage.error}`)
    items.push({ label: 'Consumo indisponível', enabled: false })
  } else if (usage) {
    for (const l of usage.limits) {
      lines.push(`${l.label}: ${l.percent.toFixed(0)}%`)
      items.push({ label: `${l.label}: ${l.percent.toFixed(0)}%`, enabled: false })
    }
  } else {
    items.push({ label: 'Consultando consumo…', enabled: false })
  }
  const live = readLiveSessions()
  const busy = live.filter((s) => s.status === 'busy').length
  lines.push(`${live.length} sessão(ões) · ${busy} trabalhando`)
  items.push(
    { type: 'separator' },
    { label: `${live.length} sessão(ões) · ${busy} trabalhando`, enabled: false },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  )
  tray.setToolTip(lines.join('\n').slice(0, 127))
  tray.setContextMenu(Menu.buildFromTemplate(items))
}

app.setAppUserModelId('br.com.guilherme.wrapperclaude')

// Instância única: abrir de novo (atalho) só traz a janela existente para frente.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
}

app.whenReady().then(() => {
  ptys = new PtyManager((ch, ...a) => {
    if (ch === 'pty:exit') {
      const t = tabs.get(a[0] as string)
      if (t) t.exited = a[1] as number
    }
    send(ch, ...a)
  })
  registerIpc()
  createWindow()
  createTray()

  watcher = new LiveSessionWatcher(
    (sessions) => send('sessions:live', attachTabIds(sessions)),
    (s) => {
      const cfg = getConfig()
      if (!cfg.notifyOnIdle) return
      if (win?.isFocused()) return
      if (!Notification.isSupported()) return
      const n = new Notification({
        title: `${basename(s.cwd)} — Claude terminou`,
        body: s.name ? `Sessão ${s.name} está aguardando você.` : 'Sessão aguardando você.'
      })
      n.on('click', showWindow)
      n.show()
    }
  )
  watcher.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
  watcher?.stop()
  ptys?.killAll()
})

app.on('window-all-closed', () => {
  if (!getConfig().closeToTray || !tray) app.quit()
})
