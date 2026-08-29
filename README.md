# Wrapper Claude

Painel pessoal para tocar os projetos de `~/Documents/GitHub` com o Claude Code sem abrir terminal
na mão. Clica no projeto → sessão `claude` já aberta na pasta, com `--dangerously-skip-permissions`
(opcional, global ou por projeto).

## Rodar
```
pnpm install
pnpm build
pnpm start          # ou: atalho "Claude Wrapper" (Menu Iniciar / área de trabalho) ou start.vbs
```
Desenvolvimento com hot reload: `pnpm dev`.

## O que mostra
- **Sidebar**: projetos (fixados no topo), bolinha verde pulsando = Claude trabalhando naquela pasta,
  verde fixa = sessão ociosa; inclui sessões abertas fora do wrapper.
- **Abas**: várias sessões por projeto (Claude ou PowerShell); caixa de prompt multi-linha embaixo.
- **Painel direito**: git (branch, sujo, último commit), sessões vivas, infos do `CLAUDE.md`
  (resumo, URLs, comandos SSH para copiar), scripts do `package.json` (rodam num shell),
  opções por projeto e histórico de sessões com **retomar** (`claude --resume`).
- **Topo**: consumo 5h / semanal da conta (mesma API do `/usage`), tema dark/light/system.
- **Bandeja** (substitui o Usage Tray): ícone com anel + % do limite mais alto; clique = popup de
  consumo, botão direito = abrir o wrapper / sair; inicia com o Windows escondido na bandeja.
- **Abas**: "+" abre outra sessão no mesmo projeto; dropdowns de modelo/effort lembrados por projeto;
  badge/botão **RC** mostra o Remote Control (clique = QR/desconectar, botão direito = abrir no claude.ai).
- **Temas**: escuro, claro, sistema, Claude (laranja), Matrix, Dracula, Synthwave, Nord, Gruvbox,
  Solarized, Monokai, âmbar retrô — mudam a UI e o terminal do Claude.
- **Ctrl+V** cola imagem direto no Claude; arrastar arquivo cola o caminho.

Config em `%APPDATA%\wrapper-claude\config.json`.
