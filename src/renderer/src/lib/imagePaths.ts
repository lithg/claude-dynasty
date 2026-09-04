import type { Terminal } from '@xterm/xterm'

const EXT = 'png|jpe?g|gif|webp|bmp|avif|ico|svg'
/** Caractere que ainda faz parte de um caminho (String.raw: nada de escape duplo aqui). */
const C = String.raw`[^\s"'<>|*?]`

/**
 * De propósito generosa: quem decide se é imagem de verdade é o main — `images:thumb` devolve
 * null quando o arquivo não existe, e é esse null que mata os falsos positivos. Aqui só
 * interessa não deixar caminho passar.
 *
 * Sem a alternativa "nome solto" (`foo.png`): daria miniatura para qualquer arquivo citado no
 * meio de uma frase. Os olhares-para-trás são o que impede `https://x/a.png` de virar a unidade
 * `s:\` (segunda alternativa) ou o caminho absoluto `//x/a.png` (terceira).
 */
const RE = new RegExp(
  String.raw`"([^"\n]+?\.(?:${EXT}))"` + // entre aspas (único jeito de aceitar espaço)
    String.raw`|((?:(?<![\w:])[A-Za-z]:[\\/]|~[\\/]|\.{1,2}[\\/])${C}*?\.(?:${EXT}))` + // C:\… ~\… .\…
    String.raw`|((?<![:\w\\/])/${C}*?\.(?:${EXT}))` + // /home/…
    String.raw`|([\w.\-]+(?:[\\/][\w.\-]+)+\.(?:${EXT}))`, // src/assets/logo.png
  'gi'
)

/** Acaba com um pedaço de caminho colado no fim da linha: provável quebra do TUI. */
const CORTADO = new RegExp(String.raw`[\\/]${C}*$`)
const COMPLETO = new RegExp(String.raw`\.(?:${EXT})$`, 'i')

/** Calha que o Claude Code desenha à esquerda das linhas de continuação. */
const CALHA = /^[\s\u2502\u23bf\u23bd\u2570\u256d\u2500|]+/

/** Quantas linhas seguintes o varredor tenta colar para remontar um caminho quebrado. */
const MAX_CONT = 3

export interface AchadoImagem {
  /** linha absoluta do buffer onde o caminho **termina** — é lá que a miniatura ancora */
  linha: number
  path: string
}

interface Pedaco {
  ini: number
  fim: number
  y: number
}

function texto(term: Terminal, y: number): string {
  return term.buffer.active.getLine(y)?.translateToString(true) ?? ''
}

/**
 * Varre `[de, ate]` do buffer atrás de caminhos de imagem.
 *
 * O caminho não vem numa linha só: o TUI do Claude quebra no meio da palavra e ainda indenta a
 * continuação (`…\scr` + `    atchpad\ficha.png`). Não é wrap do xterm — o `isWrapped` é false —,
 * então a colagem é na mão, e só quando a linha parece cortada no meio de um caminho.
 */
export function acharImagens(term: Terminal, de: number, ate: number): AchadoImagem[] {
  const achados = new Map<string, AchadoImagem>()
  const fim = Math.min(ate, term.buffer.active.length - 1)

  for (let y = Math.max(0, de); y <= fim; y++) {
    let acc = texto(term, y)
    if (!acc.trim()) continue
    const pedacos: Pedaco[] = [{ ini: 0, fim: acc.length, y }]
    coletar(acc, pedacos, achados)

    for (let k = 1; k <= MAX_CONT && y + k <= fim; k++) {
      if (COMPLETO.test(acc) || !CORTADO.test(acc)) break
      const seguinte = texto(term, y + k).replace(CALHA, '')
      if (!seguinte) break
      const ini = acc.length
      acc += seguinte
      pedacos.push({ ini, fim: acc.length, y: y + k })
      coletar(acc, pedacos, achados)
    }
  }

  // Colar linha a linha acha o caminho inteiro e também os pedaços dele (`…\scr` +
  // `atchpad\ficha.png` acha `atchpad\ficha.png` sozinho). O fragmento é sempre um sufixo do
  // caminho bom e termina na mesma linha: fica só o mais longo.
  const todos = [...achados.values()]
  return todos
    .filter((a) => !todos.some((b) => b !== a && b.linha === a.linha && b.path.length > a.path.length && b.path.endsWith(a.path)))
    .sort((a, b) => a.linha - b.linha)
}

function coletar(acc: string, pedacos: Pedaco[], out: Map<string, AchadoImagem>): void {
  RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE.exec(acc))) {
    const path = m[1] ?? m[2] ?? m[3] ?? m[4]
    if (!path) continue
    const ultimo = m.index + m[0].length - 1
    const linha = (pedacos.find((p) => ultimo >= p.ini && ultimo < p.fim) ?? pedacos[pedacos.length - 1]).y
    const chave = `${linha}|${path}`
    if (!out.has(chave)) out.set(chave, { linha, path })
  }
}
