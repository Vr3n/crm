import { defineRelations } from 'drizzle-orm'
import {
  appMeta,
  organizationStaff,
  organizations,
  permissions,
  rolePermissions,
  roles,
  users
} from './identity'
import {
  leadActivities,
  leadActivityTypes,
  leadFollowups,
  leadLostReasons,
  leadSources,
  leadStageHistory,
  leadStages,
  leads,
  people
} from './sales'

export * from './identity'
export * from './sales'

/**
 * The combined schema object passed to `drizzle()`. Future modules add their
 * tables here (catalog, membership, billing, finance, ops).
 */
export const schema = {
  appMeta,
  leadActivities,
  leadActivityTypes,
  leadFollowups,
  leadLostReasons,
  leadSources,
  leadStageHistory,
  leadStages,
  leads,
  organizationStaff,
  organizations,
  people,
  permissions,
  rolePermissions,
  roles,
  users
}

/**
 * Relational config for the identity tables. Declared for schema completeness
 * and future relational queries; repositories query with explicit joins via the
 * Drizzle select builder (never `db.query.*`), per the ORM conventions.
 */
export const relations = defineRelations(schema, (helpers) => ({
  organizations: {
    roles: helpers.many.roles({
      from: helpers.organizations.id,
      to: helpers.roles.organization_id
    }),
    staff: helpers.many.organizationStaff({
      from: helpers.organizations.id,
      to: helpers.organizationStaff.organization_id
    })
  },
  users: {
    staff: helpers.many.organizationStaff({
      from: helpers.users.id,
      to: helpers.organizationStaff.user_id
    })
  },
  roles: {
    organization: helpers.one.organizations({
      from: helpers.roles.organization_id,
      to: helpers.organizations.id
    }),
    staff: helpers.many.organizationStaff({
      from: helpers.roles.id,
      to: helpers.organizationStaff.role_id
    }),
    permissions: helpers.many.rolePermissions({
      from: helpers.roles.id,
      to: helpers.rolePermissions.role_id
    })
  },
  permissions: {
    roles: helpers.many.rolePermissions({
      from: helpers.permissions.id,
      to: helpers.rolePermissions.permission_id
    })
  },
  rolePermissions: {
    role: helpers.one.roles({
      from: helpers.rolePermissions.role_id,
      to: helpers.roles.id
    }),
    permission: helpers.one.permissions({
      from: helpers.rolePermissions.permission_id,
      to: helpers.permissions.id
    })
  },
  organizationStaff: {
    organization: helpers.one.organizations({
      from: helpers.organizationStaff.organization_id,
      to: helpers.organizations.id
    }),
    user: helpers.one.users({
      from: helpers.organizationStaff.user_id,
      to: helpers.users.id
    }),
    role: helpers.one.roles({
      from: helpers.organizationStaff.role_id,
      to: helpers.roles.id
    })
  },
  people: {
    organization: helpers.one.organizations({
      from: helpers.people.organization_id,
      to: helpers.organizations.id
    }),
    leads: helpers.many.leads({
      from: helpers.people.id,
      to: helpers.leads.person_id
    })
  },
  leads: {
    organization: helpers.one.organizations({
      from: helpers.leads.organization_id,
      to: helpers.organizations.id
    }),
    person: helpers.one.people({
      from: helpers.leads.person_id,
      to: helpers.people.id
    }),
    source: helpers.one.leadSources({
      from: helpers.leads.source_id,
      to: helpers.leadSources.id
    }),
    currentStage: helpers.one.leadStages({
      from: helpers.leads.current_stage_id,
      to: helpers.leadStages.id
    }),
    owner: helpers.one.users({
      from: helpers.leads.owner_user_id,
      to: helpers.users.id
    }),
    activities: helpers.many.leadActivities({
      from: helpers.leads.id,
      to: helpers.leadActivities.lead_id
    }),
    followups: helpers.many.leadFollowups({
      from: helpers.leads.id,
      to: helpers.leadFollowups.lead_id
    }),
    stageHistory: helpers.many.leadStageHistory({
      from: helpers.leads.id,
      to: helpers.leadStageHistory.lead_id
    })
  },
  leadStages: {
    organization: helpers.one.organizations({
      from: helpers.leadStages.organization_id,
      to: helpers.organizations.id
    })
  },
  leadSources: {
    organization: helpers.one.organizations({
      from: helpers.leadSources.organization_id,
      to: helpers.organizations.id
    })
  },
  leadLostReasons: {
    organization: helpers.one.organizations({
      from: helpers.leadLostReasons.organization_id,
      to: helpers.organizations.id
    })
  },
  leadActivityTypes: {
    organization: helpers.one.organizations({
      from: helpers.leadActivityTypes.organization_id,
      to: helpers.organizations.id
    })
  },
  leadActivities: {
    lead: helpers.one.leads({
      from: helpers.leadActivities.lead_id,
      to: helpers.leads.id
    }),
    type: helpers.one.leadActivityTypes({
      from: helpers.leadActivities.type_id,
      to: helpers.leadActivityTypes.id
    }),
    createdBy: helpers.one.users({
      from: helpers.leadActivities.created_by,
      to: helpers.users.id
    })
  },
  leadFollowups: {
    lead: helpers.one.leads({
      from: helpers.leadFollowups.lead_id,
      to: helpers.leads.id
    }),
    createdBy: helpers.one.users({
      from: helpers.leadFollowups.created_by,
      to: helpers.users.id
    })
  },
  leadStageHistory: {
    lead: helpers.one.leads({
      from: helpers.leadStageHistory.lead_id,
      to: helpers.leads.id
    }),
    fromStage: helpers.one.leadStages({
      from: helpers.leadStageHistory.from_stage_id,
      to: helpers.leadStages.id
    }),
    toStage: helpers.one.leadStages({
      from: helpers.leadStageHistory.to_stage_id,
      to: helpers.leadStages.id
    }),
    activity: helpers.one.leadActivities({
      from: helpers.leadStageHistory.activity_id,
      to: helpers.leadActivities.id
    }),
    changedBy: helpers.one.users({
      from: helpers.leadStageHistory.changed_by,
      to: helpers.users.id
    })
  }
}))