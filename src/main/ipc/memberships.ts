import { sellMembership } from '../application/memberships'
import { sellMembershipInputSchema } from '../../shared/contracts/membership-sale'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerMembershipsIpc(): void {
  handle(IPC_CHANNELS.MEMBERSHIPS_SELL, sellMembershipInputSchema, (input) => sellMembership(input))
}
