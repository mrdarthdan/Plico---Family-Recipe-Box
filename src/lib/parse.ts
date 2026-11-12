// Converts between the plain-text editor boxes and the stored recipe format.

import { frac } from './format'
import type { Group, Step } from './types'

const UNITS: Record<string, string> = {
  cup: 'cup', cups: 'cups', c: 'cup',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g', kg: 'kg',
  ml: 'ml', l: 'l', liter: 'l', liters: 'l',
  pinch: 'pinch', qt: 'qt', quart: 'qt', quarts: 'qt',
  pt: 'pt', pint: 'pt', pints: 'pt', 'fl oz': 'fl oz',
}
const FRAC: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}

/** "1 1/2" | "3/4" | "1½" | "½" | "2.5" -> number, else null */
export function parseAmount(tok: string): number | null {
  tok = tok.trim()
  let m: RegExpMatchArray | null
  if ((m = tok.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + +m[2] / +m[3]
  if ((m = tok.match(/^(\d+)\/(\d+)$/))) return +m[1] / +m[2]
  if ((m = tok.match(/^(\d+(?:\.\d+)?)\s*([½⅓⅔¼¾⅛⅜⅝⅞])$/))) return +m[1] + FRAC[m[2]]
  if (FRAC[tok] != null) return FRAC[tok]
  if (/^\d+(?:\.\d+)?$/.test(tok)) return +tok
  return null
}

const AMOUNT_RE =
  /^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+(?:\.\d+)?\s*[½⅓⅔¼¾⅛⅜⅝⅞]?)|[½⅓⅔¼¾⅛⅜⅝⅞])\s*(.*)$/

/** One ingredient per line, amount first. A line ending in ":" starts a group. */
export function parseIngredients(text: string): Group[] {
  const groups: Group[] = []
  let cur: Group = { name: '', items: [] }
  for (let line of text.split('\n')) {
    line = line.replace(/^\s*[-•*]\s*/, '').trim()
    if (!line) continue
    if (/:$/.test(line) && !/^\d/.test(line)) {
      if (cur.items.length || cur.name) groups.push(cur)
      cur = { name: line.slice(0, -1).trim(), items: [] }
      continue
    }
    const m = line.match(AMOUNT_RE)
    if (m) {
      const amt = parseAmount(m[1])
      let rest = m[2]
      let unit = ''
      const um = rest.match(/^(fl oz|[a-zA-Z]+)\.?\s+(.+)$/)
      if (um && UNITS[um[1].toLowerCase()]) {
        unit = UNITS[um[1].toLowerCase()]
        rest = um[2]
      }
      if (amt != null && rest) {
        cur.items.push({ qty: Math.round(amt * 1000) / 1000, unit, item: rest })
        continue
      }
    }
    cur.items.push({ qty: null, unit: '', item: line })
  }
  if (cur.items.length) groups.push(cur)
  return groups
}

const STEP_TIME_RE =
  /\s*[([]\s*(\d+(?:\.\d+)?)\s*(sec|secs|seconds|min|mins|minutes|hr|hrs|hour|hours)\s*[)\]]\s*$/i

/** One step per line. Optional "Name: " prefix, optional "(15 min)" timer suffix. */
export function parseSteps(text: string): Step[] {
  const out: Step[] = []
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim())
    .filter(Boolean)
  lines.forEach((line, i) => {
    let seconds = 0
    const tm = line.match(STEP_TIME_RE)
    if (tm && tm.index != null) {
      const n = +tm[1]
      const u = tm[2].toLowerCase()
      seconds = Math.round(u.startsWith('h') ? n * 3600 : u.startsWith('s') ? n : n * 60)
      line = line.slice(0, tm.index).trim()
    }
    let title = ''
    let body = line
    const c = line.indexOf(':')
    if (c > 0 && c <= 40) {
      title = line.slice(0, c).trim()
      body = line.slice(c + 1).trim()
    }
    if (!title) title = 'Step ' + (i + 1)
    out.push({ title, text: body || title, seconds })
  })
  return out
}

export function ingredientsToText(groups: Group[]): string {
  return groups
    .map(
      (g) =>
        (g.name ? g.name + ':\n' : '') +
        g.items
          .map((it) => (it.qty != null ? frac(it.qty) + (it.unit ? ' ' + it.unit : '') + ' ' : '') + it.item)
          .join('\n'),
    )
    .join('\n\n')
}

export function stepsToText(steps: Step[]): string {
  return steps
    .map((s) => {
      const secs = s.seconds || 0
      const t = !secs
        ? ''
        : ' (' +
          (secs >= 3600 && secs % 1800 === 0
            ? secs / 3600 + ' hr'
            : secs >= 60
              ? Math.round(secs / 60) + ' min'
              : secs + ' sec') +
          ')'
      return (/^Step \d+$/.test(s.title) ? '' : s.title + ': ') + s.text + t
    })
    .join('\n')
}

/** Page names the router uses; a recipe may not take one of these as its id. */
export const RESERVED_SLUGS = ['account', 'new', 'admin', 'profile']

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '') || 'recipe'
  )
}

/** A slug for `title` that is not reserved and not already in `taken`. */
export function uniqueSlug(title: string, taken: string[]): string {
  const base = slugify(title)
  const used = new Set([...taken, ...RESERVED_SLUGS])
  let id = base
  let n = 2
  while (used.has(id) || id.startsWith('edit-')) id = base + '-' + n++
  return id
}

export function today(): string {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
