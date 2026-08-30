import { z } from 'zod'

/**
 * Money crosses process boundaries as integer minor units plus a currency code —
 * never a formatted string and never a float (guidelines §10). Amounts are
 * stored as integer paise in the database; formatting happens only in the
 * renderer.
 */
export interface Money {
  amount_minor: number
  currency: string
}

export const moneySchema = z.object({
  amount_minor: z.number().int().nonnegative(),
  currency: z.string().min(3).max(8)
})

export type MoneyInput = z.infer<typeof moneySchema>

/** Converts integer paise (minor units) to whole rupees (major units). */
export const toRupees = (minor: number): number => Math.round(minor / 100)

/** Converts whole rupees (major units) to integer paise (minor units). */
export const fromRupees = (rupees: number): number => Math.round(rupees * 100)