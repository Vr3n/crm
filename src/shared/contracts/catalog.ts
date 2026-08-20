import { z } from 'zod'

/**
 * Canonical contracts for the catalog/plans IPC surface (Module 03). Prices are
 * integer minor units (paise) across the wire — the renderer converts rupees for
 * display only (guidelines §10). Input shapes are Zod-validated at the IPC
 * boundary; domain rules (name uniqueness, ownership) live in the application layer.
 */

export const PLAN_DURATIONS = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'] as const
export type PlanDuration = (typeof PLAN_DURATIONS)[number]

export const PLAN_BILLING_FREQUENCIES = [
  'ONE_TIME',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY'
] as const
export type PlanBillingFrequency = (typeof PLAN_BILLING_FREQUENCIES)[number]

export const PLAN_ACCESS_WINDOWS = ['ALL_HOURS', 'TIMED'] as const
export type PlanAccessWindow = (typeof PLAN_ACCESS_WINDOWS)[number]

export const planRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable(),
  duration: z.enum(PLAN_DURATIONS),
  billingFrequency: z.enum(PLAN_BILLING_FREQUENCIES),
  basePriceMinor: z.number().int().nonnegative(),
  accessWindow: z.enum(PLAN_ACCESS_WINDOWS),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string()
})
export type PlanRow = z.infer<typeof planRowSchema>

export const createPlanInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  duration: z.enum(PLAN_DURATIONS),
  billingFrequency: z.enum(PLAN_BILLING_FREQUENCIES),
  basePriceMinor: z.number().int().positive(),
  accessWindow: z.enum(PLAN_ACCESS_WINDOWS),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  isActive: z.boolean()
})
export type CreatePlanInput = z.infer<typeof createPlanInputSchema>

export const updatePlanInputSchema = createPlanInputSchema.extend({
  planId: z.number().int().positive()
})
export type UpdatePlanInput = z.infer<typeof updatePlanInputSchema>

export const planIdRequestSchema = z.object({ planId: z.number().int().positive() })
export type PlanIdRequest = z.infer<typeof planIdRequestSchema>
