import { describe, expect, it } from 'vitest'
import { frac, fmtQty, mmss, timeLabel } from './format'
import {
  ingredientsToText, parseAmount, parseIngredients, parseSteps, slugify, stepsToText, uniqueSlug,
} from './parse'

describe('amounts', () => {
  it('parses the common ways people type amounts', () => {
    expect(parseAmount('1 1/2')).toBe(1.5)
    expect(parseAmount('3/4')).toBe(0.75)
    expect(parseAmount('1½')).toBe(1.5)
    expect(parseAmount('½')).toBe(0.5)
    expect(parseAmount('2.5')).toBe(2.5)
    expect(parseAmount('some')).toBeNull()
  })
  it('formats back to kitchen fractions', () => {
    expect(frac(1.5)).toBe('1 ½')
    expect(frac(0.333)).toBe('⅓')
    expect(frac(2)).toBe('2')
    expect(frac(0.01)).toBe('⅛')
    expect(fmtQty(1, 'cup', 2)).toBe('2 cup')
    expect(fmtQty(null, '', 2)).toBe('')
  })
})

describe('ingredients', () => {
  const text = 'Filling:\n1 1/2 lb chicken thighs, cubed\n- 2 tbsp butter\n1 onion, diced\n\nTopping:\nSalt, to taste'
  it('parses groups, units and unscaled lines', () => {
    expect(parseIngredients(text)).toEqual([
      { name: 'Filling', items: [
        { qty: 1.5, unit: 'lb', item: 'chicken thighs, cubed' },
        { qty: 2, unit: 'tbsp', item: 'butter' },
        { qty: 1, unit: '', item: 'onion, diced' },
      ] },
      { name: 'Topping', items: [{ qty: null, unit: '', item: 'Salt, to taste' }] },
    ])
  })
  it('round-trips through the editor text', () => {
    const groups = parseIngredients(text)
    expect(parseIngredients(ingredientsToText(groups))).toEqual(groups)
  })
})

describe('steps', () => {
  const text = '1. Brown the chicken: Sear until golden. (6 min)\nServe hot\nRest: Leave it alone [1.5 hours]'
  it('parses names and timers', () => {
    expect(parseSteps(text)).toEqual([
      { title: 'Brown the chicken', text: 'Sear until golden.', seconds: 360 },
      { title: 'Step 2', text: 'Serve hot', seconds: 0 },
      { title: 'Rest', text: 'Leave it alone', seconds: 5400 },
    ])
  })
  it('round-trips through the editor text', () => {
    const steps = parseSteps(text)
    expect(parseSteps(stepsToText(steps))).toEqual(steps)
  })
})

describe('slugs and times', () => {
  it('makes URL-safe ids', () => {
    expect(slugify('Crème Brûlée & Friends!')).toBe('creme-brulee-friends')
    expect(slugify('!!!')).toBe('recipe')
  })
  it('avoids taken and reserved ids', () => {
    expect(uniqueSlug('Chili', ['chili', 'chili-2'])).toBe('chili-3')
    expect(uniqueSlug('Admin', [])).toBe('admin-2')
  })
  it('formats timers', () => {
    expect(mmss(95)).toBe('1:35')
    expect(mmss(3700)).toBe('1h 01m')
    expect(timeLabel(900)).toBe('15 min')
    expect(timeLabel(5400)).toBe('1½ hr')
  })
})
