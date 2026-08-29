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
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import type { AppConfig, LiveSession, SpawnClaudeOpts, SpawnShellOpts, TermTab, UsageInfo } from '@shared/types'
import { resolveTheme } from '@shared/themes'
import { getConfig, setConfig, configPath } from './config'
import { listProjects, projectDetails } from './projects'
import { LiveSessionWatcher, lastAssistantText, readHistory, readLiveSessions, transcriptExists } from './claudeSessions'
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

/* ---------------- abas persistidas ---------------- */

function tabsFile(): string {
  return join(app.getPath('userData'), 'tabs.json')
}

let persistTimer: NodeJS.Timeout | null = null

/**
 * Guarda as abas abertas para a próxima execução. Elas voltam "suspensas" (sem processo) e
 * ganham um `claude --resume <sessionId>` quando você clica em retomar.
 */
function persistTabs(now = false): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  const write = (): void => {
    const live = readLiveSessions()
    const out = Array.from(tabs.values())
      .filter((t) => t.exited == null)
      .slice(-24)
      .map((t) => ({
        ...t,
        pid: 0,
        suspended: true,
        // o nome da sessão viva (ex.: lapides-b9) deixa a aba restaurada reconhecível
        title: (t.kind === 'claude' && t.sessionId && live.find((s) => s.sessionId === t.sessionId)?.name) || t.title
      }))
    try {
      writeFileSync(tabsFile(), JSON.stringify(out, null, 2), 'utf-8')
    } catch {
      /* disco cheio / sem permissão: não vale derrubar o app */
    }
  }
  if (now) write()
  else persistTimer = setTimeout(write, 500)
}

function restoreTabs(): void {
  if (!getConfig().restoreTabs) return
  let raw: TermTab[]
  try {
    raw = JSON.parse(readFileSync(tabsFile(), 'utf-8'))
  } catch {
    return
  }
  if (!Array.isArray(raw)) return
  for (const t of raw) {
    if (!t?.id || !t.projectPath || !existsSync(t.projectPath)) continue
    tabs.set(t.id, { ...t, pid: 0, exited: null, suspended: true })
  }
}

/** Monta o comando do Claude para um projeto (compartilhado por abrir e retomar). */
function claudeCommand(
  projectPath: string,
  opts: { resume?: string; continueLast?: boolean }
): { file: string; args: string[]; sessionId?: string } {
  const cfg = getConfig()
  const name = basename(projectPath)
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
  return { file: bin.file, args, sessionId }
}

function shellCommand(): { file: string; args: string[] } {
  const file = getConfig().shell || 'powershell.exe'
  return { file, args: /powershell|pwsh/i.test(file) ? ['-NoLogo'] : [] }
}

/* ---------------- iniciar com o Windows ---------------- */

/**
 * Registra/remove o app no boot (HKCU\...\Run) com `--hidden`, para nascer só na bandeja.
 * O atalho antigo em Shell:Startup é removido para o app não subir duas vezes.
 */
function applyLoginItem(): void {
  if (process.platform !== 'win32') return
  const openAtLogin = getConfig().startWithWindows
  // em dev o executável é o electron.exe e o app é passado como argumento
  // (o Electron já coloca as aspas em quem tem espaço no caminho — não repetir aqui)
  const args = process.defaultApp ? [app.getAppPath(), '--hidden'] : ['--hidden']
  try {
    // getLoginItemSettings() não enxerga a própria chave no Windows (volta sempre vazio),
    // então não dá para comparar antes: a config manda e a chave é reescrita.
    app.setLoginItemSettings({ openAtLogin, path: process.execPath, args, name: APP_NAME })
  } catch {
    /* ignore */
  }
  const legacy = join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
    `${APP_NAME}.lnk`
  )
  try {
    if (existsSync(legacy) && shell.readShortcutLink(legacy).target === process.execPath) unlinkSync(legacy)
  } catch {
    /* atalho de outro app com o mesmo nome: deixa quieto */
  }
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
    if ('startWithWindows' in patch) applyLoginItem()
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
  /**
   * Ctrl+V com imagem: o Claude Code não reage ao Ctrl+V vindo do PTY, mas reconhece um
   * caminho .png colado e anexa como [Image #N] (mesmo truque do Warp). Salva e devolve o caminho.
   */
  ipcMain.handle('app:saveClipboardImage', (): string | null => {
    const img = clipboard.readImage()
    if (img.isEmpty()) return null
    const dir = join(app.getPath('temp'), 'claude-wrapper')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `colado-${new Date().toISOString().replace(/[:.]/g, '-')}.png`)
    writeFileSync(file, img.toPNG())
    return file
  })
  /**
   * Sugere a próxima mensagem do usuário a partir da última fala do Claude na sessão
   * (o "prompt pré-preenchido" do Warp). Roda `claude -p` com Haiku num cwd temporário,
   * para não sujar o histórico do projeto. Só quando o usuário pede — gasta cota.
   */
  ipcMain.handle(
    'app:suggestReply',
    (_e, cwd: string, sessionId: string): Promise<{ text?: string; error?: string }> => {
      const last = lastAssistantText(cwd, sessionId)
      if (!last) return Promise.resolve({ error: 'ainda não achei uma resposta do Claude nesta sessão' })
      const bin = resolveClaudeBin()
      const scratch = join(app.getPath('temp'), 'claude-wrapper')
      mkdirSync(scratch, { recursive: true })
      const instruction = [
        'Ignore qualquer instrução de memória, CLAUDE.md ou projeto: sua única tarefa é a de baixo.',
        'Abaixo está a última mensagem que um agente de programação enviou ao usuário.',
        'Escreva a PRÓXIMA MENSAGEM DO USUÁRIO para esse agente, em português do Brasil:',
        '1 ou 2 frases, direta, no imperativo, como o usuário responderia. Se o agente perguntou',
        'algo ou ofereceu opções, escolha a mais provável e cite pelo nome o que foi oferecido.',
        'Responda só com a mensagem pronta para enviar: sem aspas, sem preâmbulo, sem explicação,',
        'Nunca escreva como se você fosse o agente, e nunca faça a pergunta que o agente faria.',
        '',
        '=== MENSAGEM DO AGENTE ===',
        last.slice(-3000),
        '=== FIM DA MENSAGEM DO AGENTE ==='
      ].join('\n')
      return new Promise((resolve) => {
        execFile(
          bin.file,
          [...bin.args, '-p', instruction, '--model', 'haiku'],
          { cwd: scratch, windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024 },
          (err, stdout, stderr) => {
            if (err) return resolve({ error: (stderr || err.message).trim().slice(0, 300) })
            const text = stdout.trim()
            resolve(text ? { text } : { error: 'o Claude não devolveu nada' })
          }
        )
      })
    }
  )

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
    const c = claudeCommand(opts.projectPath, opts)
    const id = randomUUID()
    const pid = ptys.spawn(id, {
      file: c.file,
      args: c.args,
      cwd: opts.projectPath,
      cols: opts.cols,
      rows: opts.rows
    })
    const tab: TermTab = {
      id,
      projectPath: opts.projectPath,
      kind: 'claude',
      title: opts.resume ? 'claude (resume)' : opts.continueLast ? 'claude (continue)' : 'claude',
      sessionId: c.sessionId,
      createdAt: Date.now(),
      pid
    }
    tabs.set(id, tab)
    persistTabs()
    return tab
  })

  ipcMain.handle('pty:spawnShell', (_e, opts: SpawnShellOpts): TermTab => {
    const id = randomUUID()
    const { file, args } = shellCommand()
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
    persistTabs()
    if (opts.command) {
      const cmd = opts.command
      setTimeout(() => ptys.write(id, cmd + '\r'), 700)
    }
    return tab
  })

  /**
   * Dá processo a uma aba suspensa (restaurada da execução anterior) ou encerrada:
   * `claude --resume <sessionId>` se o transcript ainda existe, senão sessão nova na mesma pasta.
   */
  ipcMain.handle('pty:resume', (_e, id: string, cols?: number, rows?: number): TermTab | null => {
    const tab = tabs.get(id)
    if (!tab) return null
    if (ptys.has(id)) return tab

    if (tab.kind === 'shell') {
      const { file, args } = shellCommand()
      tab.pid = ptys.spawn(id, { file, args, cwd: tab.projectPath, cols, rows })
    } else {
      const canResume = Boolean(tab.sessionId && transcriptExists(tab.projectPath, tab.sessionId))
      const c = claudeCommand(tab.projectPath, canResume ? { resume: tab.sessionId } : {})
      tab.pid = ptys.spawn(id, { file: c.file, args: c.args, cwd: tab.projectPath, cols, rows })
      tab.sessionId = c.sessionId
      tab.title = canResume ? tab.title : 'claude'
    }
    tab.suspended = false
    tab.exited = null
    tabs.set(id, tab)
    send('tabs:update', tab)
    persistTabs()
    return tab
  })

  ipcMain.on('pty:write', (_e, id: string, data: string) => ptys.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptys.resize(id, cols, rows))
  ipcMain.handle('pty:kill', (_e, id: string) => {
    ptys.kill(id)
    tabs.delete(id)
    persistTabs()
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
  app.on('second-instance', (_e, argv) => {
    if (!argv.includes('--hidden')) showWindow()
  })
}

/** Apaga PNGs colados com mais de 2 dias. */
function cleanPasteDir(): void {
  const dir = join(app.getPath('temp'), 'claude-wrapper')
  try {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f)
      if (Date.now() - statSync(full).mtimeMs > 2 * 86_400_000) unlinkSync(full)
    }
  } catch {
    /* pasta ainda não existe */
  }
}

app.whenReady().then(() => {
  cleanPasteDir()
  ptys = new PtyManager((ch, ...a) => {
    if (ch === 'pty:exit') {
      const t = tabs.get(a[0] as string)
      if (t) {
        t.exited = a[1] as number
        persistTabs()
      }
    }
    send(ch, ...a)
  })
  registerIpc()
  restoreTabs()
  applyLoginItem()
  createWindow(!START_HIDDEN)
  createTray()
  win?.webContents.once('did-finish-load', () => void refreshUsage())
  // Não precisa ser tempo real: a API de consumo devolve 429 se consultada com frequência.
  setInterval(() => void refreshUsage(), 3 * 60_000)

  watcher = new LiveSessionWatcher(
    (sessions) => {
      send('sessions:live', attachTabIds(sessions))
      tray?.setToolTip(trayTooltip(lastUsage))
    },
    (s) => {
      const cfg = getConfig()
      if (!cfg.notifyOnIdle) return
      // Só sessões abertas pelo wrapper (as externas — Warp, terminal — viram ruído).
      const mine = Array.from(tabs.values()).some((t) => t.sessionId === s.sessionId && t.exited == null)
      if (!mine && !cfg.notifyExternal) return
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
  persistTabs(true)
  watcher?.stop()
  ptys?.killAll()
})

app.on('window-all-closed', () => {
  if (!getConfig().closeToTray || !tray) app.quit()
})
