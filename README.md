# Claude Dynasty

Painel pessoal para tocar os projetos de `~/Documents/GitHub` com o Claude Code sem abrir terminal
na mão. Clica no projeto → sessão `claude` já aberta na pasta, com `--dangerously-skip-permissions`
(opcional, global ou por projeto).

Instalando em outra máquina? Veja **[INSTALAR.md](INSTALAR.md)** — está escrito para você colar no
Claude Code e deixar ele montar.

## Rodar
```
pnpm install
pnpm build
pnpm start          # ou: atalho "Claude Dynasty" (Menu Iniciar / área de trabalho) ou start.vbs
```
Desenvolvimento com hot reload: `pnpm dev`.

## O que mostra
- **Sidebar**: projetos (fixados no topo), bolinha verde pulsando = Claude trabalhando naquela pasta,
  verde fixa = sessão ociosa; inclui sessões abertas fora do wrapper.
- **Abas**: várias sessões por projeto (Claude ou PowerShell); as abas da última execução voltam
  suspensas e retomam com `claude --resume` num clique. Os dropdowns de modelo/effort trocam o
  modelo **da sessão aberta** (mandam `/model`) e ficam lembrados por projeto.
- **Caixa de prompt** multi-linha embaixo: Enter quebra linha, Ctrl+Enter envia, ↑ traz o histórico,
  Ctrl+V cola imagem, Esc volta ao terminal e Ctrl+I volta para a caixa.
- **Ctrl+F**: busca no terminal com contador de ocorrências; **Ctrl+Shift+L** limpa e redesenha o
  terminal quando alguma saída de fora suja a tela.
- **Ctrl + roda do mouse** dá zoom só no terminal daquele projeto (não na UI toda), e o tamanho
  fica salvo para a próxima vez que você abrir o projeto.
- **Ctrl+K**: paleta para pular entre sessões abertas e projetos só com o teclado (Ctrl+1..9 vai
  direto para a aba n; Ctrl+0 pula para a próxima sessão que ficou ociosa).
- **Shift+Enter** e **Shift+Espaço** quebram linha em vez de enviar, como no Warp.
- **Sugestão de resposta**: quando o Claude termina, a resposta provável aparece sozinha na caixa
  como placeholder apagadinho — **Tab** escreve de verdade, Esc descarta e nada é enviado sem
  Ctrl+Enter (**Ctrl+Espaço** pede uma sugestão na hora). Roda um `claude -p` com Haiku por resposta; desligável nas configurações.
- **Painel direito**: git (branch, sujo, último commit), sessões vivas, infos do `CLAUDE.md`
  (resumo, URLs, comandos SSH para copiar), scripts do `package.json` (rodam num shell),
  opções por projeto e histórico de sessões com **retomar** (`claude --resume`).
- **Topo**: consumo 5h / semanal da conta (mesma API do `/usage`), tema dark/light/system.
- **Bandeja** (substitui o Usage Tray): ícone com anel + % do limite mais alto; clique = popup de
  consumo, botão direito = abrir o wrapper / sair; inicia com o Windows escondido na bandeja.
- **Abas**: "+" abre outra sessão no mesmo projeto; dropdowns de modelo/effort lembrados por projeto;
  badge/botão **RC** mostra o Remote Control (clique = QR/desconectar, botão direito = abrir no claude.ai).
- **Documentação**: seção própria na sidebar com documentos em markdown — cria pelo "+", edita com
  salvamento automático, marca as caixinhas com um clique, renomeia e reordena arrastando. São
  arquivos `.md` numa pasta ao lado dos projetos, então dá para pedir ao Claude *"edita o TODO da
  Loja do Managol e adiciona um checklist"* e a tela atualiza sozinha.
- **Projetos**: "+" cria uma pasta nova na raiz, botão direito renomeia (só o rótulo) e dá para
  reordenar arrastando.
- **Temas**: escuro, claro, sistema, Claude (laranja), Matrix, Dracula, Synthwave, Nord, Gruvbox,
  Solarized, Monokai, âmbar retrô — mudam a UI e o terminal do Claude.
- **Ctrl+V** cola imagem direto no Claude; arrastar arquivo cola o caminho.
- **Inicia com o Windows** escondido na bandeja (checkbox nas configurações).

Config em `%APPDATA%\claude-dynasty\config.json`.
