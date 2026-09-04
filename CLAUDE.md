# Claude Dynasty — Contexto do Projeto

## O que é
App desktop pessoal (Windows) que substitui o Warp como "casa" do Claude Code: lista os projetos
de `~/Documents/GitHub`, abre uma sessão `claude` num terminal embutido com um clique, mostra o
estado de cada projeto (sessões vivas, git, infos do CLAUDE.md, histórico de sessões) e o consumo
da conta (5h / semanal). Uso próprio, sem distribuição.

> O app se chamava **Claude Wrapper** até 2026-08-29. A pasta do repo na máquina do Guilherme
> continua `Documents/GitHub/Wrapper Claude`; o que mudou é o nome exibido, o `appId`
> (`br.com.guilherme.claudedynasty`), a pasta de config (`%APPDATA%/claude-dynasty`, com cópia
> automática da antiga na primeira abertura) e os ícones (logo da Dynasty, gerado de
> `D:/Dynasty/Logo Dynasty PNG.png` com recorte circular).

## Stack
| Camada | Tecnologia |
|---|---|
| Shell | Electron 40 + electron-vite 5 (Vite 7) |
| Renderer | React 19 + TypeScript + Zustand, CSS puro com variáveis (tema dark/light/system) |
| Terminal | @xterm/xterm 6 (+ fit, webgl, web-links) |
| PTY | node-pty 1.1 (ConPTY; prebuild N-API, sem rebuild) |
| Config | `%APPDATA%/claude-dynasty/config.json` |
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
Atalho de uso diário: "Claude Dynasty" no Menu Iniciar e na área de trabalho (apontam para
`node_modules\electron\dist\electron.exe "<pasta do projeto>"`, ícone em `resources/icon.ico`).
`start.vbs` faz o mesmo. Instância única: abrir de novo só traz a janela para frente.
Fechar a janela esconde na bandeja (config `closeToTray`). O ícone da bandeja é o mesmo do
antigo Usage Tray (anel + número do limite mais alto, desenhado em canvas no renderer e
enviado ao main via `tray:rendered`); clique esquerdo abre o popup de consumo (janela
`?popup=1`, componente `TrayPopup`), botão direito tem "Abrir Claude Dynasty" / "Sair",
duplo clique abre a janela. `--hidden` inicia só na bandeja.
Depois de um `pnpm build` não precisa fechar e abrir: o menu da bandeja tem **"Recarregar a
interface"** (`reloadIgnoringCache` — pega `src/renderer` e `src/preload`, os PTYs vivem no main
então as sessões continuam de pé; perde o histórico visual das abas, porque o xterm é remontado)
e **"Reiniciar o app"** (`app.relaunch()` — obrigatório quando o build mexeu em `src/main`; passa
pelo `before-quit`, então as abas voltam suspensas e se retomam com um clique). O `--hidden` é
tirado dos argumentos do relaunch, senão o app voltaria escondido. O antigo "Atualizar agora" da
bandeja virou **"Atualizar consumo"**, que é o que ele sempre fez. **Iniciar com o Windows** é a chave `HKCU\...\Run\Claude Dynasty`
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

## Modelo e effort na sessão aberta
Os dropdowns da barra de abas mudam o override do projeto **e mandam `/model X` / `/effort X`
para a sessão que está rodando**. O Claude pode responder que a troca só vale para a próxima
sessão — é o mesmo aviso de digitar o comando à mão. Efeito colateral conhecido e aceito: o
Claude Code grava a escolha como **padrão global** em `~/.claude/settings.json`. Escolher "padrão"
(valor vazio) não manda nada, senão o `/model` sem argumento abre o seletor interativo.

## Primeiro uso em outra máquina
`isFirstRun()` = não existe `config.json` ainda. Nesse caso o renderer mostra o `WelcomeModal`:
escolhe a pasta raiz dos projetos (`app:pickFolder` → `dialog.showOpenDialog`) e oferece criar os
atalhos (`app:createShortcuts` → `shell.writeShortcutLink` com `appUserModelId`, que é o que faz o
toast dizer "Claude Dynasty"). O botão de criar atalhos também está nas Configurações.
Os defaults do `config.ts` são neutros (`pinned: []`, raiz em `~/Documents/GitHub`) — nada de
projeto pessoal embutido. O passo a passo para montar em outra máquina está em `INSTALAR.md`,
escrito para o Claude Code do dono da máquina executar.

## Documentação
Seção da sidebar com arquivos `.md` de verdade em `<rootDir>/Documentacao` (config `docsDir`) —
são arquivos comuns justamente para o Claude poder editá-los numa sessão. `src/main/docs.ts` faz
listar/ler/gravar/criar/renomear/excluir (excluir vai para a lixeira via `shell.trashItem`) e
valida que o caminho está dentro da pasta e termina em `.md`. Um `fs.watch` na pasta manda
`docs:changed`, e o renderer recarrega a lista e o documento aberto — é assim que a edição feita
pelo Claude aparece na hora. A pasta é pulada no scan de projetos.

`src/renderer/src/lib/markdown.ts` faz os **dois caminhos**, à mão de propósito:
`render(md)` (markdown → HTML, de lista branca: um documento com `<script>` não vira código
rodando no renderer) e `toMarkdown(el)` (HTML do editor → markdown, o que vai para o arquivo).
O `toMarkdown` também entende o que o navegador inventa ao editar (`<div>`, `<b>`, `<i>` e a
sublista que o `indent` deixa como **irmã** do `<li>`, não dentro dele). Ida e volta verificada
no Chromium: é idempotente (títulos, listas, caixinhas, citação, código, tabela, link, quebra
dura). Linha terminada em dois espaços = quebra dura (`<br>`).

`DocView` é um **editor rico** (`contentEditable` com a classe `.doc-rico`): escreve já formatado,
com barra de B/I/S, H1-H3, listas, caixinha, citação, código, separador e link. Cada alteração é
serializada para markdown e salva sozinha (a store adia 700 ms; caixinha grava na hora). Detalhes
que doem se mexer:
- só redesenha o HTML quando o texto vem **de fora** e o editor não está com o foco — senão o
  cursor pula no meio da digitação (o `useRef ultimo` guarda o markdown que o editor gerou).
- colar entra como **texto puro** (`insertText`), para não trazer HTML de fora para o documento.
- caixinha dentro de `contentEditable` não marca sozinha: o clique é tratado na mão e o atributo
  `checked` é a fonte de verdade (a propriedade o navegador mexe antes do evento).
- `Ctrl+B`/`Ctrl+I` são formatação quando o foco está no editor — `App.tsx` deixa passar.
- o botão `md` mostra o markdown cru, para conferir/consertar a fonte.

Abrir um documento **esconde** o terminal em vez de desmontar — desmontar mataria o xterm e o
histórico da aba.

Ordem manual de documentos e projetos: `docsOrder` / `projectOrder` no config, arrastando na
sidebar. O item arrastado fica num `useRef`, não em estado do React: o estado não chega a tempo do
`drop`. Renomear projeto mexe só no rótulo (`perProject[nome].label`) — a pasta não é renomeada,
senão quebraria git, sessões abertas e o histórico em `~/.claude/projects/<slug>`.

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
Ctrl+V, o main salva a imagem em `%TEMP%\claude-dynasty\colado-<ts>.png` e o caminho é colado
(bracketed paste) — o Claude reconhece caminhos `.png/.jpg` e vira `[Image #N]`. PNGs com mais
de 2 dias são apagados no start. Texto cola normal. Arrastar arquivos cola os caminhos.

## Imagem no terminal (o caminho vira miniatura)
Quando o Claude devolve uma imagem, o que chega no PTY é **texto** — o caminho. Ele não emite
Sixel / iTerm2 IIP / Kitty, então o `@xterm/addon-image` não teria o que renderizar: quem resolve
é o wrapper. Config `inlineImages` (ligada).

`lib/imagePaths.ts` varre o buffer do xterm atrás de caminhos e `TerminalView` abre um **cartão
flutuante** sobre o terminal: barra com o nome (arrasta), canto para redimensionar, botão de tela
cheia e de fechar. O clique na imagem abre o `ImageLightbox` (zoom com roda/+/−, arrastar, ←/→
entre as imagens da aba, copiar caminho, abrir na pasta, abrir fora, Esc fecha). Detalhes que doem
se mexer:
- **Não use `registerDecoration`.** O TUI do Claude roda no **buffer alternativo**
  (`buffer.active.type === 'alternate'`) e o xterm força `display:none` em toda decoration
  enquanto ele está ativo — marker e decoration nascem, nascem **invisíveis**. Foi exatamente
  isso que segurou a primeira versão. A camada é nossa: um `<div class="term-card-camada">`
  absoluto dentro do `.term-host` (que por isso é `position: relative`).
- **Não ancore na linha.** Já foi, e ficou ruim: duas imagens em linhas vizinhas empilhavam uma
  sobre a outra; o cartão caía na margem direita do terminal, que é onde o TUI desenha o painel de
  `/diff`; e em janela pequena ia parar embaixo da barra do prompt. A área livre depende do que o
  TUI está desenhando, então quem escolhe o lugar é o usuário.
- Posição e tamanho ficam em `perProject[nome].imgCard`, gravados **ao soltar** o arrasto (não a
  cada pixel). Os cartões que você não arrastou são **empilhados** a partir daí (para cima, virando
  de coluna quando não cabe): já foi deslocamento fixo de 28 px, e com cartão de 340×240 o segundo
  nascia atrás do primeiro — parecia que só uma imagem tinha aparecido.
- `prender()` mantém o cartão inteiro dentro do terminal e roda também no `ResizeObserver` — sem
  isso ele some ao diminuir a janela.
- O cartão **não empurra texto** — nada empurra texto no xterm. É opaco de propósito, senão o que
  fica embaixo vaza.
- Cartão é chaveado pelo **caminho**, não por marker: no buffer alternativo a "linha" é só a
  posição na tela e o TUI reescreve tudo o tempo todo. Some quando o caminho sai da tela, **exceto**
  se você arrastou (aí fica fixado), e fechar na mão não deixa voltar na mesma sessão.
- **Apare a direita você mesmo.** O `trimRight` do `translateToString` corta *célula vazia*, não
  espaço: o TUI preenche a linha com espaços de verdade (código 32), que contam como conteúdo e
  sobrevivem. Sem aparar, a linha cortada no meio de um caminho termina em brancos, o `CORTADO` não
  reconhece e a remontagem não acontece — o sintoma era o caminho longo virar só o fragmento final
  (`uebra\imagem-….png`). Cuidado com testes: um fake que apara a direita passa e esconde o defeito.
- O caminho **não vem numa linha só**: o TUI quebra no meio da palavra e ainda indenta a
  continuação (`…\scr` + `    atchpad\ficha.png`). Não é wrap do xterm — `isWrapped` é **false** —,
  então a colagem é na mão, até 3 linhas, e só quando a linha parece cortada no meio de um caminho.
- A regex é generosa de propósito; quem diz "não é imagem" é o main (`images:thumb` devolve `null`
  quando o arquivo não existe). Sem essa validação, `https://x/a.png` viraria a unidade `s:\` —
  daí os dois olhares-para-trás. O `null` fica no cache, então um falso positivo só é perguntado
  uma vez.
- Colar linha a linha acha o caminho bom **e** os pedaços dele; o filtro final descarta todo
  achado que é sufixo de outro que termina na mesma linha.
- **Espaço no caminho** (`…\Wrapper Claude\…`, sem aspas — a pasta deste projeto!) é uma
  **segunda passada** de regex, com âncora absoluta e teto de 200 caracteres. Tem que ser passada
  separada: numa alternativa só, a versão sem espaço casaria primeiro na mesma posição e a com
  espaço nunca rodaria — o sintoma era achar só `Claude\src\…\logo.png` e não encontrar o arquivo.
- `~\…` é expandido no main (`homedir()`), que é como o Claude escreve o caminho.
- Varredura: só a volta do que está na tela (±150 linhas), **throttle** de 400 ms em
  `onWriteParsed` / `onScroll` / `onResize`, parada quando `document.hidden`. Throttle e não
  debounce: o TUI escreve em rajada, e um debounce ficaria se reiniciando sem nunca disparar.
  Medido: **0,62 ms** por varredura em 400 linhas.
- Rolar só reposiciona (`viewportY`), não revarre.

## Abas restauradas
As abas abertas são gravadas em `%APPDATA%/claude-dynasty/tabs.json` (a cada spawn/kill/exit e no
`before-quit`). Ao abrir, elas voltam **suspensas**: aparecem na barra com `(suspensa)`, sem
processo. "Retomar" chama `pty:resume`, que faz `claude --resume <sessionId>` se o transcript ainda
existir em `~/.claude/projects/<slug>/` (`transcriptExists`) ou abre sessão nova na mesma pasta.
Nada é spawnado sozinho na abertura — importante porque o app sobe junto com o Windows. Config:
`restoreTabs`.

## Clicar num projeto abre sessão nova
`selectProject` só considera aba **com processo de pé** (`!suspended && exited == null`): se houver
uma, vai para ela (alternar entre projetos não abre sessão atrás de sessão); se não houver, abre
uma **sessão nova** (`autoOpenClaude`). Aba suspensa da execução anterior ou encerrada **não conta**
— senão clicar no projeto caía na tela de "Retomar sessão", que não é o padrão que se quer. Elas
continuam na barra de abas, para retomar à mão quando você quiser. Um `Set` de caminhos (`abrindo`)
evita que dois cliques rápidos abram duas sessões.

## Uma caixa só (a do Claude)
O wrapper **não** tem mais caixa de prompt própria (o antigo `PromptBox`, config `promptBox`):
eram duas caixas na tela, a dele e a do próprio Claude Code, e a do Claude não dá para esconder.
Quem escreve é a caixa do Claude, no terminal. O que valia a pena da caixa antiga continua:
Ctrl+V com imagem, arrastar arquivo e a sugestão de resposta.

## Shift+Enter (quebra de linha)
O xterm mandaria só `CR` no Shift+Enter — o Claude Code lê isso como "enviar", e o prompt ia
embora numa linha só. `TerminalView` intercepta Shift+Enter/Alt+Enter e escreve **ESC+CR**
(`\x1b\r`), que é o que o `/terminal-setup` configura em iTerm/VS Code.

Pegadinha que fazia isso falhar: devolver `false` no `attachCustomKeyEventHandler` só faz o xterm
ignorar o **keydown** — a tecla ainda chega pelo `keypress` seguinte (e lá vai o CR de novo,
enviando o prompt). O handler agora barra as duas fases: `preventDefault()` no keydown (helper
`meu()`, usado por todos os atalhos interceptados) e `false` também no `keypress` do Enter.

Medido num PTY com o `claude.exe` de verdade: `ESC+CR`, `ESC[200~ \n ESC[201~` e
`ESC[200~ \r ESC[201~` quebram linha igual; `ESC` sozinho é o "Esc again to clear" do TUI.

> Shift+Espaço já foi mapeado para isso e **foi removido** (2026-08-29): quebrava linha no meio de
> uma frase quando você segurava Shift para digitar maiúscula e batia espaço.

## Sugestão de resposta (o "prompt pré-preenchido" do Warp)
Vem **sozinha** quando a sessão da aba ativa passa de `busy` para `idle` (config `autoSuggest`;
**Ctrl+Espaço** ou o botão ✨ da barra de abas pedem na hora): `lastAssistantText()` lê a última
fala do Claude no transcript e o main roda `claude -p "<instruções + mensagem>" --model haiku` com
`cwd` numa pasta temporária (para não sujar o histórico do projeto). A sugestão aparece numa
**faixa fina acima do terminal** (`SuggestChip`): **Tab** (ou o clique) cola o texto na caixa do
próprio Claude — dá para editar e nada é enviado até você apertar Enter —, **Esc** descarta.
O listener de Tab/Esc fica em **captura** na janela e só existe enquanto a sugestão está na tela,
senão roubaria teclas do Claude; Shift+Tab continua passando (é a troca de modo dele).
Gasta um Haiku por resposta do Claude, dá para desligar nas configurações.
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

## Terminal sujo
Se algo de fora escrever por cima da tela (um processo que herdou o console, saída perdida de um
comando), **Ctrl+Shift+L** limpa o xterm e força o TUI a se redesenhar mexendo no tamanho do PTY e
voltando. Para mandar IPC ao renderer use `sendTo()`: `win.isDestroyed()` não basta, porque com o
processo do renderer morto a janela continua "viva" e o `send` estoura com "Render frame was
disposed".

## Notificações
Só para sessões abertas pelo wrapper (config `notifyExternal` inclui as externas). Os toasts
mostram "Claude Dynasty" porque os atalhos têm `System.AppUserModel.ID =
br.com.guilherme.claudedynasty` (gravado via IPropertyStore no .lnk; sem isso o Windows mostra
"Electron").

## Atalhos no app
Ctrl+T (ou o "+" ao lado das abas) nova sessão Claude · Ctrl+W fecha aba · Ctrl+Tab alterna · Ctrl+B painel · Ctrl+, config ·
Ctrl+F busca no terminal ·
Ctrl+K paleta (sessões e projetos) · Ctrl+1..9 vai para a aba n · Ctrl+0 pula para a próxima sessão ociosa ·
Shift+Enter quebra linha no terminal · Tab escreve a sugestão · Ctrl+Espaço pede sugestão ·
Ctrl+Shift+C/V copia/cola no terminal · Ctrl+Shift+L limpa e redesenha o terminal · botão do meio fecha aba.

## Performance (medido em 2026-08-29, i9-9900KS, 16 threads)
Percentuais são da máquina inteira (100% = 16 threads).

| Estado | CPU | RAM |
|---|---|---|
| janela aberta, sem aba, bolinha pulsando | **0,64%** | 514 MB |
| janela aberta, 1 sessão do Claude ociosa | **0,68%** | 823 MB (+277 MB do `claude.exe`) |
| escondido na bandeja | **0,02%** | 685 MB |
| Warp, janela aberta, 1 aba parada | 0,03% | 500 MB (405 janela + 85 de serviços que ficam sempre) |

O que dominava o consumo era a bolinha de "trabalhando": animava `box-shadow`, que **força repaint
a cada quadro**. Três bolinhas custavam ~6,5% da máquina com o app parado. A onda passou para um
pseudo-elemento animando só `transform`/`opacity` (composto na GPU) e com `steps(3, end)` —
3 atualizações por ciclo em vez de 60/s: 6,5% → 3,4% → **0,6%**. Em 2026-08-29 a animação saiu de
vez: **trabalhando é verde estático** e **ocioso é laranja** (`--idle`), que já dá para diferenciar
sem custar quadro nenhum. Se um dia voltar a animar, só `transform`/`opacity` e em `steps()`.

Regras que valem para não regredir:
- Nunca animar `box-shadow`, `width`, `top` etc. Só `transform` e `opacity`.
- Animação contínua obriga o compositor a redesenhar a janela toda; se der, use `steps()`.
- `backgroundThrottling: false` (preciso para o ícone da bandeja) faz o renderer continuar a todo
  vapor escondido: por isso `:root.oculto` (via `visibilitychange`) mata animação e o polling de
  git quando a janela não está visível.
- O xterm em si é barato: 1 aba parada custou 0,16%. `LiveSessionWatcher` (1,5s) e o `usage`
  (3 min) não aparecem na medição.

## Regras
- Mensagens e UI em PT-BR.
- Nada aqui toca servidor/produção dos outros projetos — é só um lançador.
