const FRACTIONS: [number, string][] = [
  [0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, ''],
]

/** 1.5 -> "1 ½". Rounds to the nearest common kitchen fraction. */
export function frac(x: number): string {
  const whole = Math.floor(x + 1e-9)
  const rem = x - whole
  let best = FRACTIONS[0]
  for (const f of FRACTIONS) if (Math.abs(f[0] - rem) < Math.abs(best[0] - rem)) best = f
  const w = whole + (best[0] === 1 ? 1 : 0)
  const f = best[0] === 1 ? '' : best[1]
  if (w === 0 && !f) return x > 0 ? '⅛' : '0'
  return (w ? String(w) : '') + (w && f ? ' ' : '') + f
}

export function fmtQty(qty: number | null, unit: string, factor: number): string {
  if (qty == null) return ''
  return frac(qty * factor) + (unit ? ' ' + unit : '')
}

/** Countdown text: 95 -> "1:35", 3700 -> "1h 01m". */
export function mmss(s: number): string {
  const m = Math.floor(s / 60)
  const r = s % 60
  return m >= 60
    ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'
    : m + ':' + String(r).padStart(2, '0')
}

/** Timer label: 900 -> "15 min". */
export function timeLabel(s: number): string {
  if (s >= 3600) return (s / 3600).toString().replace(/\.5$/, '½') + ' hr'
  if (s >= 60) return Math.round(s / 60) + ' min'
  return s + ' sec'
}
