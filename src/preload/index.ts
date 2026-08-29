import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  AppConfig,
  DocInfo,
  HistorySession,
  LiveSession,
  ProjectDetails,
  ProjectInfo,
  SpawnClaudeOpts,
  SpawnShellOpts,
  TermTab,
  UsageInfo
} from '@shared/types'

type Unsub = () => void

function on<T extends unknown[]>(channel: string, cb: (...args: T) => void): Unsub {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
    set: (patch: Partial<AppConfig>): Promise<AppConfig> => ipcRenderer.invoke('config:set', patch),
    path: (): Promise<string> => ipcRenderer.invoke('config:path'),
    onUpdate: (cb: (cfg: AppConfig) => void): Unsub => on<[AppConfig]>('config:update', cb)
  },
  projects: {
    list: (): Promise<ProjectInfo[]> => ipcRenderer.invoke('projects:list'),
    details: (path: string): Promise<ProjectDetails> => ipcRenderer.invoke('projects:details', path),
    openExplorer: (path: string): Promise<string> => ipcRenderer.invoke('projects:openExplorer', path),
    openVsCode: (path: string): Promise<void> => ipcRenderer.invoke('projects:openVsCode', path),
    create: (nome: string): Promise<string> => ipcRenderer.invoke('projects:create', nome)
  },
  docs: {
    dir: (): Promise<string> => ipcRenderer.invoke('docs:dir'),
    list: (): Promise<DocInfo[]> => ipcRenderer.invoke('docs:list'),
    read: (path: string): Promise<string> => ipcRenderer.invoke('docs:read', path),
    write: (path: string, content: string): Promise<number> => ipcRenderer.invoke('docs:write', path, content),
    create: (nome: string): Promise<DocInfo> => ipcRenderer.invoke('docs:create', nome),
    rename: (path: string, nome: string): Promise<DocInfo> => ipcRenderer.invoke('docs:rename', path, nome),
    remove: (path: string): Promise<void> => ipcRenderer.invoke('docs:delete', path),
    reveal: (): Promise<string> => ipcRenderer.invoke('docs:reveal'),
    onChanged: (cb: () => void): Unsub => on<[]>('docs:changed', cb)
  },
  sessions: {
    live: (): Promise<LiveSession[]> => ipcRenderer.invoke('sessions:live'),
    history: (path: string): Promise<HistorySession[]> => ipcRenderer.invoke('sessions:history', path),
    onLive: (cb: (sessions: LiveSession[]) => void): Unsub => on<[LiveSession[]]>('sessions:live', cb)
  },
  usage: {
    get: (force = false): Promise<UsageInfo> => ipcRenderer.invoke('usage:get', force),
    onUpdate: (cb: (u: UsageInfo | null) => void): Unsub => on<[UsageInfo | null]>('usage:update', cb)
  },
  app: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
    copy: (text: string): Promise<void> => ipcRenderer.invoke('app:copy', text),
    claudeBin: (): Promise<{ file: string; args: string[] }> => ipcRenderer.invoke('app:claudeBin'),
    clipboardHasImage: (): Promise<boolean> => ipcRenderer.invoke('app:clipboardHasImage'),
    saveClipboardImage: (): Promise<string | null> => ipcRenderer.invoke('app:saveClipboardImage'),
    showMain: (): Promise<void> => ipcRenderer.invoke('app:showMain'),
    firstRun: (): Promise<boolean> => ipcRenderer.invoke('app:firstRun'),
    pickFolder: (current?: string): Promise<string | null> => ipcRenderer.invoke('app:pickFolder', current),
    createShortcuts: (): Promise<{ created: string[]; error?: string }> => ipcRenderer.invoke('app:createShortcuts'),
    suggestReply: (cwd: string, sessionId: string): Promise<{ text?: string; error?: string }> =>
      ipcRenderer.invoke('app:suggestReply', cwd, sessionId),
    hidePopup: (): Promise<void> => ipcRenderer.invoke('app:hidePopup'),
    pathForFile: (f: File): string => webUtils.getPathForFile(f)
  },
  tray: {
    onRender: (cb: (percent: number | null) => void): Unsub => on<[number | null]>('tray:render', cb),
    rendered: (dataUrl: string): void => ipcRenderer.send('tray:rendered', dataUrl),
    popupHeight: (h: number): void => ipcRenderer.send('popup:height', h)
  },
  tabs: {
    list: (): Promise<TermTab[]> => ipcRenderer.invoke('tabs:list'),
    onUpdate: (cb: (tab: TermTab) => void): Unsub => on<[TermTab]>('tabs:update', cb)
  },
  pty: {
    spawnClaude: (opts: SpawnClaudeOpts): Promise<TermTab> => ipcRenderer.invoke('pty:spawnClaude', opts),
    spawnShell: (opts: SpawnShellOpts): Promise<TermTab> => ipcRenderer.invoke('pty:spawnShell', opts),
    resume: (id: string, cols?: number, rows?: number): Promise<TermTab | null> =>
      ipcRenderer.invoke('pty:resume', id, cols, rows),
    write: (id: string, data: string): void => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number): void => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: string): Promise<void> => ipcRenderer.invoke('pty:kill', id),
    onData: (cb: (id: string, data: string) => void): Unsub => on<[string, string]>('pty:data', cb),
    onExit: (cb: (id: string, code: number) => void): Unsub => on<[string, number]>('pty:exit', cb)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
