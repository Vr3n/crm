import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { catalogApi } from './api'
import type { Offer, OfferInput, Plan, PlanInput } from './types'

export const catalogKeys = {
  all: ['catalog'] as const,
  plans: ['catalog', 'plans'] as const,
  offers: ['catalog', 'offers'] as const
}

export function usePlans(): UseQueryResult<Plan[], Error> {
  return useQuery({
    queryKey: catalogKeys.plans,
    queryFn: catalogApi.listPlans
  })
}

export function useOffers(): UseQueryResult<Offer[], Error> {
  return useQuery({
    queryKey: catalogKeys.offers,
    queryFn: catalogApi.listOffers
  })
}

export function useCreatePlan(): UseMutationResult<Plan, Error, PlanInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PlanInput) => catalogApi.createPlan(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.plans })
      toast.success('Plan created', { description: 'The plan is now available at sale time.' })
    },
    onError: () => {
      toast.error('Could not create plan')
    }
  })
}

export function useUpdatePlan(): UseMutationResult<Plan, Error, { id: number; input: PlanInput }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: PlanInput }) => catalogApi.updatePlan(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.plans })
      toast.success('Plan updated', { description: 'Existing memberships keep their snapshot price.' })
    },
    onError: () => {
      toast.error('Could not update plan')
    }
  })
}

export function useDeletePlan(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => catalogApi.deletePlan(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.plans })
      void qc.invalidateQueries({ queryKey: catalogKeys.offers })
      toast.success('Plan deleted')
    },
    onError: () => {
      toast.error('Could not delete plan')
    }
  })
}

export function useCreateOffer(): UseMutationResult<Offer, Error, OfferInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: OfferInput) => catalogApi.createOffer(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.offers })
      toast.success('Offer created', { description: 'The offer is ready to be applied at sale time.' })
    },
    onError: () => {
      toast.error('Could not create offer')
    }
  })
}

export function useUpdateOffer(): UseMutationResult<Offer, Error, { id: number; input: OfferInput }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: OfferInput }) =>
      catalogApi.updateOffer(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.offers })
      toast.success('Offer updated')
    },
    onError: () => {
      toast.error('Could not update offer')
    }
  })
}

export function useDeleteOffer(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => catalogApi.deleteOffer(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.offers })
      toast.success('Offer deleted')
    },
    onError: () => {
      toast.error('Could not delete offer')
    }
  })
}