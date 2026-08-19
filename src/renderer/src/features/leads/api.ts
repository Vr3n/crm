import type {
  CompleteFollowUpInput,
  CreateLeadInput,
  CreateLeadSourceInput,
  CreatedLead,
  LeadListRequest,
  LeadListResponse,
  LeadSourceRow,
  LeadTextOptionRow,
  MarkLeadLostInput,
  MoveLeadStageInput,
  RecordLeadActivityInput,
  RecordedActivity,
  ReferenceData,
  ScheduleFollowUpInput
} from '../../../../shared/contracts/sales'

/**
 * Thin IPC facade for the leads surface. Every method delegates to the preload
 * bridge (`window.api.leads.*`), which unwraps the `{ ok, data | error }`
 * envelope and re-throws `ApiError` carrying a stable machine-readable code —
 * so renderers branch on `error.code`, never on messages.
 */
export const api = {
  list: (input: LeadListRequest): Promise<LeadListResponse> => window.api.leads.list(input),
  create: (input: CreateLeadInput): Promise<CreatedLead> => window.api.leads.create(input),
  moveStage: (input: MoveLeadStageInput): Promise<void> => window.api.leads.moveStage(input),
  logActivity: (input: RecordLeadActivityInput): Promise<RecordedActivity> =>
    window.api.leads.recordActivity(input),
  markLost: (input: MarkLeadLostInput): Promise<void> => window.api.leads.markLost(input),
  scheduleFollowUp: (input: ScheduleFollowUpInput): Promise<{ followupId: number }> =>
    window.api.leads.scheduleFollowup(input),
  completeFollowUp: (input: CompleteFollowUpInput): Promise<void> =>
    window.api.leads.completeFollowup(input),
  referenceData: (): Promise<ReferenceData> => window.api.leads.getReferenceData(),
  searchSources: (query: string): Promise<LeadSourceRow[]> => window.api.leads.searchSources(query),
  createSource: (input: CreateLeadSourceInput): Promise<LeadSourceRow> =>
    window.api.leads.createSource(input),
  searchPlanInterests: (query: string): Promise<LeadTextOptionRow[]> =>
    window.api.leads.searchPlanInterests(query),
  searchGoals: (query: string): Promise<LeadTextOptionRow[]> => window.api.leads.searchGoals(query)
}

/**
 * Mock actor name still consumed by the finance feature's transient store; the
 * leads mutations themselves get the actor from the main-process session.
 */
export const currentActor = 'Priya Verma'
