import { ElectronAPI } from '@electron-toolkit/preload'
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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      identity: {
        setup: (input: SetupOrganizationInput) => Promise<SessionContext>
        login: (input: LoginInput) => Promise<SessionContext>
        session: () => Promise<SessionContext | null>
        status: () => Promise<AuthStatus>
        createStaff: (input: CreateStaffMemberInput) => Promise<CreatedStaffMember>
        checkOrganizationExists: (input: OrganizationExistenceInput) => Promise<boolean>
        logout: () => Promise<boolean>
      }
      leads: {
        create: (input: CreateLeadInput) => Promise<CreatedLead>
        editLead: (input: EditLeadInput) => Promise<void>
        moveStage: (input: MoveLeadStageInput) => Promise<void>
        deleteLeads: (input: DeleteLeadsInput) => Promise<void>
        bulkMoveStage: (input: BulkMoveLeadStageInput) => Promise<BulkMoveLeadStageResult>
        bulkScheduleFollowup: (
          input: BulkScheduleFollowUpInput
        ) => Promise<BulkScheduleFollowUpResult>
        bulkRecordActivity: (input: BulkRecordActivityInput) => Promise<BulkRecordActivityResult>
        recordActivity: (input: RecordLeadActivityInput) => Promise<{ activityId: number }>
        assign: (input: AssignLeadInput) => Promise<void>
        markLost: (input: MarkLeadLostInput) => Promise<void>
        scheduleFollowup: (input: ScheduleFollowUpInput) => Promise<{ followupId: number }>
        completeFollowup: (input: CompleteFollowUpInput) => Promise<void>
        getDetails: (input: LeadIdRequest) => Promise<LeadDetails | null>
        list: (input: LeadListRequest) => Promise<LeadListResponse>
        getTimeline: (input: LeadIdRequest) => Promise<LeadTimelineEntry[]>
        getNew: () => Promise<{ id: number; personName: string; phone: string }[]>
        getUncontacted: () => Promise<{ id: number; personName: string; phone: string }[]>
        getTodaysFollowups: () => Promise<
          {
            followupId: number
            leadId: number
            title: string
            dueAt: string
          }[]
        >
        getOverdueFollowups: () => Promise<
          {
            followupId: number
            leadId: number
            title: string
            dueAt: string
          }[]
        >
        getTrialsEnding: () => Promise<{ id: number; personName: string; dueAt: string }[]>
        getRecentlyWon: () => Promise<{ id: number; personName: string }[]>
        getRecentlyLost: () => Promise<{ id: number; personName: string }[]>
        getFunnelCounts: () => Promise<FunnelCounts>
        searchPeople: (query: string) => Promise<PeopleList>
        getReferenceData: () => Promise<ReferenceData>
        searchSources: (query: string) => Promise<LeadSourceRow[]>
        createSource: (input: CreateLeadSourceInput) => Promise<LeadSourceRow>
        searchPlanInterests: (query: string) => Promise<PlanOptionRow[]>
        searchGoals: (query: string) => Promise<LeadTextOptionRow[]>
      }
      catalog: {
        listPlans: () => Promise<PlanRow[]>
        createPlan: (input: CreatePlanInput) => Promise<PlanRow>
        updatePlan: (input: UpdatePlanInput) => Promise<PlanRow>
        deletePlan: (input: PlanIdRequest) => Promise<void>
      }
    }
  }
}
