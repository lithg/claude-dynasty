import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AppConfig,
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
    path: (): Promise<string> => ipcRenderer.invoke('config:path')
  },
  projects: {
    list: (): Promise<ProjectInfo[]> => ipcRenderer.invoke('projects:list'),
    details: (path: string): Promise<ProjectDetails> => ipcRenderer.invoke('projects:details', path),
    openExplorer: (path: string): Promise<string> => ipcRenderer.invoke('projects:openExplorer', path),
    openVsCode: (path: string): Promise<void> => ipcRenderer.invoke('projects:openVsCode', path)
  },
  sessions: {
    live: (): Promise<LiveSession[]> => ipcRenderer.invoke('sessions:live'),
    history: (path: string): Promise<HistorySession[]> => ipcRenderer.invoke('sessions:history', path),
    onLive: (cb: (sessions: LiveSession[]) => void): Unsub => on<[LiveSession[]]>('sessions:live', cb)
  },
  usage: {
    get: (force = false): Promise<UsageInfo> => ipcRenderer.invoke('usage:get', force)
  },
  app: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
    copy: (text: string): Promise<void> => ipcRenderer.invoke('app:copy', text),
    claudeBin: (): Promise<{ file: string; args: string[] }> => ipcRenderer.invoke('app:claudeBin')
  },
  tabs: {
    list: (): Promise<TermTab[]> => ipcRenderer.invoke('tabs:list')
  },
  pty: {
    spawnClaude: (opts: SpawnClaudeOpts): Promise<TermTab> => ipcRenderer.invoke('pty:spawnClaude', opts),
    spawnShell: (opts: SpawnShellOpts): Promise<TermTab> => ipcRenderer.invoke('pty:spawnShell', opts),
    write: (id: string, data: string): void => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number): void => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: string): Promise<void> => ipcRenderer.invoke('pty:kill', id),
    onData: (cb: (id: string, data: string) => void): Unsub => on<[string, string]>('pty:data', cb),
    onExit: (cb: (id: string, code: number) => void): Unsub => on<[string, number]>('pty:exit', cb)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
