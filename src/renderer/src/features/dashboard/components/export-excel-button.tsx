import { FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Toolbar "Export" action (green outline). Honest placeholder for now — the
 * export pipeline arrives with the Reports module, so it toasts instead of
 * faking a spreadsheet download. Sized to sit beside the date-range trigger.
 */
export function ExportExcelButton(): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 rounded-md px-3 text-xs text-success shadow-sm hover:bg-success/10 hover:text-success"
          onClick={() =>
            toast('Export to Excel', {
              description: 'Spreadsheet export arrives with the Reports module.'
            })
          }
        >
          <FileSpreadsheet className="size-4" />
          Export
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Export as Excel</TooltipContent>
    </Tooltip>
  )
}
