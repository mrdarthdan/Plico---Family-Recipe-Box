// Builds formatted PDFs from recipes: one recipe per file, or the whole
// recipe box as a single book with a cover and contents page.
//
// Uses the PDF standard fonts, which only cover Western European characters.
// Anything else is replaced (see `clean`). Embedding a Unicode font would lift
// that limit at the cost of shipping the font file.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { fmtQty, timeLabel } from './format'
import type { Group, Recipe, RecipeBoxData } from './types'

export type PageSize = 'letter' | 'a4'

const SIZES: Record<PageSize, [number, number]> = { letter: [612, 792], a4: [595.28, 841.89] }
const MARGIN = 54
const FOOTER = 30

const INK = rgb(0.11, 0.15, 0.13)
const MUTED = rgb(0.36, 0.42, 0.38)
const HERB = rgb(0.18, 0.42, 0.3)
const LINE = rgb(0.85, 0.88, 0.84)

interface Fonts {
  serifBold: PDFFont
  sans: PDFFont
  sansBold: PDFFont
  sansItalic: PDFFont
}

const REPLACEMENTS: Record<string, string> = {
  '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
  '−': '-', '‑': '-', '→': '->', '≈': '~', '℉': '°F', '℃': '°C',
  ' ': ' ', ' ': ' ', ' ': ' ', '\t': ' ', '\n': ' ', '\r': ' ',
}

/** Makes text safe for a standard font: swaps what it can, "?" for the rest. */
function clean(font: PDFFont, text: string): string {
  const known = new Set(font.getCharacterSet())
  let out = ''
  for (const ch of text) {
    const sub = REPLACEMENTS[ch] ?? ch
    for (const c of sub) out += known.has(c.codePointAt(0)!) ? c : '?'
  }
  return out
}

/** Breaks text into lines no wider than `width`. */
function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (let word of clean(font, text).split(' ').filter(Boolean)) {
    // A single word wider than the column is split mid-word.
    while (font.widthOfTextAtSize(word, size) > width) {
      let cut = word.length - 1
      while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut--
      if (line) lines.push(line)
      lines.push(word.slice(0, cut))
      line = ''
      word = word.slice(cut)
    }
    const next = line ? line + ' ' + word : word
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/** A cursor that moves down the page and starts a new page when it runs out. */
class Writer {
  page!: PDFPage
  y = 0
  readonly width: number
  readonly height: number

  constructor(
    readonly doc: PDFDocument,
    readonly fonts: Fonts,
    size: PageSize,
  ) {
    ;[this.width, this.height] = SIZES[size]
  }
  get contentWidth() {
    return this.width - MARGIN * 2
  }
  get bottom() {
    return MARGIN + FOOTER
  }
  newPage() {
    this.page = this.doc.addPage([this.width, this.height])
    this.y = this.height - MARGIN
  }
  /** Starts a new page unless `height` more points fit on this one. */
  ensure(height: number) {
    if (this.y - height < this.bottom) this.newPage()
  }
  gap(points: number) {
    this.y -= points
  }
  /** Draws wrapped text at the cursor and moves the cursor below it. */
  paragraph(
    text: string,
    o: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; x?: number; width?: number; leading?: number },
  ) {
    const x = o.x ?? MARGIN
    const leading = o.leading ?? o.size * 1.38
    for (const line of wrap(o.font, text, o.size, o.width ?? this.contentWidth - (x - MARGIN))) {
      this.ensure(leading)
      this.y -= leading
      this.page.drawText(line, { x, y: this.y + leading - o.size, font: o.font, size: o.size, color: o.color ?? INK })
    }
  }
  rule() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: this.width - MARGIN, y: this.y },
      thickness: 0.75,
      color: LINE,
    })
  }
  heading(text: string) {
    this.ensure(60)
    this.gap(18)
    this.paragraph(text, { font: this.fonts.serifBold, size: 14 })
    this.gap(4)
  }
}

async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  return {
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
    sansItalic: await doc.embedFont(StandardFonts.HelveticaOblique),
  }
}

const QTY_WIDTH = 64
const ITEM_SIZE = 10
const ITEM_LEADING = 15

/** Ingredient rows for one column: [amount, wrapped item lines]. */
function itemRows(f: Fonts, group: Group, width: number): [string, string[]][] {
  return group.items.map((it) => {
    const qty = clean(f.sansBold, fmtQty(it.qty, it.unit, 1))
    const lines = wrap(f.sans, it.item, ITEM_SIZE, width - QTY_WIDTH)
    return [qty, lines.length ? lines : ['']]
  })
}
const rowsHeight = (rows: [string, string[]][]) => rows.reduce((h, r) => h + r[1].length * ITEM_LEADING, 0)

function drawRows(w: Writer, rows: [string, string[]][], x: number, top: number) {
  let y = top
  for (const [qty, lines] of rows) {
    if (qty) w.page.drawText(qty, { x, y: y - ITEM_SIZE, font: w.fonts.sansBold, size: ITEM_SIZE, color: HERB })
    for (const line of lines) {
      w.page.drawText(line, { x: x + QTY_WIDTH, y: y - ITEM_SIZE, font: w.fonts.sans, size: ITEM_SIZE, color: INK })
      y -= ITEM_LEADING
    }
  }
}

function drawIngredients(w: Writer, groups: Group[]) {
  const f = w.fonts
  const gutter = 24
  const colWidth = (w.contentWidth - gutter) / 2
  for (const g of groups) {
    if (g.name) {
      w.ensure(40)
      w.gap(8)
      w.paragraph(g.name.toUpperCase(), { font: f.sansBold, size: 8, color: MUTED })
      w.gap(2)
    }
    const rows = itemRows(f, g, colWidth)
    const split = Math.ceil(rows.length / 2)
    const left = rows.slice(0, split)
    const right = rows.slice(split)
    const height = Math.max(rowsHeight(left), rowsHeight(right))
    const pageRoom = w.height - MARGIN - w.bottom
    if (rows.length >= 6 && height <= pageRoom) {
      // Two balanced columns, kept together on one page.
      w.ensure(height)
      drawRows(w, left, MARGIN, w.y)
      drawRows(w, right, MARGIN + colWidth + gutter, w.y)
      w.gap(height)
    } else {
      // Short or very long lists: one column that can run across pages.
      for (const row of itemRows(f, g, w.contentWidth)) {
        const h = row[1].length * ITEM_LEADING
        w.ensure(h)
        drawRows(w, [row], MARGIN, w.y)
        w.gap(h)
      }
    }
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Draws one recipe starting on a fresh page. */
function drawRecipe(w: Writer, r: Recipe, sectionName: string) {
  const f = w.fonts
  w.newPage()

  if (sectionName) w.paragraph(sectionName.toUpperCase(), { font: f.sansBold, size: 8, color: MUTED })
  w.gap(2)
  w.paragraph(r.title, { font: f.serifBold, size: 24, leading: 28 })
  if (r.description) {
    w.gap(4)
    w.paragraph(r.description, { font: f.sans, size: 11, color: MUTED })
  }
  if (r.contributor) {
    w.gap(2)
    w.paragraph(r.contributor, { font: f.sansItalic, size: 9.5, color: MUTED })
  }
  const meta = [r.serves ? `Serves ${r.serves}` : '', r.time ?? ''].filter(Boolean).join('   ·   ')
  if (meta) {
    w.gap(6)
    w.paragraph(meta, { font: f.sansBold, size: 9.5, color: HERB })
  }
  w.gap(10)
  w.rule()

  if (r.ingredients.length) {
    w.heading('Ingredients')
    drawIngredients(w, r.ingredients)
  }

  if (r.steps.length) {
    w.heading('Steps')
    const indent = 24
    r.steps.forEach((s, i) => {
      w.ensure(46)
      w.gap(6)
      const top = w.y
      const timer = s.seconds > 0 ? '   ·   ' + timeLabel(s.seconds) : ''
      w.paragraph(s.title + timer, { font: f.sansBold, size: 10.5, x: MARGIN + indent })
      // The number sits beside the step's first line, on whichever page that is.
      const firstLineY = w.y > top ? w.y + 10.5 * 1.38 - 13 : top - 13
      w.page.drawText(String(i + 1), { x: MARGIN, y: firstLineY, font: f.serifBold, size: 13, color: HERB })
      if (s.text && s.text !== s.title) w.paragraph(s.text, { font: f.sans, size: 10.5, x: MARGIN + indent })
    })
  }

  if (r.notes.length) {
    w.heading('Notes')
    for (const n of r.notes) {
      w.ensure(28)
      w.gap(3)
      const top = w.y
      w.paragraph(n, { font: f.sans, size: 10, x: MARGIN + 12, color: INK })
      const bulletY = w.y > top ? w.y + 10 * 1.38 - 10 : top - 10
      w.page.drawText('•', { x: MARGIN, y: bulletY, font: f.sans, size: 10, color: HERB })
    }
  }

  const tail = [r.tags.length ? 'Tags: ' + r.tags.join(', ') : '', r.source_url ? 'Source: ' + hostOf(r.source_url) : '']
    .filter(Boolean)
    .join('   ·   ')
  if (tail) {
    w.ensure(30)
    w.gap(16)
    w.paragraph(tail, { font: f.sans, size: 8.5, color: MUTED })
  }
}

/** Footer on every page from `firstPage` on: name on the left, page number on the right. */
function drawFooters(w: Writer, label: string, firstPage: number, showNumbers: boolean) {
  const f = w.fonts.sans
  const text = clean(f, label)
  w.doc.getPages().forEach((page, i) => {
    if (i < firstPage) return
    page.drawText(text, { x: MARGIN, y: MARGIN - 6, font: f, size: 8, color: MUTED })
    if (showNumbers) {
      const n = String(i + 1)
      page.drawText(n, { x: w.width - MARGIN - f.widthOfTextAtSize(n, 8), y: MARGIN - 6, font: f, size: 8, color: MUTED })
    }
  })
}

/** One recipe as its own PDF. */
export async function buildRecipePdf(
  recipe: Recipe,
  sectionName: string,
  siteName: string,
  size: PageSize,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(recipe.title)
  doc.setAuthor(siteName)
  const w = new Writer(doc, await loadFonts(doc), size)
  drawRecipe(w, recipe, sectionName)
  drawFooters(w, siteName, 0, doc.getPageCount() > 1)
  return doc.save()
}

type TocRow = { kind: 'section'; text: string } | { kind: 'recipe'; text: string; index: number }

/** Every recipe in one PDF: cover, contents with page numbers, then recipes by section. */
export async function buildBookPdf(data: RecipeBoxData, size: PageSize, date = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const name = data.settings.site_name
  doc.setTitle(name)
  const w = new Writer(doc, await loadFonts(doc), size)
  const f = w.fonts

  // 1. Recipes first, noting the page each one starts on.
  const rows: TocRow[] = []
  const startPage: number[] = []
  for (const s of data.sections) {
    const list = data.recipes.filter((r) => r.section_id === s.id)
    if (!list.length) continue
    rows.push({ kind: 'section', text: s.name })
    for (const r of list) {
      rows.push({ kind: 'recipe', text: r.title, index: startPage.length })
      startPage.push(doc.getPageCount())
      drawRecipe(w, r, s.name)
    }
  }

  // 2. Lay the contents out into pages so we know how many there are.
  const SECTION_H = 26
  const RECIPE_H = 15
  const room = w.height - MARGIN - w.bottom
  const tocPages: TocRow[][] = [[]]
  let used = 44 // "Contents" heading on the first page
  rows.forEach((row, i) => {
    let need = row.kind === 'section' ? SECTION_H : RECIPE_H
    // Never leave a section heading alone at the foot of a page.
    if (row.kind === 'section' && rows[i + 1]) need += RECIPE_H
    if (used + need > room) {
      tocPages.push([])
      used = 0
    }
    tocPages[tocPages.length - 1].push(row)
    used += row.kind === 'section' ? SECTION_H : RECIPE_H
  })
  const front = 1 + tocPages.length // cover + contents

  // 3. Contents pages, inserted ahead of the recipes.
  tocPages.forEach((pageRows, p) => {
    const page = doc.insertPage(p, [w.width, w.height])
    let y = w.height - MARGIN
    if (p === 0) {
      page.drawText('Contents', { x: MARGIN, y: y - 22, font: f.serifBold, size: 22, color: INK })
      y -= 44
    }
    for (const row of pageRows) {
      if (row.kind === 'section') {
        y -= SECTION_H
        page.drawText(clean(f.sansBold, row.text.toUpperCase()), { x: MARGIN, y: y + 4, font: f.sansBold, size: 9, color: HERB })
        continue
      }
      y -= RECIPE_H
      const num = String(front + startPage[row.index] + 1)
      const numW = f.sans.widthOfTextAtSize(num, 10)
      const title = wrap(f.sans, row.text, 10, w.contentWidth - 60)[0] ?? ''
      const titleW = f.sans.widthOfTextAtSize(title, 10)
      page.drawText(title, { x: MARGIN + 10, y: y + 3, font: f.sans, size: 10, color: INK })
      page.drawText(num, { x: w.width - MARGIN - numW, y: y + 3, font: f.sans, size: 10, color: INK })
      page.drawLine({
        start: { x: MARGIN + 10 + titleW + 6, y: y + 5 },
        end: { x: w.width - MARGIN - numW - 6, y: y + 5 },
        thickness: 0.5,
        color: LINE,
        dashArray: [1, 3],
      })
    }
  })

  // 4. Cover.
  const cover = doc.insertPage(0, [w.width, w.height])
  const centered = (text: string, font: PDFFont, sizePt: number, y: number, color = INK) => {
    const lines = wrap(font, text, sizePt, w.contentWidth)
    lines.forEach((line, i) => {
      cover.drawText(line, {
        x: (w.width - font.widthOfTextAtSize(line, sizePt)) / 2,
        y: y - i * sizePt * 1.2,
        font,
        size: sizePt,
        color,
      })
    })
    return y - lines.length * sizePt * 1.2
  }
  let y = centered(name, f.serifBold, 40, w.height * 0.62)
  if (data.settings.tagline) y = centered(data.settings.tagline, f.sans, 13, y - 10, MUTED)
  cover.drawLine({
    start: { x: w.width / 2 - 40, y: y - 8 },
    end: { x: w.width / 2 + 40, y: y - 8 },
    thickness: 1.5,
    color: HERB,
  })
  const count = startPage.length
  centered(`${count} recipe${count === 1 ? '' : 's'}`, f.sansBold, 11, y - 40, HERB)
  centered(
    date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    f.sans,
    10,
    MARGIN + 20,
    MUTED,
  )

  drawFooters(w, name, 1, true)
  return doc.save()
}
