import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from './api'
import type {
  CreateStaffInput,
  UpdateOrganizationInput,
  UpdateRoleInput,
  UpdateStaffInput
} from './store'
import type { OrganizationProfile, Role, StaffMember } from './types'

const identityKeys = {
  all: ['identity-settings'] as const,
  organization: () => [...identityKeys.all, 'organization'] as const,
  staff: () => [...identityKeys.all, 'staff'] as const,
  roles: () => [...identityKeys.all, 'roles'] as const
}

export function useOrganization(): UseQueryResult<OrganizationProfile, Error> {
  return useQuery({
    queryKey: identityKeys.organization(),
    queryFn: () => api.organization()
  })
}

export function useStaff(): UseQueryResult<StaffMember[], Error> {
  return useQuery({ queryKey: identityKeys.staff(), queryFn: () => api.staff() })
}

export function useRoles(): UseQueryResult<Role[], Error> {
  return useQuery({ queryKey: identityKeys.roles(), queryFn: () => api.roles() })
}

/**
 * Generic identity mutation: invalidate every identity-settings query on success
 * so the admin read models (metrics, tables, drawers) re-derive from the store.
 */
function useIdentityMutation<TInput, TResult>(
  mutator: (input: TInput) => Promise<TResult>,
  successMessage: string
): UseMutationResult<TResult, Error, TInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mutator,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: identityKeys.all })
      toast.success(successMessage)
      void result
    },
    onError: (e) => toast.error('Something went wrong', { description: e.message })
  })
}

export function useCreateStaff(): UseMutationResult<StaffMember, Error, CreateStaffInput> {
  return useIdentityMutation((input) => api.createStaff(input), 'Staff member added')
}

export function useUpdateStaff(): UseMutationResult<StaffMember, Error, UpdateStaffInput> {
  return useIdentityMutation((input) => api.updateStaff(input), 'Staff member updated')
}

export function useUpdateRole(): UseMutationResult<Role, Error, UpdateRoleInput> {
  return useIdentityMutation((input) => api.updateRole(input), 'Role updated')
}

export function useUpdateOrganization(): UseMutationResult<
  OrganizationProfile,
  Error,
  UpdateOrganizationInput
> {
  return useIdentityMutation((input) => api.updateOrganization(input), 'Organization updated')
}
