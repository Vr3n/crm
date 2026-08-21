import { z } from 'zod'

/**
 * Shared contracts for the invoices IPC surface (Module 04 read models).
 * Output types match the renderer's expected shapes exactly.
 */

export const INVOICE_STATUSES = [
  'DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID', 'UNCOLLECTIBLE'
] as const

/* -------------------------------------------------------------------------- */
/* Output types (read models)                                                   */
/* -------------------------------------------------------------------------- */

export const customerRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().optional(),
  email: z.string().optional()
})
export type CustomerRef = z.infer<typeof customerRefSchema>

export const invoiceLineOutputSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  discountAmount: z.number(),
  taxRate: z.number(),
  taxAmount: z.number(),
  lineTotal: z.number()
})
export type InvoiceLineOutput = z.infer<typeof invoiceLineOutputSchema>

export const invoiceAllocationOutputSchema = z.object({
  id: z.string(),
  amount: z.number(),
  method: z.string(),
  reference: z.string(),
  receivedAt: z.string(),
  receivedBy: z.string()
})
export type InvoiceAllocationOutput = z.infer<typeof invoiceAllocationOutputSchema>

export const invoiceOutputSchema = z.object({
  id: z.string(),
  invoiceNo: z.string(),
  customer: customerRefSchema,
  issuedAt: z.string(),
  dueAt: z.string().optional(),
  status: z.enum(['DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID', 'UNCOLLECTIBLE']),
  lines: z.array(invoiceLineOutputSchema),
  allocations: z.array(invoiceAllocationOutputSchema),
  createdBy: z.string(),
  subtotal: z.number(),
  taxTotal: z.number(),
  total: z.number(),
  paidAmount: z.number(),
  outstanding: z.number()
})
export type InvoiceOutput = z.infer<typeof invoiceOutputSchema>

/* -------------------------------------------------------------------------- */
/* Input types (queries)                                                        */
/* -------------------------------------------------------------------------- */

export const invoiceIdRequestSchema = z.object({
  invoiceId: z.string()
})
export type InvoiceIdRequest = z.infer<typeof invoiceIdRequestSchema>

export const invoicesByStatusRequestSchema = z.object({
  status: z.enum(['DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID', 'UNCOLLECTIBLE']).optional()
})
export type InvoicesByStatusRequest = z.infer<typeof invoicesByStatusRequestSchema>
