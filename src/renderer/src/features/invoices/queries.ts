import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { api } from './api'
import type { Invoice, InvoiceStatus } from './types'

const keys = {
  all: ['invoices'] as const,
  list: () => [...keys.all, 'list'] as const,
  one: (id: string) => [...keys.all, 'one', id] as const,
  byStatus: (status: InvoiceStatus | undefined) => [...keys.all, 'status', status ?? 'all'] as const
}

/** The full invoice register, newest issued first. */
export function useInvoices(): UseQueryResult<Invoice[], Error> {
  return useQuery({
    queryKey: keys.list(),
    queryFn: () => api.invoices()
  })
}

/** A single invoice record for the details drawer. */
export function useInvoice(id: string | undefined): UseQueryResult<Invoice | undefined, Error> {
  return useQuery({
    queryKey: keys.one(id ?? ''),
    queryFn: () => api.invoice(id!),
    enabled: !!id
  })
}

export function useInvoicesByStatus(
  status: InvoiceStatus | undefined
): UseQueryResult<Invoice[], Error> {
  return useQuery({
    queryKey: keys.byStatus(status),
    queryFn: () => api.invoicesByStatus(status)
  })
}
