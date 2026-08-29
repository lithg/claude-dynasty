# Instalar o Claude Dynasty em outra máquina

Guia para montar o app numa máquina nova. Foi escrito para você **colar no Claude Code e deixar
ele executar** — cada passo tem o comando e o que conferir depois. Também dá para seguir na mão.

> Se você é a IA lendo isto: siga os passos na ordem, confira o "esperado" de cada um antes de
> continuar e **não invente caminhos** — pergunte ao usuário quando um passo depender de escolha
> dele (a pasta de projetos é escolhida na primeira execução, dentro do próprio app).

## 0. O que é

Painel desktop (Electron) que lista as pastas de um diretório de projetos e abre uma sessão do
`claude` dentro de cada uma, num terminal embutido. Mostra sessões vivas, git, consumo da conta,
histórico e bandeja. É Windows-only na prática (usa ConPTY, bandeja e atalhos do Windows).

## 1. Pré-requisitos

| Item | Como conferir | Se faltar |
|---|---|---|
| Windows 10/11 | — | — |
| Node.js 20+ | `node -v` | https://nodejs.org (LTS) |
| pnpm 9+ | `pnpm -v` | `npm i -g pnpm` |
| git | `git --version` | https://git-scm.com |
| Claude Code | `claude --version` | `npm i -g @anthropic-ai/claude-code` |
| Conta logada | rodar `claude` uma vez e sair com `/exit` | fazer login pelo próprio `claude` |

O último item importa: o wrapper **não faz login nem mexe em credenciais**. Ele só chama o
`claude.exe` que já está instalado e lê o que o Claude Code grava em `~/.claude`. Se o `claude`
não abre no terminal, o wrapper também não vai abrir.

## 2. Clonar e compilar

```bash
git clone <url-do-repo> "Claude Dynasty"
cd "Claude Dynasty"
pnpm install          # baixa Electron e node-pty (prebuild, não compila nada em C++)
pnpm build            # gera out/
```

Esperado: `out/main`, `out/preload` e `out/renderer` criados, sem erro.

Se o `pnpm install` reclamar de scripts de postinstall bloqueados, o `pnpm-workspace.yaml` do repo
já libera os necessários (`electron`, `node-pty`, `esbuild`) — basta rodar de novo.

## 3. Primeira execução

```bash
pnpm start
```

Na primeira vez aparece a tela de boas-vindas pedindo **a pasta onde ficam os seus projetos**
(cada subpasta vira um item na barra da esquerda; ex.: `C:\Users\voce\Documents\GitHub`). Escolha
a pasta, deixe marcado "criar atalhos" e clique em **começar**.

Se a tela avisar que não achou o `claude.exe`, confira o passo 1 e depois aponte o caminho em
Configurações (Ctrl+,), campo `claude.exe`.

## 4. Atalhos e início com o Windows

Os atalhos ("Claude Dynasty" no Menu Iniciar e na área de trabalho) são criados pelo próprio app —
pela tela de boas-vindas ou por Configurações → **criar atalhos**. Eles gravam o
`AppUserModelID`, que é o que faz as notificações aparecerem como "Claude Dynasty" em vez de
"Electron".

Iniciar junto com o Windows (escondido na bandeja) é o checkbox `windows → iniciar junto com o
Windows` em Configurações. Ele escreve/apaga a chave
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Claude Dynasty`.

## 5. Conferir se ficou de pé

- A barra da esquerda lista as pastas do diretório escolhido.
- Clicar num projeto abre uma aba com o Claude rodando naquela pasta.
- O topo mostra o consumo (5h / semanal) da conta logada.
- A bandeja tem o ícone com a % do limite; clique esquerdo abre o popup.
- Fechar a janela esconde na bandeja; sair de verdade é pelo menu do ícone.

## 6. Ajustes que talvez você queira

Tudo em Configurações (Ctrl+,), gravado em `%APPDATA%\claude-dynasty\config.json`:

- **permissões**: `--dangerously-skip-permissions` vem **ligado** por padrão (o dono do projeto
  original usa assim). Se você não quer que o Claude execute coisas sem perguntar, **desligue**.
- **modelo / effort**: padrão do Claude Code se deixar em branco.
- **sugerir a resposta sozinho**: usa um `claude -p` com Haiku a cada resposta para pré-preencher
  a caixa de prompt. Consome cota — desligue se não quiser.
- **tema**, tamanho de fonte, notificações, bandeja.

## 7. Atualizar depois

```bash
git pull
pnpm install
pnpm build
```
E reabra o app (bandeja → Sair → atalho). As abas abertas voltam suspensas e retomam com um clique.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Aba abre e fecha na hora | `claude.exe` não encontrado ou conta não logada — rode `claude` no terminal |
| "Electron" nas notificações | atalhos não criados: Configurações → criar atalhos |
| Consumo vazio / erro 429 | a API de consumo limita consultas; o app faz backoff sozinho e usa o último valor |
| Nenhum projeto na lista | pasta raiz errada em Configurações → `pasta raiz` |
| App abre duas vezes no boot | havia um atalho antigo em `shell:startup`; apague-o e use o checkbox das Configurações |

## O que o app faz com os seus arquivos

Só leitura, e só local: lista as pastas do diretório escolhido, lê `CLAUDE.md`, `package.json` e o
git de cada projeto, e lê os arquivos que o Claude Code já mantém em `~/.claude` (sessões vivas,
histórico e o token, este último apenas para consultar o consumo). Não grava nada fora de
`%APPDATA%\claude-dynasty`, dos atalhos e da chave `Run` (quando você liga o início automático).
