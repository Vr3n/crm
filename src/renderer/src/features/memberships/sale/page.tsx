import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { useSession } from '@/context/session-context'
// import { SaleAnchorNav } from './components/sale-anchor-nav' // commented per request — uncomment when anchor nav needed
import { SaleSectionCard } from './components/sale-section-card'
import { OrderSummary } from './components/order-summary'

/**
 * Membership Sale — IA & Layout scaffold (plan 01).
 * Single scrolled page + sticky Order Summary (Tally-style). Later phases
 * (02-07) replace each placeholder card body with real pickers/calculations.
 */
export function MembershipSalePage(): React.JSX.Element {
  const session = useSession()
  const navigate = useNavigate()

  return (
    <div className="flex w-full flex-col gap-0">
      {/* Page header — title is "Membership Sale" (updated per request in 01) */}
      <div className="px-6 pb-4 pt-6">
        <PageHeader
          title="Membership Sale"
          description={`${session.organizationName} · create membership, invoice and payment in one sale`}
          actions={
            <Button variant="outline" size="sm" onClick={() => navigate('/memberships')}>
              <ArrowLeft className="size-4" />
              View memberships
            </Button>
          }
        />
      </div>

      {/* Anchor nav — scroll-spy pills (commented per request; uncomment when needed) */}
      {/* <div className="px-6">
        <SaleAnchorNav />
      </div> */}

      {/* Two-column layout: left 2/3 form, right 1/3 sticky summary */}
      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-start">
        {/* Left — stacked section cards */}
        <div className="flex min-w-0 flex-col gap-4">
          <SaleSectionCard
            id="lead"
            step={1}
            title="Member"
            description="Search by name or phone, or create a new lead inline. Loyalty chips appear when the person is already a customer."
            required
            badge="Lead"
          >
            <p className="text-xs font-medium text-muted-foreground">Member picker — AutocorrectCombobox</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">Phase 02 will wire search + inline create + duplicate-phone guard</p>
          </SaleSectionCard>

          <div className="grid gap-4 sm:grid-cols-2">
            <SaleSectionCard
              id="plan"
              step={2}
              title="Plan"
              description="Plan sets the initial base price and duration. You can still override any value before selling — the snapshot keeps the difference."
              required
              badge="Required"
            >
              <p className="text-xs font-medium text-muted-foreground">Plan picker — AutocorrectCombobox</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">Phase 02 will seed base price, tax and auto-calculate end date</p>
            </SaleSectionCard>

            <SaleSectionCard
              id="offer"
              step={3}
              title="Offer"
              description="Offers are filtered to the chosen plan. Picking one reveals discount type and value, which stay editable."
              badge="Optional"
            >
              <p className="text-xs font-medium text-muted-foreground">Offer picker + discount type/value</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">Phase 03 will link the four discount types to the final price</p>
            </SaleSectionCard>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SaleSectionCard
              id="dates"
              step={4}
              title="Dates"
              description="Start defaults to today. End auto-sets from the plan duration (e.g. QUARTERLY = +90 days) and stays editable."
            >
              <p className="text-xs font-medium text-muted-foreground">Start date · End date — two independent date pickers</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">Phase 04 will add UTC/Asia/Kolkata handling and duration validation</p>
            </SaleSectionCard>

            <SaleSectionCard
              id="pricing"
              step={5}
              title="Pricing"
              description="Base price in rupees (2 decimals, comma-grouped). Discount amount and final price update live. Tax and registration fee are optional."
            >
              <p className="text-xs font-medium text-muted-foreground">Base · Discount · Final (₹, 2 decimals)</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">Phase 03 will add masking, reactive calc and zero-trial guard</p>
            </SaleSectionCard>
          </div>

          <SaleSectionCard
            id="payment"
            step={6}
            title="Payment"
            description="Paid may be partial — amount due / change due shows live. Payment method is required; overpay offers credit vs change."
            required
          >
            <p className="text-xs font-medium text-muted-foreground">Paid amount · Payment method · Amount due</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">Phase 05 will add partial/overpay logic</p>
          </SaleSectionCard>

          {/* Mobile submit — visible only below lg; desktop uses the button under Order Summary */}
          <Button disabled size="sm" className="w-full gap-1.5 lg:hidden">
            <Sparkles className="size-4" />
            Sell &amp; invoice
          </Button>
        </div>

        {/* Right — sticky Order Summary (desktop) + Submit */}
        <div className="hidden min-w-0 lg:block">
          <div className="sticky top-[72px] flex flex-col gap-4">
            <OrderSummary />
            <Button disabled size="sm" className="w-full gap-1.5">
              <Sparkles className="size-4" />
              Sell &amp; invoice
            </Button>
            <p className="px-1 text-center text-[11px] leading-relaxed text-muted-foreground">
              This preview mirrors the Tally-style totals block.
              <br />
              Later phases will bind it to live pricing.
            </p>
          </div>
        </div>
      </div>

      {/* Mobile bottom summary bar — collapses sticky card on small screens */}
      <div className="sticky bottom-0 z-20 border-t bg-card px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium">Order summary</p>
            <p className="truncate text-[11px] text-muted-foreground">Final — · Paid — · Due —</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}>
            Review totals
          </Button>
        </div>
      </div>
    </div>
  )
}
