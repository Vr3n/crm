# Gym CRM — Core Context

A single-context domain covering sales, memberships, billing, payments, and the
identity/tenancy layer for a gym management desktop application (offline Electron +
SQLite, shaped for future hosted multi-tenancy).

## Language

**Organization**:
The top-level business entity the software runs for (a gym or gym chain). The root
scoping dimension for all data, and the vendor's customer. Every row in the system
belongs to exactly one Organization.
_Avoid_: Tenant, Gym, Company, "Customer"

**User**:
A person's login identity (one global row, independent of any Organization). A User
is not their role, and not their Organization.
_Avoid_: Staff member, employee, account, login

**OrganizationStaff**:
The record binding a User to an Organization with a single Role. The join through
which a User gains access to an Organization's data and permissions.
_Avoid_: Membership (reserved for the gym product in Module 02), UserRole, Assignment, staff record

**Role**:
A named bundle of Permissions (or super access). Roles are data, not code, and are
editable except for the system roles.
_Avoid_: Permission group, security role

**Permission**:
A fine-grained capability code (e.g. `invoice.finalize`) that a Role grants and the
Command layer checks.
_Avoid_: Feature, right, access level

**Super role**:
A Role flagged `is_super` that grants all Permissions without enumerating them
(Owner and Admin). Code checks Permissions; a super role short-circuits that check.
_Avoid_: Wildcard, "all permissions"

**Organization Context**:
The Organization and Role active in the current session; every Command is scoped to
it. Source of truth is the session, never a URL or request field.
_Avoid_: Current tenant, active org (in code)

## Sales

**Person**:
A human being known to the business, independent of any role. A Person is neither a
Lead nor a Customer; the same Person is never duplicated when their lifecycle changes.
_Avoid_: Contact, member, customer (in the identity sense)

**Lead**:
A sales opportunity for a Person who may become a paying customer. A Lead is not the
customer itself; a Person may have multiple opportunities over time.
_Avoid_: Prospect, enquiry, candidate

**Lead Stage**:
The current stage of the sales process. Stages are configurable data; application logic
only reads the `is_won` / `is_lost` flags, never the literal stage name.
_Avoid_: Lead status, pipeline column, stage name (as logic)

**Lead Source**:
Where an enquiry came from (Walk-in, Phone, Referral, Instagram, ...). Configurable
data; it must survive conversion so revenue-by-source reporting works.
_Avoid_: Channel, origin

**Follow-up**:
A future action someone intends to perform, with a due date, that gets marked done.
_Avoid_: Reminder, to-do, note (a note is not a follow-up)

**Lead Activity**:
A record of an interaction or sales event that actually happened, retained as history.
_Avoid_: Note, comment, log entry

## Customer & Membership

**Customer**:
A Person who has entered a commercial relationship with the gym. A Customer is not an
active member — an expired Customer still exists.
_Avoid_: Member (when "currently holding an active membership" is meant), client, account

**Membership**:
One purchased entitlement period for a Customer, tied to a Plan. A new row is created on
renewal, never an overwrite of the old one.
_Avoid_: Subscription, membership record (for a single period), "the customer's plan"

**Membership Plan**:
A reusable commercial product definition (name, price, duration, billing frequency,
tax, freeze/proration/cancellation policy). A Plan is not a Membership, and changing a
Plan never alters existing Memberships.
_Avoid_: Product, package, "the membership" (ambiguous)

**Membership Freeze**:
A business operation, not a status boolean. A Freeze records start, end, reason, fee,
billing behavior, access behavior, and extension/credit days, and is policy-driven.
_Avoid_: `is_frozen`, pause, hold

**Proration**:
How value is re-computed when a Membership's terms change mid-period (upgrade,
downgrade, cancellation). Proration policy is per-Plan configurable data, not a global
rule.
_Avoid_: Split-billing, pro-rating (in code)

## Catalog

**Offer**:
A commercial pricing rule applied at sale time (fixed amount, percentage, override
price, free period). An Offer changes a sale but never a historical invoice.
_Avoid_: Discount, promotion, coupon (too narrow)

## Billing & Finance

**Invoice**:
An amount owed for goods/services, composed of Invoice Lines. A DRAFT invoice is
editable; once finalized the financial values are immutable.
_Avoid_: Bill, charge, "payment request"

**Invoice Line**:
A historical snapshot of one billable item (description, quantity, unit price, discount,
tax rate, tax amount, line total) captured at creation. Never recomputed from the
current catalog.
_Avoid_: Line item, entry

**Draft**:
An unfinalized Invoice whose lines, billing snapshot and totals are still editable.
Abandoned drafts are kept as rows — they have no terminal state and are never deleted.
_Avoid_: Pending invoice, working copy

**Invoice Number**:
The business-assigned sequential identifier printed on an Invoice (e.g.
`INV-2026-000147`), assigned only at finalization inside the numbering transaction.
Never the database row id, and never reserved by a display preview.
_Avoid_: Invoice id, serial

**Billing Snapshot**:
The customer's name/phone/email/address copied onto an Invoice at draft time as
document history. Edits apply to the invoice only and never write back to the Customer.
_Avoid_: Customer details (on an invoice), address book copy

**Finalization**:
The act that assigns the Invoice Number, freezes all financial values, and opens the
Invoice for payment. The only edit window for content is before it.
_Avoid_: Approval, commit, "saving the invoice"

**Payment**:
Money recorded as received, against one or more Invoices via Allocations. A Payment is a
historical fact that is never edited or deleted.
_Avoid_: Transaction, receipt, "invoice paid flag"

**Payment Allocation**:
The explicit link saying which part of which Payment covers which Invoice. Payments and
Invoices are not one-to-one.
_Avoid_: Payment-invoice link, settlement

**Refund**:
Money returned to the customer, layered on top of the original Payment (never deleting
or editing it). A Refund is not a Credit.
_Avoid_: Reversal, chargeback, "return"

**Credit**:
Value held inside the business, applicable against a future obligation. A Credit is not
a Refund.
_Avoid_: Store credit, account balance (in code), "money back"

**Outstanding Balance**:
A derived value (finalized obligations − allocated payments − applied credits), never a
hand-maintained counter.
_Avoid_: Due amount (as a stored counter), balance column (as source of truth)

## Foundation

**Money**:
A value object of integer minor units plus a currency. Never a floating-point number.
_Avoid_: Amount, price (untyped), "₹19,200.00" (formatted string)

## Licensing

**License**:
The signed artifact (`license.dat`) granting an Organization the right to run the product on
exactly one Device. Immutable — the signed payload is never modified at runtime.
_Avoid_: License key (as the file), serial, activation file

**License ID**:
A unique identifier per License instance, used to track issues and Reissues in the vendor ledger.
_Avoid_: Serial, activation code

**Device**:
The physical PC running the product. A License authorizes exactly one Device.
_Avoid_: Machine (ambiguous with the app), computer, host

**Device Fingerprint**:
The four hashed hardware components (machine GUID, motherboard, system disk, CPU) identifying a
Device. Only the hashes ship in the License; raw hardware identifiers never leave the machine.
_Avoid_: Hardware ID, device_id, fingerprint hash

**Reactivation**:
Re-issuing a License for an Organization after its Device changes. A vendor-ledger concept, never a
runtime branch. Consumes the Organization's Reactivation Allowance.
_Avoid_: Re-bind, re-authorize, activation

**Reissue**:
The mechanical act of producing a new signed License — the fulfillment of a Reactivation. Performed
by the vendor, not the app.
_Avoid_: Regenerate, re-issue (when the mechanical act is meant)

**Reactivation Allowance**:
The per-Organization count of Reactivations the vendor will grant. Tracked in the vendor ledger only.
_Avoid_: Activations remaining, activation budget, "free activations"