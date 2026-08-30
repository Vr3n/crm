import { z } from 'zod'

/**
 * Shared contracts for the customers IPC surface (Module 02).
 * Output types match the renderer's expected shapes exactly.
 */

/* -------------------------------------------------------------------------- */
/* Output types (read models)                                                   */
/* -------------------------------------------------------------------------- */

export const personRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().optional(),
  email: z.string().optional()
})
export type PersonRef = z.infer<typeof personRefSchema>

export const membershipFreezeSchema = z.object({
  id: z.string(),
  membershipId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string(),
  fee: z.number(),
  billingBehavior: z.enum(['SUSPEND_BILLING', 'CONTINUE_BILLING']),
  accessBehavior: z.enum(['NO_ACCESS', 'ACCESS']),
  extensionDays: z.number(),
  createdAt: z.string(),
  createdBy: z.string().optional()
})
export type MembershipFreezeOutput = z.infer<typeof membershipFreezeSchema>

export const membershipOutputSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  plan: z.string(),
  planId: z.string().optional(),
  price: z.number(),
  discount: z.number(),
  billingFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL']),
  registrationFee: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['PENDING', 'ACTIVE', 'FROZEN', 'EXPIRED', 'CANCELLED', 'TERMINATED']),
  freezes: z.array(membershipFreezeSchema),
  createdAt: z.string(),
  createdBy: z.string().optional()
})
export type MembershipOutput = z.infer<typeof membershipOutputSchema>

export const customerInvoiceSchema = z.object({
  id: z.string(),
  invoiceNo: z.string(),
  status: z.enum(['DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID', 'UNCOLLECTIBLE']),
  issuedAt: z.string(),
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
  paidAmount: z.number(),
  outstanding: z.number()
})
export type CustomerInvoiceOutput = z.infer<typeof customerInvoiceSchema>

export const customerOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().optional(),
  email: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  address: z.string().optional(),
  emergencyContact: z.string().optional(),
  notes: z.string().optional(),
  leadId: z.string().optional(),
  source: z.string().optional(),
  ownerId: z.string().optional(),
  ownerName: z.string().optional(),
  joinedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  memberships: z.array(membershipOutputSchema),
  invoices: z.array(customerInvoiceSchema).optional()
})
export type CustomerOutput = z.infer<typeof customerOutputSchema>

export const customerRowOutputSchema = z.object({
  customer: customerOutputSchema,
  status: z.enum(['ACTIVE', 'FROZEN', 'PENDING', 'EXPIRED', 'NONE']),
  currentMembership: membershipOutputSchema.optional(),
  membershipCount: z.number(),
  nextExpiry: z.string().optional()
})
export type CustomerRowOutput = z.infer<typeof customerRowOutputSchema>

/* -------------------------------------------------------------------------- */
/* Input types (commands)                                                       */
/* -------------------------------------------------------------------------- */

export const customerIdRequestSchema = z.object({
  customerId: z.string()
})
export type CustomerIdRequest = z.infer<typeof customerIdRequestSchema>
