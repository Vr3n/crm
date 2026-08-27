import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { membershipSaleApi } from './api'
import type { SellMembershipInput } from '../../../../../shared/contracts/membership-sale'

export function useSellMembership() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SellMembershipInput) => membershipSaleApi.sell(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['memberships'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
      toast.success(`Membership sold — ${data.invoiceNumber}`, {
        description: `Customer #${data.customerId} · Invoice ${data.invoiceNumber}`
      })
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Could not sell membership'
      toast.error(msg)
    }
  })
}
