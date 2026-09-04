# Claude Dynasty

Painel desktop (Windows) para tocar os seus projetos com o **Claude Code** sem abrir terminal na
mão. Lista as pastas de um diretório de projetos, mostra a ficha de cada um e abre sessões do
`claude` num terminal embutido — com histórico, git, consumo da conta e bandeja.

Instalando em outra máquina? Veja **[INSTALAR.md](INSTALAR.md)** — está escrito para você colar no
Claude Code e deixar ele montar.

## Rodar

```bash
pnpm install
pnpm build
pnpm start          # ou o atalho "Claude Dynasty" (Menu Iniciar / área de trabalho), ou start.vbs
```

Desenvolvimento com hot reload: `pnpm dev`.

## Como se usa

Clicar num projeto **não abre nada sozinho**: você cai na página dele, com o `CLAUDE.md`
renderizado, o estado do git, as sessões vivas e o histórico. De lá você escolhe **abrir sessão**,
**continuar a última** (`claude --continue`), **retomar** uma do histórico (`claude --resume`) ou
abrir um shell. Enquanto o terminal sobe aparece um aviso de carregando — o `node-pty` bloqueia o
processo principal por um instante nessa hora, e isso é esperado.

## O que tem

- **Sidebar**: projetos com ordem manual (arrastar), fixados no topo, apelido por projeto e
  ocultos. A bolinha diz se há Claude trabalhando naquela pasta — inclusive sessões abertas fora
  do wrapper.
- **Abas**: várias sessões por projeto (Claude ou PowerShell). As abas da execução anterior voltam
  **suspensas** e retomam com um clique. Os dropdowns de modelo e effort trocam o da **sessão
  aberta** (mandam `/model` e `/effort`) e ficam lembrados por projeto.
- **Imagens no terminal**: quando o Claude devolve uma imagem, o caminho vira um **cartão
  flutuante** — arrasta pela barra, redimensiona pelo canto, clique abre em tela cheia com `←`/`→`
  entre as imagens da aba. Posição e tamanho ficam lembrados por projeto.
- **Sugestão de resposta**: quando o Claude termina, a resposta provável aparece numa faixa fina
  acima do terminal; **Tab** escreve na caixa dele (nada é enviado até você apertar Enter), Esc
  descarta. Gasta um `claude -p` com Haiku por resposta — desligável nas configurações.
- **Documentação**: seção da sidebar com arquivos `.md` de verdade numa pasta do disco, editados
  num editor rico dentro do app. Como são arquivos comuns, o próprio Claude pode editá-los numa
  sessão e a mudança aparece na hora.
- **Painel do projeto** (Ctrl+B, começa fechado): git, sessões, infos do `CLAUDE.md`, scripts do
  `package.json`, opções por projeto e histórico.
- **Topo**: consumo 5h / semanal da conta (mesma API do `/usage`) e tema.
- **Bandeja**: ícone com anel e % do limite mais alto, popup de consumo, e os itens de recarregar,
  reiniciar e sair. Fechar a janela esconde na bandeja; as sessões continuam vivas.

## Atalhos

| Tecla | O que faz |
|---|---|
| `Ctrl+T` | nova sessão do Claude no projeto ativo |
| `Ctrl+W` | fecha a aba |
| `Ctrl+Tab` | alterna entre as abas do projeto |
| `Ctrl+1`…`9` | vai para a aba n · `Ctrl+0` pula para a próxima sessão ociosa |
| `Ctrl+K` | paleta de sessões e projetos |
| `Ctrl+B` | painel do projeto · `Ctrl+,` configurações |
| `Ctrl+F` | busca no terminal, com contador |
| `Shift+Enter` | quebra linha no terminal em vez de enviar |
| `Tab` | escreve a sugestão · `Ctrl+Espaço` pede uma na hora |
| `Ctrl+Shift+C/V` | copia e cola no terminal (`Ctrl+V` também cola imagem) |
| `Ctrl+Shift+L` | limpa e redesenha o terminal quando algo de fora suja a tela |
| `Ctrl+roda` | zoom só naquele terminal, lembrado por projeto |

## Mexer no próprio app sem fechá-lo

O app é o seu editor e a sua cobaia ao mesmo tempo — dá para abrir uma sessão do Claude **na pasta
do próprio wrapper**, pedir uma mudança e ver o resultado sem perder as sessões abertas:

```bash
pnpm build          # gera out/
```

Depois, no **menu do ícone da bandeja** (botão direito):

| Item | Quando usar | O que acontece |
|---|---|---|
| **Recarregar a interface** | mudou `src/renderer` ou `src/preload` | recarrega só a janela. Os PTYs vivem no processo principal, então **as sessões do Claude continuam de pé**. Perde só o histórico visual das abas, porque o terminal é remontado. |
| **Reiniciar o app** | mudou `src/main` | reinício de verdade. Passa pelo encerramento normal, então as abas são gravadas e voltam **suspensas**, prontas para retomar com um clique. |

Não precisa fechar e abrir na mão em nenhum dos dois casos. Se preferir hot reload durante o
desenvolvimento, `pnpm dev` recarrega o renderer a cada salvamento (mas roda uma instância
separada da que está no seu dia a dia).

Para conferir uma mudança de interface sem descrever a tela na mão:

```bash
pwsh -File scripts/print-janela.ps1        # PNG em %TEMP%\claude-dynasty-print.png
```

Ele usa `PrintWindow`, não captura de tela: pega a janela mesmo atrás de outras e **sem roubar o
foco**. Útil para pedir ao Claude que olhe o próprio resultado — só não funciona com a janela
minimizada, e nesse caso ele avisa.

`pnpm typecheck` antes de commitar. O **[CLAUDE.md](CLAUDE.md)** deste repo é o mapa do projeto —
tem as decisões e as armadilhas já pagas (por que o cartão de imagem não usa `registerDecoration`,
por que a varredura é throttle e não debounce, o que o `tui` do Claude Code muda no terminal). Se
você for pedir mudanças ao Claude, é ele que dá o contexto.

## Limites

- **Windows**. Usa ConPTY, bandeja e atalhos do Windows; não foi feito para rodar em outro sistema.
- Uso pessoal, sem distribuição: não há instalador nem assinatura de código.
- O app **não faz login nem mexe em credenciais** — só chama o `claude.exe` já instalado e lê o
  que o Claude Code mantém em `~/.claude`.
