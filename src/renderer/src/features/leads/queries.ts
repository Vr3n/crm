import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, currentActor } from './api'
import type {
  ActivityTypeKey,
  Lead,
  LostReasonKey,
  NewLeadInput,
  StageKey
} from './types'

const leadKeys = {
  all: ['leads'] as const,
  list: () => [...leadKeys.all, 'list'] as const,
  detail: (id: string) => [...leadKeys.all, 'detail', id] as const
}

export function useLeads(): UseQueryResult<Lead[], Error> {
  return useQuery({ queryKey: leadKeys.list(), queryFn: () => api.list() })
}

export function useLead(id: string | undefined): UseQueryResult<Lead | undefined, Error> {
  return useQuery({
    queryKey: leadKeys.detail(id ?? ''),
    queryFn: () => api.get(id!),
    enabled: !!id
  })
}

/** Generic hook to run a lead mutation and invalidate the cache on success. */
function useLeadMutation<TInput>(
  mutator: (input: TInput) => Promise<Lead>,
  successMessage: string
): UseMutationResult<Lead, Error, TInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mutator,
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: leadKeys.all })
      toast.success(successMessage)
      void lead
    },
    onError: (e) => toast.error('Something went wrong', { description: e.message })
  })
}

export function useCreateLead(): UseMutationResult<Lead, Error, NewLeadInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) => api.create(input, currentActor),
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: leadKeys.all })
      toast.success('Lead created')
      void lead
    },
    onError: (e) => toast.error('Could not create lead', { description: e.message })
  })
}

export function useMoveStage(): UseMutationResult<
  Lead,
  Error,
  { id: string; to: StageKey; note: string }
> {
  return useLeadMutation(
    ({ id, to, note }) => api.moveStage(id, to, note, currentActor),
    'Stage updated'
  )
}

export function useLogActivity(): UseMutationResult<
  Lead,
  Error,
  { id: string; type: ActivityTypeKey; note: string }
> {
  return useLeadMutation(
    ({ id, type, note }) => api.logActivity(id, type, note, currentActor),
    'Activity logged'
  )
}

export function useAddFollowUp(): UseMutationResult<
  Lead,
  Error,
  { id: string; title: string; dueAt: string; note?: string }
> {
  return useLeadMutation(
    ({ id, title, dueAt, note }) => api.addFollowUp(id, title, dueAt, note, currentActor),
    'Follow-up scheduled'
  )
}

export function useCompleteFollowUp(): UseMutationResult<Lead, Error, string> {
  return useLeadMutation((followUpId) => api.completeFollowUp(followUpId, currentActor), 'Follow-up done')
}

export function useMarkLost(): UseMutationResult<
  Lead,
  Error,
  { id: string; reason: LostReasonKey; note: string }
> {
  return useLeadMutation(
    ({ id, reason, note }) => api.markLost(id, reason, note, currentActor),
    'Lead marked lost'
  )
}

export function useConvert(): UseMutationResult<Lead, Error, string> {
  return useLeadMutation((id) => api.convert(id, currentActor), 'Lead converted')
}