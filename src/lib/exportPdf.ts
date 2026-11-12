// The "download everything as PDFs" export. Loaded only when someone asks for
// it, so the PDF and zip libraries don't slow down normal page loads.

import JSZip from 'jszip'
import { buildBookPdf, buildRecipePdf, type PageSize } from './pdf'
import type { RecipeBoxData } from './types'

/** US Letter where it is the norm, A4 everywhere else. */
export function pageSizeForLocale(locale = navigator.language): PageSize {
  return /-(US|CA|MX|PH|CL|CO|VE|GT|PR)$/i.test(locale) ? 'letter' : 'a4'
}

/** A title made safe to use as a file or folder name. */
export function fileName(text: string): string {
  return (
    text
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.+$/, '')
      .slice(0, 100) || 'Untitled'
  )
}

/**
 * Builds a zip holding one PDF of the whole recipe box plus one PDF per
 * recipe, in a folder per section. `onProgress` is called as recipes finish.
 */
export async function buildPdfZip(
  data: RecipeBoxData,
  size: PageSize,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<Blob> {
  const zip = new JSZip()
  const site = data.settings.site_name
  const total = data.recipes.length
  onProgress(0, total)

  zip.file(`${fileName(site)} - All Recipes.pdf`, await buildBookPdf(data, size))

  const used = new Set<string>()
  let done = 0
  for (const section of data.sections) {
    for (const r of data.recipes.filter((x) => x.section_id === section.id)) {
      let path = `${fileName(section.name)}/${fileName(r.title)}.pdf`
      if (used.has(path.toLowerCase())) path = `${fileName(section.name)}/${fileName(r.title)} (${r.id}).pdf`
      used.add(path.toLowerCase())
      zip.file(path, await buildRecipePdf(r, section.name, site, size))
      onProgress(++done, total)
      // Let the page repaint so the progress count is visible.
      if (done % 5 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
