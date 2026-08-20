import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ApiError } from '../shared/contracts/errors'
import type { IpcResult } from '../shared/contracts/errors'
import type {
  AuthStatus,
  CreateStaffMemberInput,
  CreatedStaffMember,
  LoginInput,
  OrganizationExistenceInput,
  SessionContext,
  SetupOrganizationInput
} from '../shared/contracts/identity'
import type {
  CreatePlanInput,
  PlanIdRequest,
  PlanRow,
  UpdatePlanInput
} from '../shared/contracts/catalog'
import type {
  AssignLeadInput,
  BulkMoveLeadStageInput,
  BulkMoveLeadStageResult,
  BulkRecordActivityInput,
  BulkRecordActivityResult,
  BulkScheduleFollowUpInput,
  BulkScheduleFollowUpResult,
  CompleteFollowUpInput,
  CreateLeadInput,
  CreateLeadSourceInput,
  CreatedLead,
  DeleteLeadsInput,
  EditLeadInput,
  FunnelCounts,
  LeadDetails,
  LeadIdRequest,
  LeadListRequest,
  LeadListResponse,
  LeadSourceRow,
  LeadTextOptionRow,
  LeadTimelineEntry,
  MarkLeadLostInput,
  MoveLeadStageInput,
  PeopleList,
  PlanOptionRow,
  RecordLeadActivityInput,
  ReferenceData,
  ScheduleFollowUpInput
} from '../shared/contracts/sales'
import { IPC_CHANNELS } from '../shared/contracts/ipc.channels'

/**
 * Invokes an IPC channel and unwraps the `{ ok, data | error }` envelope.
 * On failure it re-throws an `ApiError` carrying the stable machine-readable
 * code from the shared catalog, so the renderer branches on `error.code`
 * (ADR-0006) instead of matching on messages or Electron's serialization.
 */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (res && typeof res === 'object' && 'ok' in res) {
    if (res.ok) return res.data
    const { code, message, details } = res.error
    throw new ApiError(code, message, details)
  }
  return res
}

// Custom APIs for renderer
const api = {
  identity: {
    setup: (input: SetupOrganizationInput): Promise<SessionContext> =>
      call(IPC_CHANNELS.IDENTITY_SETUP, input),
    login: (input: LoginInput): Promise<SessionContext> => call(IPC_CHANNELS.IDENTITY_LOGIN, input),
    session: (): Promise<SessionContext | null> => call(IPC_CHANNELS.IDENTITY_SESSION),
    status: (): Promise<AuthStatus> => call(IPC_CHANNELS.IDENTITY_STATUS),
    createStaff: (input: CreateStaffMemberInput): Promise<CreatedStaffMember> =>
      call(IPC_CHANNELS.IDENTITY_CREATE_STAFF, input),
    checkOrganizationExists: (input: OrganizationExistenceInput): Promise<boolean> =>
      call(IPC_CHANNELS.IDENTITY_CHECK_ORGANIZATION_EXISTS, input),
    logout: (): Promise<boolean> => call(IPC_CHANNELS.IDENTITY_LOGOUT)
  },
  leads: {
    create: (input: CreateLeadInput): Promise<CreatedLead> =>
      call(IPC_CHANNELS.LEADS_CREATE, input),
    editLead: (input: EditLeadInput): Promise<void> => call(IPC_CHANNELS.LEADS_EDIT, input),
    moveStage: (input: MoveLeadStageInput): Promise<void> =>
      call(IPC_CHANNELS.LEADS_MOVE_STAGE, input),
    deleteLeads: (input: DeleteLeadsInput): Promise<void> => call(IPC_CHANNELS.LEADS_DELETE, input),
    bulkMoveStage: (input: BulkMoveLeadStageInput): Promise<BulkMoveLeadStageResult> =>
      call(IPC_CHANNELS.LEADS_BULK_MOVE_STAGE, input),
    bulkScheduleFollowup: (input: BulkScheduleFollowUpInput): Promise<BulkScheduleFollowUpResult> =>
      call(IPC_CHANNELS.LEADS_BULK_SCHEDULE_FOLLOWUP, input),
    bulkRecordActivity: (input: BulkRecordActivityInput): Promise<BulkRecordActivityResult> =>
      call(IPC_CHANNELS.LEADS_BULK_RECORD_ACTIVITY, input),
    recordActivity: (input: RecordLeadActivityInput): Promise<{ activityId: number }> =>
      call(IPC_CHANNELS.LEADS_RECORD_ACTIVITY, input),
    assign: (input: AssignLeadInput): Promise<void> => call(IPC_CHANNELS.LEADS_ASSIGN, input),
    markLost: (input: MarkLeadLostInput): Promise<void> =>
      call(IPC_CHANNELS.LEADS_MARK_LOST, input),
    scheduleFollowup: (input: ScheduleFollowUpInput): Promise<{ followupId: number }> =>
      call(IPC_CHANNELS.LEADS_SCHEDULE_FOLLOWUP, input),
    completeFollowup: (input: CompleteFollowUpInput): Promise<void> =>
      call(IPC_CHANNELS.LEADS_COMPLETE_FOLLOWUP, input),
    getDetails: (input: LeadIdRequest): Promise<LeadDetails | null> =>
      call(IPC_CHANNELS.LEADS_GET_DETAILS, input),
    list: (input: LeadListRequest): Promise<LeadListResponse> =>
      call(IPC_CHANNELS.LEADS_LIST, input),
    getTimeline: (input: LeadIdRequest): Promise<LeadTimelineEntry[]> =>
      call(IPC_CHANNELS.LEADS_GET_TIMELINE, input),
    getNew: (): Promise<{ id: number; personName: string; phone: string }[]> =>
      call(IPC_CHANNELS.LEADS_GET_NEW),
    getUncontacted: (): Promise<{ id: number; personName: string; phone: string }[]> =>
      call(IPC_CHANNELS.LEADS_GET_UNCONTACTED),
    getTodaysFollowups: (): Promise<
      { followupId: number; leadId: number; title: string; dueAt: string }[]
    > => call(IPC_CHANNELS.LEADS_GET_TODAYS_FOLLOWUPS),
    getOverdueFollowups: (): Promise<
      { followupId: number; leadId: number; title: string; dueAt: string }[]
    > => call(IPC_CHANNELS.LEADS_GET_OVERDUE_FOLLOWUPS),
    getTrialsEnding: (): Promise<{ id: number; personName: string; dueAt: string }[]> =>
      call(IPC_CHANNELS.LEADS_GET_TRIALS_ENDING),
    getRecentlyWon: (): Promise<{ id: number; personName: string }[]> =>
      call(IPC_CHANNELS.LEADS_GET_RECENT_WON),
    getRecentlyLost: (): Promise<{ id: number; personName: string }[]> =>
      call(IPC_CHANNELS.LEADS_GET_RECENT_LOST),
    getFunnelCounts: (): Promise<FunnelCounts> => call(IPC_CHANNELS.LEADS_GET_FUNNEL_COUNTS),
    searchPeople: (query: string): Promise<PeopleList> =>
      call(IPC_CHANNELS.LEADS_SEARCH_PEOPLE, query),
    getReferenceData: (): Promise<ReferenceData> => call(IPC_CHANNELS.LEADS_GET_REFERENCE),
    searchSources: (query: string): Promise<LeadSourceRow[]> =>
      call(IPC_CHANNELS.LEADS_SEARCH_SOURCES, { query }),
    createSource: (input: CreateLeadSourceInput): Promise<LeadSourceRow> =>
      call(IPC_CHANNELS.LEADS_CREATE_SOURCE, input),
    searchPlanInterests: (query: string): Promise<PlanOptionRow[]> =>
      call(IPC_CHANNELS.LEADS_SEARCH_PLAN_INTERESTS, { query }),
    searchGoals: (query: string): Promise<LeadTextOptionRow[]> =>
      call(IPC_CHANNELS.LEADS_SEARCH_GOALS, { query })
  },
  catalog: {
    listPlans: (): Promise<PlanRow[]> => call(IPC_CHANNELS.CATALOG_LIST_PLANS),
    createPlan: (input: CreatePlanInput): Promise<PlanRow> =>
      call(IPC_CHANNELS.CATALOG_CREATE_PLAN, input),
    updatePlan: (input: UpdatePlanInput): Promise<PlanRow> =>
      call(IPC_CHANNELS.CATALOG_UPDATE_PLAN, input),
    deletePlan: (input: PlanIdRequest): Promise<void> =>
      call(IPC_CHANNELS.CATALOG_DELETE_PLAN, input)
  }
}

export type RendererApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
