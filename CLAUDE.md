# Wrapper Claude — Contexto do Projeto

## O que é
App desktop pessoal (Windows) que substitui o Warp como "casa" do Claude Code: lista os projetos
de `~/Documents/GitHub`, abre uma sessão `claude` num terminal embutido com um clique, mostra o
estado de cada projeto (sessões vivas, git, infos do CLAUDE.md, histórico de sessões) e o consumo
da conta (5h / semanal). Uso próprio, sem distribuição.

## Stack
| Camada | Tecnologia |
|---|---|
| Shell | Electron 40 + electron-vite 5 (Vite 7) |
| Renderer | React 19 + TypeScript + Zustand, CSS puro com variáveis (tema dark/light/system) |
| Terminal | @xterm/xterm 6 (+ fit, webgl, web-links) |
| PTY | node-pty 1.1 (ConPTY; prebuild N-API, sem rebuild) |
| Config | `%APPDATA%/wrapper-claude/config.json` |
| Ícones | gerados por script (PowerShell/System.Drawing) em `resources/` — losango laranja |

> `@vitejs/plugin-react` fica em **^5** — a 6.x exige Vite 8 e quebra o electron-vite 5.
> `pnpm-workspace.yaml` usa `allowBuilds` (formato do pnpm 11) para liberar os postinstalls de electron/node-pty/esbuild.

## Layout
```
src/main/          processo principal
  index.ts         janela, IPC, notificações, ciclo de vida
  pty.ts           PtyManager (node-pty) → eventos pty:data / pty:exit
  claudeBin.ts     resolve o claude.exe nativo (…\@anthropic-ai\claude-code\bin\claude.exe)
  projects.ts      scan da pasta raiz, detecção de stack, git, parse do CLAUDE.md, scripts
  claudeSessions.ts sessões vivas (~/.claude/sessions/<pid>.json) + histórico (~/.claude/projects/<slug>/*.jsonl)
  usage.ts         GET https://api.anthropic.com/api/oauth/usage com o token de ~/.claude/.credentials.json
  config.ts        leitura/gravação do config.json
src/preload/       contextBridge → window.api (tipado)
src/renderer/src/  React: TopBar, Sidebar, TabBar, TerminalView, PromptBox, ProjectPanel, SettingsModal
src/shared/types.ts contratos compartilhados
```

## Como o Claude é aberto
`claude.exe --dangerously-skip-permissions [--model X] [--effort Y] --session-id <uuid> [extras]`
com `cwd` = pasta do projeto. O `--session-id` gerado permite casar a aba com o arquivo em
`~/.claude/sessions/` (status `idle|busy`) — é assim que a bolinha "trabalhando/ocioso" funciona,
sem hooks. `--resume <id>` e `--continue` também estão disponíveis.

Skip-permissions é **global por padrão** (config) e pode ser sobrescrito por projeto
(`perProject[nome].skipPermissions`).

## Fontes de verdade externas (não mexer no formato, só ler)
- `~/.claude/sessions/*.json` — sessões vivas; checar `pid` antes de confiar.
- `~/.claude/projects/<slug>/<sessionId>.jsonl` — slug = caminho com `[^a-zA-Z0-9]` → `-`.
  Título vem da linha `"type":"ai-title"`.
- `~/.claude/.credentials.json` — só leitura. **Nunca renovar o token aqui** (rotação do
  refresh_token derruba o Claude Code aberto).

## Comandos
```
pnpm dev        # electron-vite dev (HMR no renderer)
pnpm build      # gera out/
pnpm start      # roda o build (electron-vite preview)
pnpm typecheck
```
Atalho de uso diário: "Claude Wrapper" no Menu Iniciar e na área de trabalho (apontam para
`node_modules\electron\dist\electron.exe "<pasta do projeto>"`, ícone em `resources/icon.ico`).
`start.vbs` faz o mesmo. Instância única: abrir de novo só traz a janela para frente.
Fechar a janela esconde na bandeja (config `closeToTray`). O ícone da bandeja é o mesmo do
antigo Usage Tray (anel + número do limite mais alto, desenhado em canvas no renderer e
enviado ao main via `tray:rendered`); clique esquerdo abre o popup de consumo (janela
`?popup=1`, componente `TrayPopup`), botão direito tem "Abrir Claude Wrapper" / "Sair",
duplo clique abre a janela. `--hidden` inicia só na bandeja. **Iniciar com o Windows** é a chave `HKCU\...\Run\Claude Wrapper`
(escrita por `app.setLoginItemSettings` com `--hidden`), ligada/desligada no checkbox das
configurações (`startWithWindows`). O antigo atalho em `Shell:Startup` é apagado no primeiro start
para o app não subir duas vezes; `getLoginItemSettings()` não enxerga a própria chave no Windows,
então a config é a fonte de verdade e a chave é reescrita a cada boot.
O Usage Tray em Python foi **substituído** por isto (atalho de Startup dele removido em 2026-08-29).

## Zoom do terminal
**Ctrl + roda do mouse** sobre o terminal muda só a fonte daquele terminal (8–32 px) e grava em
`perProject[nome].fontSize` — o resto da UI não mexe e o tamanho volta igual na próxima vez que
abrir o projeto. O listener fica em **captura** no `.term-host`, senão o xterm consome a roda para
rolar o buffer. A gravação é adiada 400 ms para não escrever o `config.json` a cada clique da roda.
Sem override, vale o `fontSize` global das configurações. É por projeto, não por aba: duas abas do
mesmo projeto ficam do mesmo tamanho.

## Temas
`src/shared/themes.ts` — cada tema define as variáveis da UI **e** as cores do xterm (janela do
Claude); alguns trocam a fonte (Matrix, âmbar). Aplicados como CSS vars inline em `App.tsx`.
Para adicionar um tema: novo objeto em `THEMES`.

## Remote Control
Toda sessão já nasce com Remote Control (o `bridgeSessionId` em `~/.claude/sessions/<pid>.json`
é o id de `https://claude.ai/code/<id>`). O wrapper mostra o badge "RC" na aba/painel quando o
campo existe; o botão "RC conectado" manda `/rc` para a sessão (diálogo com QR code /
desconectar); botão direito abre a URL. Opção `--remote-control <nome>` por projeto/global
apenas nomeia a sessão no claude.ai.

## Ctrl+V com imagem
O Claude Code **não reage** ao Ctrl+V vindo do PTY (testado: 0x16, kitty `CSI 118;5u` e
win32-input-mode — só redesenha). O que funciona é o truque do Warp: `TerminalView` intercepta
Ctrl+V, o main salva a imagem em `%TEMP%\claude-wrapper\colado-<ts>.png` e o caminho é colado
(bracketed paste) — o Claude reconhece caminhos `.png/.jpg` e vira `[Image #N]`. PNGs com mais
de 2 dias são apagados no start. Texto cola normal. Arrastar arquivos cola os caminhos.

## Abas restauradas
As abas abertas são gravadas em `%APPDATA%/wrapper-claude/tabs.json` (a cada spawn/kill/exit e no
`before-quit`). Ao abrir, elas voltam **suspensas**: aparecem na barra com `(suspensa)`, sem
processo. "Retomar" chama `pty:resume`, que faz `claude --resume <sessionId>` se o transcript ainda
existir em `~/.claude/projects/<slug>/` (`transcriptExists`) ou abre sessão nova na mesma pasta.
Nada é spawnado sozinho — importante porque o app sobe junto com o Windows. Config: `restoreTabs`.

## Caixa de prompt
`PromptBox` embaixo do terminal (config `promptBox`, dá para esconder pelo botão): Enter quebra
linha, **Ctrl+Enter envia** como bracketed paste (`ESC[200~ … ESC[201~`) + `\r` 90 ms depois.
↑/↓ navegam o histórico (localStorage `wrapper-prompt-history`, 100 itens) quando o cursor está na
ponta do texto; Ctrl+V com imagem e arrastar arquivo colam caminhos como no terminal; Esc devolve
o foco ao xterm; **Ctrl+I** traz o foco de volta para a caixa.

## Shift+Enter (quebra de linha)
O xterm mandaria só `CR` no Shift+Enter — o Claude Code lê isso como "enviar". `TerminalView`
intercepta Shift+Enter/Alt+Enter e escreve **ESC+CR** (`\x1b\r`), que é o que o `/terminal-setup`
configura em iTerm/VS Code. Verificado num PTY: o prompt passa a mostrar duas linhas sem enviar.
Atenção: com Shift+Espaço mapeado, segurar Shift e bater espaço no meio de uma frase quebra linha
em vez de dar espaço — se incomodar, é só tirar a condição em `TerminalView`.

## Sugestão de resposta (o "prompt pré-preenchido" do Warp)
Vem **sozinha** quando a sessão da aba ativa passa de `busy` para `idle` (config `autoSuggest`;
**Ctrl+Espaço** ou o botão ✨ pedem na hora): `lastAssistantText()` lê a última fala do Claude no
transcript e o main roda `claude -p "<instruções + mensagem>" --model haiku` com `cwd` numa pasta
temporária (para não sujar o histórico do projeto). A sugestão chega como **placeholder apagado**
(itálico, borda tracejada) — o `value` continua vazio; **Tab** transforma em texto editável,
**Esc** descarta, Enter segue quebrando linha e nada é enviado até o Ctrl+Enter. Nunca atropela o
que já está escrito. Gasta um Haiku por resposta do Claude, dá para desligar nas configurações.
O `claude -p` carrega o `~/.claude/CLAUDE.md` global, então o prompt manda ignorar memória/projeto
(sem isso a sugestão vira a pergunta "qual projeto vamos trabalhar hoje"). A busca no transcript tenta 512 KB de cauda e depois 4 MB: trechos
com muita chamada de ferramenta empurram o último texto para longe do fim.

## Teclas que o Claude Code já usa
Medido num PTY (`ptytest/keys.mjs` do dia): **Ctrl+P é dele** (histórico de prompts, mostra `n/n`),
por isso a paleta é **Ctrl+K**. Ctrl+K, Ctrl+F, Ctrl+I, Ctrl+E, Ctrl+Espaço e Ctrl+dígito não
produzem nenhuma resposta do TUI — livres para o wrapper. Ctrl+G abre o editor externo e Shift+Tab
cicla os modos: não usar.

## Busca no terminal
Ctrl+F abre a barra (`@xterm/addon-search`): Enter próximo, Shift+Enter anterior, Esc fecha,
contador `n/total`. `matchBackground`/`activeMatchBackground` só aceitam `#RRGGBB` (nada de rgba).

## Notificações
Só para sessões abertas pelo wrapper (config `notifyExternal` inclui as externas). Os toasts
mostram "Claude Wrapper" porque os atalhos têm `System.AppUserModel.ID =
br.com.guilherme.wrapperclaude` (gravado via IPropertyStore no .lnk; sem isso o Windows mostra
"Electron").

## Atalhos no app
Ctrl+T (ou o "+" ao lado das abas) nova sessão Claude · Ctrl+W fecha aba · Ctrl+Tab alterna · Ctrl+B painel · Ctrl+, config ·
Ctrl+F busca no terminal · Ctrl+I foca a caixa de prompt · Ctrl+Enter envia o prompt ·
Ctrl+K paleta (sessões e projetos) · Ctrl+1..9 vai para a aba n · Ctrl+0 pula para a próxima sessão ociosa ·
Shift+Enter e Shift+Espaço quebram linha (terminal e caixa) · Tab aceita a sugestão · Ctrl+Espaço pede sugestão ·
Ctrl+Shift+C/V copia/cola no terminal · botão do meio fecha aba.

## Regras
- Mensagens e UI em PT-BR.
- Nada aqui toca servidor/produção dos outros projetos — é só um lançador.
