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