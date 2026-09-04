import { nativeImage, shell } from 'electron'
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, isAbsolute, join, resolve } from 'node:path'
import type { ImageFull, ImageThumb } from '@shared/types'

/** Extensões que o wrapper aceita mostrar inline. */
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
}

/** Acima disso não vale a pena jogar em base64 pelo IPC. */
const MAX_BYTES = 24 * 1024 * 1024

/** `~\x`, relativo ao projeto, aspas do terminal — vira caminho absoluto de verdade. */
function absoluto(cru: string, cwd?: string): string {
  let p = cru.trim().replace(/^["'`]+|["'`]+$/g, '')
  if (p === '~' || /^~[/\\]/.test(p)) p = join(homedir(), p.slice(1))
  if (!isAbsolute(p)) p = resolve(cwd && isAbsolute(cwd) ? cwd : homedir(), p)
  return p
}

interface Ref {
  path: string
  size: number
  ext: string
}

/** null = não é imagem, não existe, está vazia ou é grande demais. É este `null` que mata
 *  os falsos positivos da varredura do terminal — lá a regex é de propósito generosa. */
function referencia(cru: string, cwd?: string): Ref | null {
  try {
    const path = absoluto(cru, cwd)
    const ext = extname(path).toLowerCase()
    if (!MIME[ext]) return null
    const st = statSync(path)
    if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) return null
    return { path, size: st.size, ext }
  } catch {
    return null
  }
}

/** Miniatura em data URL, para a decoration em cima da linha do terminal. */
export function imageThumb(cru: string, cwd: string | undefined, altura = 180): ImageThumb | null {
  const ref = referencia(cru, cwd)
  if (!ref) return null
  const img = nativeImage.createFromPath(ref.path)
  // SVG/AVIF o nativeImage não decodifica: manda o arquivo cru, o <img> do Chromium lê.
  if (img.isEmpty()) {
    const buf = readFileSync(ref.path)
    return {
      path: ref.path,
      size: ref.size,
      width: 0,
      height: 0,
      thumb: `data:${MIME[ref.ext]};base64,${buf.toString('base64')}`
    }
  }
  const { width, height } = img.getSize()
  const menor = height > altura ? img.resize({ height: altura, quality: 'good' }) : img
  return { path: ref.path, size: ref.size, width, height, thumb: menor.toDataURL() }
}

/** Imagem inteira, para o lightbox. */
export function imageFull(cru: string, cwd?: string): ImageFull | null {
  const ref = referencia(cru, cwd)
  if (!ref) return null
  const buf = readFileSync(ref.path)
  const img = nativeImage.createFromPath(ref.path)
  const { width, height } = img.isEmpty() ? { width: 0, height: 0 } : img.getSize()
  return {
    path: ref.path,
    size: ref.size,
    width,
    height,
    url: `data:${MIME[ref.ext]};base64,${buf.toString('base64')}`
  }
}

export function revealImage(path: string): void {
  shell.showItemInFolder(path)
}

export function openImage(path: string): Promise<string> {
  return shell.openPath(path)
}
