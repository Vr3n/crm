import { describe, expect, it } from 'vitest'
import { formatMinor, formatMoneyExact, rupeesToMinor } from '../../src/renderer/src/lib/money'

/**
 * Money presentation/parse rules shared by every capture form (Module 04 §34):
 * staff type decimal rupees; the domain stores integer paise.
 */
describe('rupeesToMinor', () => {
  it('converts whole rupees to paise', () => {
    expect(rupeesToMinor('19200')).toBe(1_920_000)
  })

  it('rounds half-up at the paise boundary', () => {
    expect(rupeesToMinor('19.999')).toBeUndefined() // 3 decimals rejected, not rounded silently
    expect(rupeesToMinor('19200.5')).toBe(1_920_050)
    expect(rupeesToMinor('19200.05')).toBe(1_920_005)
  })

  it('accepts Indian-style grouping separators and currency glyphs', () => {
    expect(rupeesToMinor('₹19,200.50')).toBe(1_920_050)
    expect(rupeesToMinor(' 1200 ')).toBe(120_000)
  })

  it('rejects non-numeric and negative input', () => {
    expect(rupeesToMinor('')).toBeUndefined()
    expect(rupeesToMinor('abc')).toBeUndefined()
    expect(rupeesToMinor('-5')).toBeUndefined()
    expect(rupeesToMinor('1.2.3')).toBeUndefined()
    expect(rupeesToMinor('12,34.5.6')).toBeUndefined()
  })
})

describe('formatMinor / formatMoneyExact', () => {
  it('formats stored paise back to rupees with up to 2 decimals', () => {
    expect(formatMinor(1_920_000)).toBe(formatMoneyExact(19200))
    expect(formatMoneyExact(19200.5)).toMatch(/19,200\.5/)
    expect(formatMoneyExact(0)).toMatch(/0/)
  })
})
