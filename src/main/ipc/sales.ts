import {
  assignLead,
  completeFollowUp,
  createLead,
  createLeadSource,
  getFunnelCounts,
  getLeadDetails,
  getLeadTimeline,
  getNewLeads,
  getOverdueFollowups,
  getRecentlyLost,
  getRecentlyWon,
  getReferenceData,
  getTodaysFollowups,
  getTrialsEnding,
  getUncontactedLeads,
  listLeads,
  markLeadLost,
  moveLeadStage,
  recordLeadActivity,
  scheduleFollowUp,
  searchLeadGoals,
  searchLeadPlanInterests,
  searchLeadSources,
  searchPeople
} from '../application/leads'
import {
  assignLeadInputSchema,
  completeFollowUpInputSchema,
  createLeadInputSchema,
  createLeadSourceInputSchema,
  leadIdRequestSchema,
  leadListRequestSchema,
  leadSourceSearchRequestSchema,
  leadVocabularySearchRequestSchema,
  markLeadLostInputSchema,
  moveLeadStageInputSchema,
  recordLeadActivityInputSchema,
  scheduleFollowUpInputSchema
} from '../../shared/contracts/sales'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerSalesIpc(): void {
  handle(IPC_CHANNELS.LEADS_CREATE, createLeadInputSchema, (input) => createLead(input))
  handle(IPC_CHANNELS.LEADS_MOVE_STAGE, moveLeadStageInputSchema, (input) => moveLeadStage(input))
  handle(IPC_CHANNELS.LEADS_RECORD_ACTIVITY, recordLeadActivityInputSchema, (input) =>
    recordLeadActivity(input)
  )
  handle(IPC_CHANNELS.LEADS_ASSIGN, assignLeadInputSchema, (input) => assignLead(input))
  handle(IPC_CHANNELS.LEADS_MARK_LOST, markLeadLostInputSchema, (input) => markLeadLost(input))
  handle(IPC_CHANNELS.LEADS_SCHEDULE_FOLLOWUP, scheduleFollowUpInputSchema, (input) =>
    scheduleFollowUp(input)
  )
  handle(IPC_CHANNELS.LEADS_COMPLETE_FOLLOWUP, completeFollowUpInputSchema, (input) =>
    completeFollowUp(input)
  )

  handle(IPC_CHANNELS.LEADS_GET_DETAILS, leadIdRequestSchema, (input) => getLeadDetails(input))
  handle(IPC_CHANNELS.LEADS_LIST, leadListRequestSchema, (input) => listLeads(input))
  handle(IPC_CHANNELS.LEADS_GET_TIMELINE, leadIdRequestSchema, (input) => getLeadTimeline(input))
  handle(IPC_CHANNELS.LEADS_GET_NEW, () => getNewLeads())
  handle(IPC_CHANNELS.LEADS_GET_UNCONTACTED, () => getUncontactedLeads())
  handle(IPC_CHANNELS.LEADS_GET_TODAYS_FOLLOWUPS, () => getTodaysFollowups())
  handle(IPC_CHANNELS.LEADS_GET_OVERDUE_FOLLOWUPS, () => getOverdueFollowups())
  handle(IPC_CHANNELS.LEADS_GET_TRIALS_ENDING, () => getTrialsEnding())
  handle(IPC_CHANNELS.LEADS_GET_RECENT_WON, () => getRecentlyWon())
  handle(IPC_CHANNELS.LEADS_GET_RECENT_LOST, () => getRecentlyLost())
  handle(IPC_CHANNELS.LEADS_GET_FUNNEL_COUNTS, () => getFunnelCounts())
  handle(IPC_CHANNELS.LEADS_SEARCH_PEOPLE, (query: string) => searchPeople(query))
  handle(IPC_CHANNELS.LEADS_GET_REFERENCE, () => getReferenceData())
  handle(IPC_CHANNELS.LEADS_SEARCH_SOURCES, leadSourceSearchRequestSchema, (input) =>
    searchLeadSources(input)
  )
  handle(IPC_CHANNELS.LEADS_CREATE_SOURCE, createLeadSourceInputSchema, (input) =>
    createLeadSource(input)
  )
  handle(IPC_CHANNELS.LEADS_SEARCH_PLAN_INTERESTS, leadVocabularySearchRequestSchema, (input) =>
    searchLeadPlanInterests(input)
  )
  handle(IPC_CHANNELS.LEADS_SEARCH_GOALS, leadVocabularySearchRequestSchema, (input) =>
    searchLeadGoals(input)
  )
}
