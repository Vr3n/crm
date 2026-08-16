import { Bell, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Row actions: icon-only View-details (Eye) + Follow-up (Bell), each a slightly
 * larger outlined button tinted with a brand accent so the actions are easy to
 * tell apart at a glance — cyan for viewing, pink for following up. Members live
 * in Module 02 which isn't built yet, so both give an honest toast pointing to
 * the upcoming module rather than faking a working flow.
 */
export function RowActions({ memberName }: { memberName: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-end gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="text-primary hover:bg-primary/10 hover:text-primary"
            aria-label={`View ${memberName} details`}
            onClick={() =>
              toast('Member details', {
                description: 'The Members module (Module 02) will open the full member record.'
              })
            }
          >
            <Eye className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">View details</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="text-secondary hover:bg-secondary/10 hover:text-secondary"
            aria-label={`Follow up on ${memberName}`}
            onClick={() =>
              toast('Follow-up scheduling', {
                description: 'Member follow-ups arrive with the Members module (Module 02).'
              })
            }
          >
            <Bell className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Follow up</TooltipContent>
      </Tooltip>
    </div>
  )
}
