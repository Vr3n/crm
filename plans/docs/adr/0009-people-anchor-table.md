# `people` anchor table for Person ≠ Lead ≠ Customer

A `people` table anchors identity: a `lead` and a `customer` each reference a `person`,
so Person ≠ Lead ≠ Customer is structurally enforced (Modules 01/13) and a person is
never duplicated merely because their lifecycle changed (lead → customer). Chosen over
embedding contact fields directly on `leads` and `customers` (which would let the same
human exist twice and force duplicate-detection by phone/email) because the anchor makes
"the same person is one row" a schema fact rather than an application convention. The
customer still carries a billing-contact snapshot for invoices; the person holds the
stable identity. Cost is one join table — cheap now, expensive to retrofit once leads
and customers exist in bulk.