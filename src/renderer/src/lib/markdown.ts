/**
 * Markdown → HTML, o suficiente para documentação bonita: títulos, listas (com checkbox),
 * tabelas, citações, código, links, imagens locais, separadores.
 *
 * Escrito à mão de propósito: assim o HTML sai de uma lista branca e um documento com
 * `<script>` (colado da internet, escrito por um agente) não vira código rodando no renderer.
 */

const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c])
}

function linkSeguro(url: string): string | null {
  const u = url.trim()
  if (/^(https?:|mailto:)/i.test(u)) return u
  if (/^[a-zA-Z]:[\\/]/.test(u) || u.startsWith('./') || u.startsWith('../') || u.startsWith('#')) return u
  return null
}

/** Trechos em linha: código, negrito, itálico, riscado, link, imagem. */
function inline(texto: string): string {
  const codigos: string[] = []
  // o código inline sai da frente primeiro, senão * e _ dentro dele viram formatação;
  // volta no lugar depois do escape, por um marcador improvável de aparecer no texto
  let s = texto.replace(/`([^`]+)`/g, (_m, c) => {
    codigos.push(`<code>${esc(c)}</code>`)
    return `@@COD${codigos.length - 1}@@`
  })

  s = esc(s)

  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const safe = linkSeguro(url)
    return safe ? `<img src="${safe}" alt="${alt}">` : m
  })
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => {
    const safe = linkSeguro(url)
    return safe ? `<a href="${safe}">${txt}</a>` : m
  })
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
  s = s.replace(/(^|[^*])\*(?=\S)([^*]*?\S)\*/g, '$1<em>$2</em>')
  s = s.replace(/(^|\W)_(?=\S)([^_]*?\S)_(?=\W|$)/g, '$1<em>$2</em>')
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')

  return s.replace(/@@COD(\d+)@@/g, (_m, i) => codigos[Number(i)])
}

interface Linha {
  tipo: 'ul' | 'ol'
  nivel: number
}

/** Marcador interno da quebra dura dentro de um parágrafo (não aparece no documento). */
const MARCA_BR = '@@QUEBRA@@'

/**
 * Converte o documento inteiro. `linhaDaTarefa` numera as caixinhas na ordem em que aparecem,
 * para o clique saber qual `- [ ]` do arquivo alternar.
 */
export function render(md: string): string {
  const linhas = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  const pilha: Linha[] = []
  let tarefa = 0
  let paragrafo: string[] = []
  let i = 0

  const fechaListas = (ate = 0): void => {
    while (pilha.length > ate) out.push(pilha.pop()!.tipo === 'ul' ? '</ul>' : '</ol>')
  }
  const fechaParagrafo = (): void => {
    if (paragrafo.length) {
      // linha terminada em dois espaços = quebra dura (o editor rico grava assim o Shift+Enter)
      out.push(`<p>${inline(paragrafo.join(' ')).replace(new RegExp(`${MARCA_BR} ?`, 'g'), '<br>')}</p>`)
      paragrafo = []
    }
  }

  while (i < linhas.length) {
    const linha = linhas[i]

    // bloco de código
    const fence = /^\s*```+\s*([\w+-]*)\s*$/.exec(linha)
    if (fence) {
      fechaParagrafo()
      fechaListas()
      const corpo: string[] = []
      i++
      while (i < linhas.length && !/^\s*```+\s*$/.test(linhas[i])) corpo.push(linhas[i++])
      i++
      const lang = fence[1] ? ` class="lang-${esc(fence[1])}"` : ''
      out.push(`<pre><code${lang}>${esc(corpo.join('\n'))}</code></pre>`)
      continue
    }

    // tabela: | a | b | seguida de |---|---|
    if (/^\s*\|.*\|\s*$/.test(linha) && /^\s*\|[\s:|-]+\|\s*$/.test(linhas[i + 1] ?? '')) {
      fechaParagrafo()
      fechaListas()
      const celulas = (l: string): string[] =>
        l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const cab = celulas(linha)
      i += 2
      const corpo: string[][] = []
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) corpo.push(celulas(linhas[i++]))
      out.push(
        `<table><thead><tr>${cab.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>` +
          corpo.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table>'
      )
      continue
    }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(linha)) {
      fechaParagrafo()
      fechaListas()
      out.push('<hr>')
      i++
      continue
    }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(linha)
    if (titulo) {
      fechaParagrafo()
      fechaListas()
      const n = titulo[1].length
      out.push(`<h${n}>${inline(titulo[2])}</h${n}>`)
      i++
      continue
    }

    const citacao = /^\s*>\s?(.*)$/.exec(linha)
    if (citacao) {
      fechaParagrafo()
      fechaListas()
      const corpo: string[] = [citacao[1]]
      i++
      while (i < linhas.length && /^\s*>\s?(.*)$/.test(linhas[i])) {
        corpo.push(/^\s*>\s?(.*)$/.exec(linhas[i])![1])
        i++
      }
      out.push(`<blockquote>${render(corpo.join('\n'))}</blockquote>`)
      continue
    }

    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(linha)
    if (item) {
      fechaParagrafo()
      const nivel = Math.floor(item[1].replace(/\t/g, '  ').length / 2)
      const tipo: 'ul' | 'ol' = /\d/.test(item[2]) ? 'ol' : 'ul'
      while (pilha.length && pilha[pilha.length - 1].nivel > nivel) fechaListas(pilha.length - 1)
      if (!pilha.length || pilha[pilha.length - 1].nivel < nivel) {
        out.push(tipo === 'ul' ? '<ul>' : '<ol>')
        pilha.push({ tipo, nivel })
      } else if (pilha[pilha.length - 1].tipo !== tipo) {
        fechaListas(pilha.length - 1)
        out.push(tipo === 'ul' ? '<ul>' : '<ol>')
        pilha.push({ tipo, nivel })
      }
      const check = /^\[([ xX])\]\s+(.*)$/.exec(item[3])
      if (check) {
        const marcado = check[1].toLowerCase() === 'x'
        out.push(
          `<li class="task${marcado ? ' done' : ''}">` +
            `<input type="checkbox" data-task="${tarefa++}"${marcado ? ' checked' : ''}>` +
            `<span>${inline(check[2])}</span></li>`
        )
      } else {
        out.push(`<li>${inline(item[3])}</li>`)
      }
      i++
      continue
    }

    if (!linha.trim()) {
      fechaParagrafo()
      fechaListas()
      i++
      continue
    }

    paragrafo.push(/ {2,}$/.test(linha) ? `${linha.trim()}${MARCA_BR}` : linha.trim())
    i++
  }

  fechaParagrafo()
  fechaListas()
  return out.join('\n')
}

/* ------------------------------------------------------------------ *
 * Caminho de volta: HTML do editor → markdown.
 *
 * O editor da Documentação é um `contentEditable`: o usuário escreve já formatado e o que vai
 * para o arquivo é o resultado desta serialização. Ela entende o que o `render` produz e também
 * o que o próprio navegador inventa ao editar (`<div>`, `<b>`, `<i>`, listas aninhadas soltas).
 * ------------------------------------------------------------------ */

/** Texto de um nó inline: tira &nbsp; e quebras de linha "de formatação" do HTML. */
function limpa(texto: string): string {
  return texto.replace(/ /g, ' ').replace(/[\r\n]+/g, ' ')
}

/** Envolve em `**`, `*`, `~~`… preservando os espaços das pontas (senão o markdown não fecha). */
function envolve(texto: string, marca: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(texto)!
  return m[2] ? `${m[1]}${marca}${m[2]}${marca}${m[3]}` : texto
}

function inlineDe(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return limpa(node.textContent ?? '')
  if (!(node instanceof HTMLElement)) return ''
  const dentro = (): string => Array.from(node.childNodes).map(inlineDe).join('')
  switch (node.tagName) {
    case 'BR':
      return '  \n'
    case 'STRONG':
    case 'B':
      return envolve(dentro(), '**')
    case 'EM':
    case 'I':
      return envolve(dentro(), '*')
    case 'DEL':
    case 'S':
    case 'STRIKE':
      return envolve(dentro(), '~~')
    case 'CODE':
      return node.closest('pre') ? dentro() : envolve(dentro(), '`')
    case 'A': {
      const href = node.getAttribute('href') ?? ''
      const texto = dentro()
      return href ? `[${texto || href}](${href})` : texto
    }
    case 'IMG':
      return `![${node.getAttribute('alt') ?? ''}](${node.getAttribute('src') ?? ''})`
    case 'INPUT':
      return ''
    default:
      return dentro()
  }
}

/** Conteúdo de um bloco em uma linha só (as quebras duras viram "  \n"). */
function texto(el: HTMLElement): string {
  return Array.from(el.childNodes)
    .map(inlineDe)
    .join('')
    .replace(/[ \t]+$/gm, (s) => (s.length >= 2 ? '  ' : ''))
    .trim()
}

function lista(el: HTMLElement, nivel: number): string {
  const linhas: string[] = []
  const recuo = '  '.repeat(nivel)
  let n = 1
  for (const filho of Array.from(el.children)) {
    // o navegador às vezes deixa a sublista como irmã do <li>, não dentro dele
    if (filho.tagName === 'UL' || filho.tagName === 'OL') {
      linhas.push(lista(filho as HTMLElement, nivel + 1))
      continue
    }
    if (filho.tagName !== 'LI') continue
    const li = filho as HTMLElement
    const subs = Array.from(li.children).filter((c) => c.tagName === 'UL' || c.tagName === 'OL')
    const corpo = Array.from(li.childNodes)
      .filter((c) => !(c instanceof HTMLElement && (c.tagName === 'UL' || c.tagName === 'OL')))
      .map(inlineDe)
      .join('')
      .trim()
    const caixa = li.querySelector<HTMLInputElement>('input[type=checkbox]')
    const marca = el.tagName === 'OL' ? `${n++}.` : '-'
    linhas.push(`${recuo}${marca} ${caixa ? (caixa.checked ? '[x] ' : '[ ] ') : ''}${corpo}`)
    for (const sub of subs) linhas.push(lista(sub as HTMLElement, nivel + 1))
  }
  return linhas.filter(Boolean).join('\n')
}

function tabela(el: HTMLElement): string {
  const linhas: string[] = []
  Array.from(el.querySelectorAll('tr')).forEach((tr, i) => {
    const celulas = Array.from(tr.children).map((c) => inlineDe(c).trim().replace(/\|/g, '\\|'))
    if (!celulas.length) return
    linhas.push(`| ${celulas.join(' | ')} |`)
    if (i === 0) linhas.push(`|${celulas.map(() => ' --- ').join('|')}|`)
  })
  return linhas.join('\n')
}

function bloco(node: Node, nivel: number): string {
  if (node.nodeType === Node.TEXT_NODE) return limpa(node.textContent ?? '').trim()
  if (!(node instanceof HTMLElement)) return ''
  const tag = node.tagName
  if (/^H[1-6]$/.test(tag)) {
    const t = texto(node)
    return t ? `${'#'.repeat(Number(tag[1]))} ${t}` : ''
  }
  if (tag === 'UL' || tag === 'OL') return lista(node, nivel)
  if (tag === 'BLOCKQUOTE')
    return blocosDe(node, nivel)
      .join('\n\n')
      .split('\n')
      .map((l) => (l ? `> ${l}` : '>'))
      .join('\n')
  if (tag === 'PRE') {
    const code = node.querySelector('code')
    const lang = /lang-([\w+-]+)/.exec(code?.className ?? '')?.[1] ?? ''
    const corpo = (code ?? node).textContent?.replace(/\n+$/, '') ?? ''
    return '```' + lang + '\n' + corpo + '\n```'
  }
  if (tag === 'HR') return '---'
  if (tag === 'TABLE') return tabela(node)
  if (tag === 'BR') return ''
  // <p>, <div> e o que mais o contentEditable criar
  return texto(node)
}

function blocosDe(pai: Node, nivel: number): string[] {
  return Array.from(pai.childNodes)
    .map((f) => bloco(f, nivel))
    .filter((b) => b !== '')
}

/** HTML do editor rico → markdown para gravar no arquivo. */
export function toMarkdown(root: HTMLElement): string {
  const md = blocosDe(root, 0)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, (s) => (s.length >= 2 ? '  ' : ''))
    .trim()
  return md ? `${md}\n` : ''
}
