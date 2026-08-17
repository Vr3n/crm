import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useSession } from '@/context/session-context'
import { SOURCES, STAFF } from '../constants'
import { useCreateLead } from '../queries'
import type { SourceKey } from '../types'

const SOURCE_KEYS = Object.keys(SOURCES) as SourceKey[]

/**
 * Fast "New lead" capture (staff aren't tech-savvy): a single modal with only
 * the fields a front-desk person actually has at that moment. Only the name is
 * required; the rest can be filled later. Owner defaults to the signed-in user.
 */
export function NewLeadDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}): React.JSX.Element {
  const session = useSession()
  const create = useCreateLead()
  const currentStaff = STAFF.find((s) => s.name === session.userFullName) ?? STAFF[0]

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState<SourceKey>('WALK_IN')
  const [plan, setPlan] = useState('')
  const [goal, setGoal] = useState('')
  const [ownerId, setOwnerId] = useState<string>(currentStaff.id)
  const [notes, setNotes] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4 text-primary" />
            New lead
          </DialogTitle>
          <DialogDescription>
            Capture an enquiry in under a minute. Only the name is required.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="nl-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="nl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nl-phone">Phone</Label>
              <Input id="nl-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nl-email">Email</Label>
              <Input id="nl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="nl-source">Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as SourceKey)}>
              <SelectTrigger id="nl-source">
                <SelectValue placeholder="Where did they come from?" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_KEYS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SOURCES[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nl-plan">Plan interest</Label>
              <Input id="nl-plan" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="e.g. Annual Premium" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nl-goal">Goal</Label>
              <Input id="nl-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Weight loss" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="nl-owner">Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger id="nl-owner">
                <SelectValue placeholder="Who owns this?" />
              </SelectTrigger>
              <SelectContent>
                {STAFF.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="nl-notes">Notes</Label>
            <Textarea id="nl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything worth remembering" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              create.mutate(
                {
                  name,
                  phone: phone.trim() || undefined,
                  email: email.trim() || undefined,
                  source,
                  planInterest: plan.trim() || undefined,
                  goal: goal.trim() || undefined,
                  ownerId,
                  notes: notes.trim() || undefined
                },
                { onSuccess: () => onOpenChange(false) }
              )
            }
            disabled={create.isPending || !name.trim()}
          >
            {create.isPending ? 'Creating…' : 'Create lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}