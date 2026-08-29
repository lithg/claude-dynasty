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
      out.push(`<p>${inline(paragrafo.join(' '))}</p>`)
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

    paragrafo.push(linha.trim())
    i++
  }

  fechaParagrafo()
  fechaListas()
  return out.join('\n')
}

/** Alterna a n-ésima caixinha do texto (mesma ordem que o render numerou). */
export function toggleTask(md: string, indice: number): string {
  let n = 0
  return md
    .split('\n')
    .map((linha) => {
      const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\].*)$/.exec(linha)
      if (!m) return linha
      if (n++ !== indice) return linha
      return m[1] + (m[2].toLowerCase() === 'x' ? ' ' : 'x') + m[3]
    })
    .join('\n')
}
