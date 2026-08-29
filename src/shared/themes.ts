/**
 * Temas: cada um define as variáveis da UI e o tema do xterm (janela do Claude).
 * `system` alterna entre dark e light conforme o Windows.
 */
export interface TermColors {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface UiColors {
  bg: string
  bg2: string
  bg3: string
  border: string
  fg: string
  fg2: string
  muted: string
  accent: string
  accentFg: string
  ok: string
  warn: string
  danger: string
}

export interface Theme {
  id: string
  name: string
  dark: boolean
  /** fonte do terminal (sobrescreve a configurada) */
  font?: string
  ui: UiColors
  term: TermColors
}

function term(p: Partial<TermColors> & Pick<TermColors, 'background' | 'foreground'>): TermColors {
  return {
    cursor: p.foreground,
    cursorAccent: p.background,
    selectionBackground: 'rgba(148, 163, 184, 0.30)',
    black: '#18181b',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#facc15',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e4e4e7',
    brightBlack: '#71717a',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fde047',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#fafafa',
    ...p
  }
}

export const THEMES: Theme[] = [
  {
    id: 'dark',
    name: 'Escuro (padrão)',
    dark: true,
    ui: {
      bg: '#0f1115', bg2: '#161920', bg3: '#1d212b', border: '#262b36',
      fg: '#d4d4d8', fg2: '#a1a1aa', muted: '#6b7280',
      accent: '#d97757', accentFg: '#ffffff', ok: '#4ade80', warn: '#facc15', danger: '#f87171'
    },
    term: term({ background: '#0f1115', foreground: '#d4d4d8', cursor: '#f4f4f5' })
  },
  {
    id: 'light',
    name: 'Claro',
    dark: false,
    ui: {
      bg: '#fafaf9', bg2: '#f1f0ee', bg3: '#e7e5e4', border: '#d6d3d1',
      fg: '#27272a', fg2: '#52525b', muted: '#8a8a93',
      accent: '#c2410c', accentFg: '#ffffff', ok: '#16a34a', warn: '#ca8a04', danger: '#dc2626'
    },
    term: term({
      background: '#fafaf9', foreground: '#27272a', cursor: '#18181b',
      selectionBackground: 'rgba(59, 130, 246, 0.25)',
      black: '#27272a', red: '#dc2626', green: '#16a34a', yellow: '#ca8a04', blue: '#2563eb',
      magenta: '#9333ea', cyan: '#0891b2', white: '#d4d4d8', brightBlack: '#71717a',
      brightRed: '#ef4444', brightGreen: '#22c55e', brightYellow: '#eab308', brightBlue: '#3b82f6',
      brightMagenta: '#a855f7', brightCyan: '#06b6d4', brightWhite: '#f4f4f5'
    })
  },
  {
    id: 'claude',
    name: 'Claude (laranja)',
    dark: true,
    ui: {
      bg: '#141009', bg2: '#1c150c', bg3: '#261c10', border: '#3a2a18',
      fg: '#f3c9a6', fg2: '#d9a375', muted: '#8a6a4b',
      accent: '#f0884f', accentFg: '#1a0f05', ok: '#8ee08a', warn: '#ffd166', danger: '#ff6b6b'
    },
    term: term({
      background: '#141009', foreground: '#f0a86f', cursor: '#ffb27a',
      selectionBackground: 'rgba(240, 136, 79, 0.30)',
      black: '#2b1d10', red: '#ff6b6b', green: '#9be08e', yellow: '#ffd166', blue: '#f0884f',
      magenta: '#ff9e7a', cyan: '#f7c59f', white: '#f3c9a6', brightBlack: '#8a6a4b',
      brightRed: '#ff8f8f', brightGreen: '#b8f0ad', brightYellow: '#ffe08a', brightBlue: '#ffa572',
      brightMagenta: '#ffb89a', brightCyan: '#ffdcbf', brightWhite: '#fff1e4'
    })
  },
  {
    id: 'matrix',
    name: 'Matrix',
    dark: true,
    font: "'Cascadia Mono', 'Lucida Console', 'Courier New', monospace",
    ui: {
      bg: '#000000', bg2: '#050a05', bg3: '#0b160b', border: '#123f12',
      fg: '#00ff41', fg2: '#00c832', muted: '#1f7a2f',
      accent: '#00ff41', accentFg: '#001a05', ok: '#00ff41', warn: '#b8ff00', danger: '#ff3b3b'
    },
    term: term({
      background: '#000000', foreground: '#00ff41', cursor: '#00ff41',
      selectionBackground: 'rgba(0, 255, 65, 0.25)',
      black: '#001a05', red: '#ff3b3b', green: '#00ff41', yellow: '#b8ff00', blue: '#00c832',
      magenta: '#39ff8a', cyan: '#5cffb1', white: '#b6ffc7', brightBlack: '#1f7a2f',
      brightRed: '#ff6b6b', brightGreen: '#7dff9e', brightYellow: '#e2ff7a', brightBlue: '#33ff66',
      brightMagenta: '#8affb8', brightCyan: '#b6ffd6', brightWhite: '#e8ffef'
    })
  },
  {
    id: 'dracula',
    name: 'Dracula',
    dark: true,
    ui: {
      bg: '#282a36', bg2: '#21222c', bg3: '#343746', border: '#44475a',
      fg: '#f8f8f2', fg2: '#bfc2d0', muted: '#6272a4',
      accent: '#bd93f9', accentFg: '#1e1f29', ok: '#50fa7b', warn: '#f1fa8c', danger: '#ff5555'
    },
    term: term({
      background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2',
      selectionBackground: 'rgba(68, 71, 90, 0.8)',
      black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9',
      magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2', brightBlack: '#6272a4',
      brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5', brightBlue: '#d6acff',
      brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff'
    })
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    dark: true,
    ui: {
      bg: '#1a1426', bg2: '#241b35', bg3: '#2f2344', border: '#4a3568',
      fg: '#f4e8ff', fg2: '#c9b6e6', muted: '#8a75a8',
      accent: '#ff7edb', accentFg: '#1a0f1f', ok: '#72f1b8', warn: '#fede5d', danger: '#fe4450'
    },
    term: term({
      background: '#1a1426', foreground: '#f4e8ff', cursor: '#ff7edb',
      selectionBackground: 'rgba(255, 126, 219, 0.3)',
      black: '#241b35', red: '#fe4450', green: '#72f1b8', yellow: '#fede5d', blue: '#36f9f6',
      magenta: '#ff7edb', cyan: '#03edf9', white: '#f4e8ff', brightBlack: '#8a75a8',
      brightRed: '#ff7a82', brightGreen: '#a4ffd3', brightYellow: '#fff59d', brightBlue: '#8dfffd',
      brightMagenta: '#ffa8e8', brightCyan: '#7ff6fb', brightWhite: '#ffffff'
    })
  },
  {
    id: 'nord',
    name: 'Nord',
    dark: true,
    ui: {
      bg: '#2e3440', bg2: '#292e39', bg3: '#3b4252', border: '#434c5e',
      fg: '#eceff4', fg2: '#d8dee9', muted: '#7b88a1',
      accent: '#88c0d0', accentFg: '#1f242e', ok: '#a3be8c', warn: '#ebcb8b', danger: '#bf616a'
    },
    term: term({
      background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9',
      selectionBackground: 'rgba(136, 192, 208, 0.3)',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1',
      magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0', brightBlack: '#4c566a',
      brightRed: '#d08770', brightGreen: '#b5d19c', brightYellow: '#f0d8a0', brightBlue: '#8fbcbb',
      brightMagenta: '#c9a2c0', brightCyan: '#a3d1de', brightWhite: '#eceff4'
    })
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    dark: true,
    ui: {
      bg: '#282828', bg2: '#1d2021', bg3: '#3c3836', border: '#504945',
      fg: '#ebdbb2', fg2: '#d5c4a1', muted: '#928374',
      accent: '#fe8019', accentFg: '#1d2021', ok: '#b8bb26', warn: '#fabd2f', danger: '#fb4934'
    },
    term: term({
      background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2',
      selectionBackground: 'rgba(80, 73, 69, 0.8)',
      black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921', blue: '#458588',
      magenta: '#b16286', cyan: '#689d6a', white: '#a89984', brightBlack: '#928374',
      brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f', brightBlue: '#83a598',
      brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2'
    })
  },
  {
    id: 'solarized',
    name: 'Solarized Dark',
    dark: true,
    ui: {
      bg: '#002b36', bg2: '#00212b', bg3: '#073642', border: '#0f4a5a',
      fg: '#eee8d5', fg2: '#93a1a1', muted: '#586e75',
      accent: '#b58900', accentFg: '#002b36', ok: '#859900', warn: '#cb4b16', danger: '#dc322f'
    },
    term: term({
      background: '#002b36', foreground: '#839496', cursor: '#93a1a1',
      selectionBackground: 'rgba(7, 54, 66, 0.9)',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2',
      magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5', brightBlack: '#586e75',
      brightRed: '#cb4b16', brightGreen: '#93a1a1', brightYellow: '#657b83', brightBlue: '#839496',
      brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3'
    })
  },
  {
    id: 'monokai',
    name: 'Monokai',
    dark: true,
    ui: {
      bg: '#272822', bg2: '#1e1f1a', bg3: '#33342c', border: '#49483e',
      fg: '#f8f8f2', fg2: '#cfcfc2', muted: '#75715e',
      accent: '#a6e22e', accentFg: '#1e1f1a', ok: '#a6e22e', warn: '#e6db74', danger: '#f92672'
    },
    term: term({
      background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0',
      selectionBackground: 'rgba(73, 72, 62, 0.9)',
      black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75', blue: '#66d9ef',
      magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2', brightBlack: '#75715e',
      brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75', brightBlue: '#66d9ef',
      brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5'
    })
  },
  {
    id: 'amber',
    name: 'Terminal âmbar (retrô)',
    dark: true,
    font: "'Cascadia Mono', 'Lucida Console', 'Courier New', monospace",
    ui: {
      bg: '#0b0800', bg2: '#120d00', bg3: '#1c1400', border: '#3d2c00',
      fg: '#ffb000', fg2: '#d99500', muted: '#7a5a10',
      accent: '#ffb000', accentFg: '#1a1000', ok: '#ffd35c', warn: '#ff8c00', danger: '#ff4d4d'
    },
    term: term({
      background: '#0b0800', foreground: '#ffb000', cursor: '#ffb000',
      selectionBackground: 'rgba(255, 176, 0, 0.25)',
      black: '#1c1400', red: '#ff4d4d', green: '#ffd35c', yellow: '#ffb000', blue: '#d99500',
      magenta: '#ffc861', cyan: '#ffe0a3', white: '#ffe9c2', brightBlack: '#7a5a10',
      brightRed: '#ff7a7a', brightGreen: '#ffe08a', brightYellow: '#ffcc4d', brightBlue: '#ffbf40',
      brightMagenta: '#ffd48a', brightCyan: '#fff0cc', brightWhite: '#fff8e8'
    })
  }
]

export const THEME_IDS = ['system', ...THEMES.map((t) => t.id)]

export function resolveTheme(id: string, systemDark: boolean): Theme {
  if (id === 'system') return THEMES.find((t) => t.id === (systemDark ? 'dark' : 'light'))!
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
