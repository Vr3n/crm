import { createPlan, deletePlan, listPlans, updatePlan } from '../application/catalog'
import {
  createPlanInputSchema,
  planIdRequestSchema,
  updatePlanInputSchema
} from '../../shared/contracts/catalog'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerCatalogIpc(): void {
  handle(IPC_CHANNELS.CATALOG_LIST_PLANS, () => listPlans())
  handle(IPC_CHANNELS.CATALOG_CREATE_PLAN, createPlanInputSchema, (input) => createPlan(input))
  handle(IPC_CHANNELS.CATALOG_UPDATE_PLAN, updatePlanInputSchema, (input) => updatePlan(input))
  handle(IPC_CHANNELS.CATALOG_DELETE_PLAN, planIdRequestSchema, (input) => deletePlan(input))
}
