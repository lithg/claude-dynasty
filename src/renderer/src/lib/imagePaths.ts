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

/**
 * Segunda passada, tolerando **espaço** no caminho — sem aspas, que é como o Claude escreve
 * (`~\Documents\GitHub\Wrapper Claude\src\…\logo.png`). Precisa ser uma passada separada: numa
 * alternativa só, a versão sem espaço casaria primeiro na mesma posição e esta nunca rodaria.
 *
 * Só com âncora absoluta e com teto de tamanho, senão a preguiçosa engoliria a frase inteira até
 * o próximo `.png`. O que sobrar de errado morre na validação do main, e o filtro de sufixo joga
 * fora o pedaço que a passada sem espaço achou depois do espaço.
 */
const RE_ESPACO = new RegExp(
  String.raw`((?:(?<![\w:])[A-Za-z]:[\\/]|~[\\/]|(?<![:\w\\/])/)[^"'<>|*?\n]{0,200}?\.(?:${EXT}))`,
  'gi'
)

/**
 * Acaba com um pedaço de caminho colado no fim da linha: provável quebra do TUI.
 *
 * Já foi relaxado para "acaba no meio de qualquer token" achando que era isso que perdia a quebra
 * no meio do nome da pasta — não era: esta versão já cobre o caso, e a relaxada custava 7× mais
 * (4,25 ms contra 0,62 ms por varredura), porque quase toda linha de prosa passava a tentar colar.
 */
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
  for (const re of [RE, RE_ESPACO]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(acc))) {
      const path = m.slice(1).find((g) => g != null)
      if (!path) continue
      const ultimo = m.index + m[0].length - 1
      const linha = (pedacos.find((p) => ultimo >= p.ini && ultimo < p.fim) ?? pedacos[pedacos.length - 1]).y
      const chave = `${linha}|${path}`
      if (!out.has(chave)) out.set(chave, { linha, path })
    }
  }
}
