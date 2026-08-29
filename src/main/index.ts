import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  screen,
  shell,
  Tray
} from 'electron'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import type { AppConfig, LiveSession, SpawnClaudeOpts, SpawnShellOpts, TermTab, UsageInfo } from '@shared/types'
import { resolveTheme } from '@shared/themes'
import { getConfig, setConfig, configPath } from './config'
import { listProjects, projectDetails } from './projects'
import { LiveSessionWatcher, readHistory, readLiveSessions } from './claudeSessions'
import { PtyManager } from './pty'
import { resolveClaudeBin } from './claudeBin'
import { fetchUsage } from './usage'

let win: BrowserWindow | null = null
let popup: BrowserWindow | null = null
let tray: Tray | null = null
let ptys: PtyManager
let watcher: LiveSessionWatcher
let quitting = false
let lastUsage: UsageInfo | null = null
const tabs = new Map<string, TermTab>()

const RESOURCES = join(__dirname, '../../resources')
const APP_NAME = 'Claude Wrapper'
const START_HIDDEN = process.argv.includes('--hidden')
const POPUP_W = 360

function send(channel: string, ...args: unknown[]): void {
  for (const w of [win, popup]) if (w && !w.isDestroyed()) w.webContents.send(channel, ...args)
}

function splitArgs(s: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s ?? ''))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

function themeBg(): string {
  const cfg = getConfig()
  return resolveTheme(cfg.theme, nativeTheme.shouldUseDarkColors).ui.bg
}

function applyNativeTheme(): void {
  const cfg = getConfig()
  if (cfg.theme === 'system') nativeTheme.themeSource = 'system'
  else nativeTheme.themeSource = resolveTheme(cfg.theme, true).dark ? 'dark' : 'light'
}

function showWindow(): void {
  hidePopup()
  if (!win || win.isDestroyed()) {
    createWindow(true)
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function loadRenderer(w: BrowserWindow, query = ''): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    w.loadURL(process.env.ELECTRON_RENDERER_URL + query)
  } else {
    w.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
  }
}

function createWindow(show = true): void {
  const cfg = getConfig()
  const b = cfg.windowBounds
  applyNativeTheme()
  win = new BrowserWindow({
    width: b?.width ?? 1500,
    height: b?.height ?? 920,
    x: b?.x,
    y: b?.y,
    minWidth: 900,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: themeBg(),
    title: APP_NAME,
    icon: join(RESOURCES, 'icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  if (b?.maximized && show) win.maximize()
  win.once('ready-to-show', () => {
    if (show) win?.show()
  })

  const saveBounds = (): void => {
    if (!win || !win.isVisible()) return
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

  loadRenderer(win)
}

/* ---------------- popup da bandeja (mesmo visual do Usage Tray) ---------------- */

function createPopup(): BrowserWindow {
  const p = new BrowserWindow({
    width: POPUP_W,
    height: 200,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#18181b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  p.on('blur', () => hidePopup())
  p.on('closed', () => {
    popup = null
  })
  loadRenderer(p, '?popup=1')
  return p
}

function placePopup(height: number): void {
  if (!popup) return
  const wa = screen.getPrimaryDisplay().workArea
  const h = Math.max(120, Math.min(height, wa.height - 24))
  popup.setBounds({ x: wa.x + wa.width - POPUP_W - 12, y: wa.y + wa.height - h - 12, width: POPUP_W, height: h })
}

function togglePopup(): void {
  if (popup && popup.isVisible()) {
    hidePopup()
    return
  }
  if (!popup) popup = createPopup()
  placePopup(220)
  popup.show()
  popup.focus()
  send('usage:update', lastUsage)
}

function hidePopup(): void {
  if (popup && popup.isVisible()) popup.hide()
}

/* ---------------- bandeja ---------------- */

function trayTooltip(u: UsageInfo | null): string {
  const lines = ['Consumo do Claude']
  if (!u) lines.push('Consultando…')
  else if (u.error && !u.stale) lines.push(u.error)
  else {
    for (const l of u.limits) lines.push(`${l.label}: ${l.percent.toFixed(0)}%`)
    if (u.stale) lines.push('(desatualizado)')
  }
  const live = readLiveSessions()
  const busy = live.filter((s) => s.status === 'busy').length
  lines.push(`${live.length} sessão(ões) · ${busy} trabalhando`)
  return lines.join('\n').slice(0, 127)
}

function trayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Abrir Claude Wrapper', click: showWindow },
    { label: 'Detalhes do consumo', click: togglePopup },
    { label: 'Atualizar agora', click: () => void refreshUsage(true) },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
}

function peakPercent(u: UsageInfo | null): number | null {
  if (!u || !u.limits.length || (u.error && !u.stale)) return null
  // Empate favorece a sessão (5h), que é o limite que você sente primeiro.
  return u.limits.reduce((best, l) => {
    if (!best) return l
    if (l.percent > best.percent) return l
    if (l.percent === best.percent && l.kind === 'session') return l
    return best
  }).percent
}

function createTray(): void {
  tray = new Tray(join(RESOURCES, 'tray.png'))
  tray.setToolTip(trayTooltip(null))
  tray.setContextMenu(trayMenu())
  tray.on('click', togglePopup)
  tray.on('double-click', showWindow)
}

/** Pede ao renderer para desenhar o ícone (anel + número) e aplica na bandeja. */
function requestTrayIcon(): void {
  if (!win || win.isDestroyed()) return
  win.webContents.send('tray:render', peakPercent(lastUsage))
}

async function refreshUsage(force = false): Promise<UsageInfo> {
  const u = await fetchUsage(force)
  lastUsage = u
  send('usage:update', u)
  if (tray) {
    tray.setToolTip(trayTooltip(u))
    requestTrayIcon()
  }
  return u
}

/* ---------------- IPC ---------------- */

function registerIpc(): void {
  ipcMain.handle('config:get', () => getConfig())
  ipcMain.handle('config:set', (_e, patch: Partial<AppConfig>) => {
    const next = setConfig(patch)
    if (patch.theme) {
      applyNativeTheme()
      win?.setBackgroundColor(themeBg())
    }
    send('config:update', next)
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

  ipcMain.handle('usage:get', (_e, force?: boolean) => refreshUsage(Boolean(force)))

  ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('app:copy', (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle('app:claudeBin', () => resolveClaudeBin())
  ipcMain.handle('app:clipboardHasImage', () => !clipboard.readImage().isEmpty())
  ipcMain.handle('app:showMain', () => showWindow())
  ipcMain.handle('app:hidePopup', () => hidePopup())
  ipcMain.on('popup:height', (_e, h: number) => placePopup(Math.ceil(h)))
  ipcMain.on('tray:rendered', (_e, dataUrl: string) => {
    if (!tray) return
    try {
      const img = nativeImage.createFromDataURL(dataUrl).resize({ width: 32, height: 32, quality: 'best' })
      tray.setImage(img)
    } catch {
      /* mantém o ícone anterior */
    }
  })

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
    if (ov.remoteControl ?? cfg.remoteControl) args.push('--remote-control', name)
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

/* ---------------- ciclo de vida ---------------- */

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
  createWindow(!START_HIDDEN)
  createTray()
  win?.webContents.once('did-finish-load', () => void refreshUsage())
  setInterval(() => void refreshUsage(), 60_000)

  watcher = new LiveSessionWatcher(
    (sessions) => {
      send('sessions:live', attachTabIds(sessions))
      tray?.setToolTip(trayTooltip(lastUsage))
    },
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
