import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { api } from './api'
import type { MembershipExpiration, PaymentDue } from './types'

const dashboardKeys = {
  all: ['dashboard'] as const,
  expirations: () => [...dashboardKeys.all, 'expirations'] as const,
  paymentsDue: () => [...dashboardKeys.all, 'payments-due'] as const
}

/** Memberships ordered by expiration, soonest first. */
export function useUpcomingExpirations(): UseQueryResult<MembershipExpiration[], Error> {
  return useQuery({
    queryKey: dashboardKeys.expirations(),
    queryFn: () => api.upcomingExpirations()
  })
}

/** Unpaid obligations ordered by amount due, largest first. */
export function usePaymentsDue(): UseQueryResult<PaymentDue[], Error> {
  return useQuery({
    queryKey: dashboardKeys.paymentsDue(),
    queryFn: () => api.paymentsDue()
  })
}