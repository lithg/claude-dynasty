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
- **Abas**: várias sessões por projeto (Claude ou PowerShell); as abas da última execução voltam
  suspensas e retomam com `claude --resume` num clique.
- **Caixa de prompt** multi-linha embaixo: Enter quebra linha, Ctrl+Enter envia, ↑ traz o histórico,
  Ctrl+V cola imagem, Esc volta ao terminal e Ctrl+I volta para a caixa.
- **Ctrl+F**: busca no terminal com contador de ocorrências.
- **Ctrl+K**: paleta para pular entre sessões abertas e projetos só com o teclado (Ctrl+1..9 vai
  direto para a aba n; Ctrl+0 pula para a próxima sessão que ficou ociosa).
- **Shift+Enter** quebra linha no terminal em vez de enviar, como no Warp.
- **Ctrl+Espaço** (ou o botão ✨) sugere a resposta provável à última mensagem do Claude: ela
  aparece só como placeholder apagadinho, Enter escreve de verdade, Esc descarta e nada é enviado
  sem Ctrl+Enter. Roda um `claude -p` com Haiku, então só acontece quando você pede.
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
- **Inicia com o Windows** escondido na bandeja (checkbox nas configurações).

Config em `%APPDATA%\wrapper-claude\config.json`.
