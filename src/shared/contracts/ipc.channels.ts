/**
 * The single source of truth for IPC channel names, imported by both the main
 * process (`src/main/ipc/*`) and the preload bridge. Never hard-code a channel
 * string in a handler or the renderer client.
 */
export const IPC_CHANNELS = {
  IDENTITY_SETUP: 'identity:setup',
  IDENTITY_LOGIN: 'identity:login',
  IDENTITY_SESSION: 'identity:session',
  IDENTITY_STATUS: 'identity:status',
  IDENTITY_CREATE_STAFF: 'identity:createStaff',
  IDENTITY_CHECK_ORGANIZATION_EXISTS: 'identity:checkOrganizationExists',
  IDENTITY_LOGOUT: 'identity:logout',

  LEADS_CREATE: 'leads:create',
  LEADS_EDIT: 'leads:edit',
  LEADS_MOVE_STAGE: 'leads:moveStage',
  LEADS_DELETE: 'leads:delete',
  LEADS_BULK_MOVE_STAGE: 'leads:bulkMoveStage',
  LEADS_BULK_SCHEDULE_FOLLOWUP: 'leads:bulkScheduleFollowup',
  LEADS_BULK_RECORD_ACTIVITY: 'leads:bulkRecordActivity',
  LEADS_RECORD_ACTIVITY: 'leads:recordActivity',
  LEADS_ASSIGN: 'leads:assign',
  LEADS_MARK_LOST: 'leads:markLost',
  LEADS_SCHEDULE_FOLLOWUP: 'leads:scheduleFollowup',
  LEADS_COMPLETE_FOLLOWUP: 'leads:completeFollowup',
  LEADS_LIST: 'leads:list',
  LEADS_GET_DETAILS: 'leads:getDetails',
  LEADS_GET_TIMELINE: 'leads:getTimeline',
  LEADS_GET_NEW: 'leads:getNew',
  LEADS_GET_UNCONTACTED: 'leads:getUncontacted',
  LEADS_GET_TODAYS_FOLLOWUPS: 'leads:getTodaysFollowups',
  LEADS_GET_OVERDUE_FOLLOWUPS: 'leads:getOverdueFollowups',
  LEADS_GET_TRIALS_ENDING: 'leads:getTrialsEnding',
  LEADS_GET_RECENT_WON: 'leads:getRecentlyWon',
  LEADS_GET_RECENT_LOST: 'leads:getRecentlyLost',
  LEADS_GET_FUNNEL_COUNTS: 'leads:getFunnelCounts',
  LEADS_SEARCH_PEOPLE: 'leads:searchPeople',
  LEADS_GET_REFERENCE: 'leads:getReferenceData',
  LEADS_SEARCH_SOURCES: 'leads:searchSources',
  LEADS_CREATE_SOURCE: 'leads:createSource',
  LEADS_SEARCH_PLAN_INTERESTS: 'leads:searchPlans',
  LEADS_SEARCH_GOALS: 'leads:searchGoals',

  CATALOG_LIST_PLANS: 'catalog:listPlans',
  CATALOG_CREATE_PLAN: 'catalog:createPlan',
  CATALOG_UPDATE_PLAN: 'catalog:updatePlan',
  CATALOG_DELETE_PLAN: 'catalog:deletePlan'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
