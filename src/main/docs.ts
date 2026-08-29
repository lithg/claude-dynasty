/**
 * Documentação: arquivos .md numa pasta só, dentro da raiz dos projetos.
 * São arquivos de verdade no disco justamente para o Claude poder editá-los numa sessão
 * ("edita o TODO da Loja do Managol e adiciona um checklist X").
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, watch, type FSWatcher } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { shell } from 'electron'
import type { DocInfo } from '@shared/types'
import { getConfig } from './config'

export function docsDir(): string {
  const cfg = getConfig()
  return cfg.docsDir || join(cfg.rootDir, 'Documentacao')
}

/** Só deixa mexer em .md dentro da pasta de documentação. */
function dentro(p: string): string {
  const base = resolve(docsDir())
  const alvo = resolve(p)
  if (alvo !== base && !alvo.startsWith(base + '\\') && !alvo.startsWith(base + '/')) {
    throw new Error('fora da pasta de documentação')
  }
  if (!alvo.toLowerCase().endsWith('.md')) throw new Error('só arquivos .md')
  return alvo
}

function nomeArquivo(nome: string): string {
  const limpo = nome
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  if (!limpo) throw new Error('nome vazio')
  return limpo.toLowerCase().endsWith('.md') ? limpo : `${limpo}.md`
}

/** Título = primeiro `# ...` do arquivo; se não tiver, o nome do arquivo. */
function tituloDe(texto: string, arquivo: string): string {
  const m = /^#\s+(.+)$/m.exec(texto.slice(0, 4000))
  return (m?.[1] ?? basename(arquivo, '.md')).trim()
}

export function ensureDocsDir(): string {
  const dir = docsDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'TODO.md'), MODELO_TODO, 'utf-8')
    writeFileSync(join(dir, 'Como usar a documentacao.md'), MODELO_AJUDA, 'utf-8')
  }
  return dir
}

export function listDocs(): DocInfo[] {
  const dir = ensureDocsDir()
  const out: DocInfo[] = []
  for (const f of readdirSync(dir)) {
    if (!f.toLowerCase().endsWith('.md')) continue
    const full = join(dir, f)
    try {
      const st = statSync(full)
      if (!st.isFile()) continue
      const texto = st.size < 512 * 1024 ? readFileSync(full, 'utf-8') : ''
      out.push({ name: f, path: full, title: tituloDe(texto, f), mtime: st.mtimeMs, size: st.size })
    } catch {
      /* arquivo sumiu no meio da leitura */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export function readDoc(path: string): string {
  return readFileSync(dentro(path), 'utf-8')
}

export function writeDoc(path: string, content: string): number {
  const alvo = dentro(path)
  writeFileSync(alvo, content, 'utf-8')
  return statSync(alvo).mtimeMs
}

export function createDoc(nome: string, conteudo?: string): DocInfo {
  const dir = ensureDocsDir()
  let arquivo = nomeArquivo(nome)
  // não sobrescreve: vira "nome 2.md", "nome 3.md"…
  let n = 2
  while (existsSync(join(dir, arquivo))) {
    arquivo = nomeArquivo(`${nome.replace(/\.md$/i, '')} ${n++}`)
  }
  const full = join(dir, arquivo)
  const texto = conteudo ?? `# ${arquivo.replace(/\.md$/i, '')}\n\n`
  writeFileSync(full, texto, 'utf-8')
  const st = statSync(full)
  return { name: arquivo, path: full, title: tituloDe(texto, arquivo), mtime: st.mtimeMs, size: st.size }
}

export function renameDoc(path: string, nome: string): DocInfo {
  const atual = dentro(path)
  const novo = join(docsDir(), nomeArquivo(nome))
  if (novo !== atual) {
    if (existsSync(novo)) throw new Error('já existe um documento com esse nome')
    renameSync(atual, novo)
  }
  const st = statSync(novo)
  const texto = readFileSync(novo, 'utf-8')
  return { name: basename(novo), path: novo, title: tituloDe(texto, novo), mtime: st.mtimeMs, size: st.size }
}

/** Vai para a lixeira, não some para sempre. */
export async function deleteDoc(path: string): Promise<void> {
  await shell.trashItem(dentro(path))
}

let watcher: FSWatcher | null = null

/** Avisa quando alguém de fora mexe nos arquivos (o Claude numa sessão, o Explorer…). */
export function watchDocs(onChange: () => void): void {
  stopWatchDocs()
  try {
    const dir = ensureDocsDir()
    let timer: NodeJS.Timeout | null = null
    watcher = watch(dir, { persistent: false }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(onChange, 250)
    })
  } catch {
    /* sem watcher: a lista atualiza quando você troca de documento */
  }
}

export function stopWatchDocs(): void {
  watcher?.close()
  watcher = null
}

const MODELO_TODO = `# TODO geral

Este é o seu quadro de tarefas. Marque clicando direto nas caixinhas — o arquivo é salvo na hora.

## Como isto funciona

- Os documentos são arquivos \`.md\` de verdade, numa pasta ao lado dos seus projetos.
- Tudo é salvo sozinho enquanto você escreve.
- O Claude também consegue editar: numa sessão, peça por exemplo
  *"edita o TODO da Loja do Managol e adiciona um checklist de deploy"*.

## Em andamento

- [x] Montar o Claude Dynasty
- [x] Deixar o consumo de CPU decente
- [ ] Usar por uma semana e anotar o que incomoda
- [ ] Contar para mais alguém

## Ideias para depois

- [ ] Empacotar o app de verdade (hoje o atalho aponta para o \`electron.exe\` do \`node_modules\`)
- [ ] Guardar o histórico do terminal para a aba restaurada não abrir em branco
- [ ] Um atalho para pular direto para a sessão que terminou

## Formatação que dá para usar

**negrito**, *itálico*, \`código\`, [links](https://claude.ai/code) e listas normais:

1. primeiro
2. segundo
3. terceiro

> Citação, para destacar uma decisão ou um recado.

| Projeto | Estado | Próximo passo |
|---|---|---|
| Lapides | produção | revisar backup |
| Managol | produção | loja |

\`\`\`bash
pnpm dev    # blocos de código também funcionam
\`\`\`
`

const MODELO_AJUDA = `# Como usar a documentação

Cada documento aqui é um arquivo \`.md\` na pasta de documentação (o caminho aparece no rodapé da
lista). Nada fica preso dentro do app.

## O básico

- **+** cria um documento novo.
- Arraste na lista para mudar a ordem.
- Botão direito: renomear, abrir a pasta, excluir (vai para a lixeira).
- **Editar / Ver**: alterna entre o texto puro e o resultado formatado.
- As caixinhas \`- [ ]\` podem ser marcadas com um clique na visualização.

## Pedindo para o Claude escrever

Como são arquivos comuns, numa sessão do Claude você pode pedir:

> *"Cria um documento chamado 'Deploy do Managol' com o passo a passo que a gente usa e um
> checklist de conferência."*

E depois:

> *"No TODO geral, marca como concluído o item de empacotar o app."*

Se o Claude mexer no arquivo enquanto você está com ele aberto, a tela atualiza sozinha.

## Dicas de formatação

# Título 1
## Título 2
### Título 3

- item de lista
  - item aninhado
- [ ] tarefa aberta
- [x] tarefa concluída

Separador:

---

E é isso. O resto é escrever.
`
