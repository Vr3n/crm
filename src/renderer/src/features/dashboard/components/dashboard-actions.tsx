import { UserPlus, BellPlus, ClipboardList, BadgeCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

function soon(title: string): void {
  toast(title, { description: 'This arrives with the upcoming module — it\u2019s not wired up yet.' })
}

/**
 * Dashboard quick actions (top row). "New Lead" opens the same add-lead dialog
 * used on the Leads page; the rest are honest placeholders that toast their
 * owning module, since Follow-ups/Activities/Memberships aren't built yet.
 *
 * Each button carries a distinct accent so the actions are easy to tell apart
 * at a glance, and the row spans the full page width (one button per column).
 */
export function DashboardActions({ onNewLead }: { onNewLead: () => void }): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Button variant="outline" className="w-full" onClick={onNewLead}>
        <UserPlus className="text-primary" />
        New Lead
      </Button>
      <Button variant="outline" className="w-full" onClick={() => soon('Schedule a follow-up')}>
        <BellPlus className="text-success" />
        Schedule Follow-Up
      </Button>
      <Button variant="outline" className="w-full" onClick={() => soon('Schedule an activity')}>
        <ClipboardList className="text-warning" />
        Schedule Activity
      </Button>
      <Button variant="outline" className="w-full" onClick={() => soon('Membership sale')}>
        <BadgeCheck className="text-secondary" />
        New Membership Sale
      </Button>
    </div>
  )
}