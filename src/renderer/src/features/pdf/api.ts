/**
 * Thin IPC facade for PDF export. Every method delegates to the preload bridge
 * (`window.api.pdf.*`).
 */
export const pdfApi = {
  /** Exports an invoice as PDF. Opens in system viewer (preview) or saves to Documents. */
  exportInvoice: (
    invoiceId: number | string,
    mode: 'save' | 'preview' = 'preview'
  ): Promise<string> => window.api.pdf.exportInvoice({ invoiceId: Number(invoiceId), mode }),

  /** Exports a payment receipt as PDF. Opens in system viewer (preview) or saves to Documents. */
  exportReceipt: (
    paymentId: number | string,
    mode: 'save' | 'preview' = 'preview'
  ): Promise<string> => window.api.pdf.exportReceipt({ paymentId: Number(paymentId), mode }),

  /** Exports a refund receipt as PDF. Opens in system viewer (preview) or saves to Documents/Refunds. */
  exportRefund: (
    refundId: number | string,
    mode: 'save' | 'preview' = 'preview'
  ): Promise<string> => window.api.pdf.exportRefund({ refundId: Number(refundId), mode })
}
