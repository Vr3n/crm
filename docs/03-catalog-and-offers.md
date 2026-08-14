# Module 03 — Catalog & Offers

**Bounded context:** `Catalog`
**Depends on:** nothing (pure reference data — plans and offers can be seeded before any customer exists).
**Feeds into:** Module 02 (Membership references a Plan + Offer at sale time) and Module 04 (Invoice lines snapshot catalog pricing).

## Why build this module second (right after Sales)

Plans and Offers are simple reference/lookup data — CRUD screens, no workflow, no state machine. Building this module early gives every later module (Membership sale, Renewal, Invoice generation) something real to point at, and lets you demo pricing math (base price − offer = final price) in isolation before wiring up payments.

## Worked example: base price, offer, and the number that must never change later

```text
Plan "Annual Premium"        base_price = ₹24,000  (as of today)
Offer "New Year Offer"       type = PERCENTAGE, value = 20%, valid Jan 1–31

Sale on Jan 15:
  base_price        ₹24,000
  offer applied     New Year Offer (20%)
  discount_amount   ₹4,800
  final_price       ₹19,200   ← this number gets copied onto the Membership and Invoice Line

Feb 10 — marketing changes the offer to 10% for the next campaign,
         and finance raises the plan's base_price to ₹26,000.

The Jan 15 sale still shows:
  base_price        ₹24,000
  discount_amount   ₹4,800
  final_price       ₹19,200
```

The Plan and Offer rows are allowed to change freely — that's their whole purpose (they're *current* pricing rules, refreshed as marketing needs). What must never change is the **snapshot** taken at the moment of sale, which lives in Membership/Invoice records (Modules 02 & 04), not here.

## Technical decision, explained intuitively

**Why is "Membership Plan" explicitly *not* modeled as inventory/stock, even though it lives in a "Catalog" module next to things that will eventually include real inventory (protein powder, merchandise)?**
Stock inventory answers "how many physical units are left" and decrements on sale. A membership plan answers "what are the commercial terms if someone buys this," and doesn't get "used up" by a sale — a thousand people can buy "Monthly Basic" simultaneously. If you build one generic `inventory_items` table for both, you'll end up with nonsensical columns like `stock_quantity` on a membership plan that's always null or ignored. Keep plans/offers/fees as **catalog definitions** (no quantity concept) and, if/when physical products are added later, give them their own `inventory_items` table with real stock tracking. Don't force one schema to serve two different domain concepts.

**Why store `discount_type` as an enum (`FIXED_AMOUNT`, `PERCENTAGE`, `OVERRIDE_PRICE`, `FREE_PERIOD`) instead of just a discount percentage column?**
Real gym offers aren't all percentage-based — "first month free," "flat ₹2,000 off," and "₹20,000 instead of whatever the list price is" are all common and require different math. An enum + a single `value` column lets one small pricing-calculation function handle all four cases, instead of the codebase growing ad-hoc columns (`percent_off`, `flat_off`, `override_price`...) every time sales invents a new promotion style.

---

# 9. Offer

An Offer is a commercial pricing rule.

Examples:

```text
New Year Offer
Student Discount
Referral Offer
First Month 50% Off
Annual Plan ₹20,000 instead of ₹24,000
```

Offers may define:

```text
Name
Description
Discount type
Discount amount
Eligibility
Applicable plans
Start date
End date
Maximum usage
Minimum purchase
Active/inactive
```

Discount types may include:

```text
FIXED_AMOUNT
PERCENTAGE
OVERRIDE_PRICE
FREE_PERIOD
```

The actual application of an offer must be recorded on the sale/invoice.

Do not calculate historical invoice values from the current offer definition.

---

# 10. Offer vs Membership Plan

This distinction is fundamental.

Example:

```text
Plan:
    Annual Premium
    Base Price = ₹24,000

Offer:
    New Year Offer
    Discount = 20%
```

Sale:

```text
Base Price      ₹24,000
Discount        ₹4,800
Final Price     ₹19,200
```

Later:

```text
Offer changed from 20% → 10%
```

The customer's invoice must remain:

```text
₹19,200
```

not:

```text
₹21,600
```

Historical transactions contain their own commercial snapshot.

---

# 11. Catalog

The Catalog owns things the gym sells.

Initial catalog:

```text
Membership Plan
Fee
Add-on
Offer
```

Future catalog items may include:

```text
Personal Training
Merchandise
Protein products
Day passes
Classes
Locker rental
Assessment
Registration fee
```

There is an important distinction between a catalog and physical inventory.

A membership plan is not inventory in the conventional stock sense.

There may be:

```text
100 membership slots available
```

but that is a capacity/business-rule problem.

By contrast:

```text
Protein powder:
    20 units available
```

is actual inventory.

Therefore the initial application should call the module:

**Catalog & Offers**

rather than pretending membership plans are warehouse inventory.

Actual stock management can be added later.

---

