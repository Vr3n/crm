/** Org branding data for PDF headers. */
export interface OrgBranding {
  name: string
  legalName?: string | null
  logo?: string | null
  address?: string | null
  gstin?: string | null
  mobileNumber: string
  invoicePrefix?: string | null
}

/** Customer/billing snapshot for PDF documents. */
export interface PdfCustomer {
  name: string
  phone?: string | null
  email?: string | null
}

/** Invoice line item for PDF rendering. */
export interface PdfInvoiceLine {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  discountAmount: number
  lineTotal: number
}

/** Payment allocation shown on invoice PDF. */
export interface PdfAllocation {
  paymentNo: string
  method: string
  amount: number
  receivedAt: string
}

/** Full print context for Invoice Document PDF. */
export interface InvoicePrintContext {
  org: OrgBranding
  invoiceNo: string
  status: string
  issuedAt: string
  dueAt?: string | null
  customer: PdfCustomer
  /** Membership duration info — shown above Payments Received. */
  membership?: {
    planName: string
    joiningDate: string
    startDate: string
    endDate: string
  } | null
  lines: PdfInvoiceLine[]
  subtotal: number
  taxTotal: number
  total: number
  allocations: PdfAllocation[]
  paidAmount: number
  outstanding: number
  generatedAt: string
}

/** Full print context for Payment Receipt PDF. */
export interface ReceiptPrintContext {
  org: OrgBranding
  paymentNo: string
  paymentDate: string
  amount: number
  method: string
  reference?: string | null
  customer: PdfCustomer
  allocations: Array<{
    invoiceNo: string
    amount: number
  }>
  receivedBy: string
  generatedAt: string
}

export type PdfDocumentType = 'invoice' | 'receipt'
