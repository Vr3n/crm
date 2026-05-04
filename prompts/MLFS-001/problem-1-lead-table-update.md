# MLFS-001: Lead Table Doesn't Update on lead-created Event

## Symptom

When a new lead is created via the "Create New Lead" modal in the membership sale form, the lead table (showing search results) does not refresh to display the newly created lead.

## Current Behavior

The lead table container has this configuration in `membership_sale_form.html`:

```html
<div
  id="leadTableContainer"
  class="card"
  hx-get="{% url 'search-lead' slug=request.organization.slug %}"
  hx-trigger="load, lead-created"
  hx-swap="innerHTML"
  hx-target="#leadTableCardBody"
>
  <div class="card-body" id="leadTableCardBody">
    <p class="text-muted small text-center py-3">Loading leads...</p>
  </div>
</div>
```

The trigger uses `lead-created` but it's listening on the element itself, not from the global event namespace.

## Root Cause Analysis

The `hx-trigger="load, lead-created"` listens for a `lead-created` event directly on the `#leadTableContainer` element. However, custom events dispatched via HTMX's `trigger_client_event` function are dispatched on the `body` element, not on specific elements.

The correct syntax should be `hx-trigger="load, lead-created from:body"` to listen to events dispatched on the body element.

## Plan to Fix

### Step 1: Fix the HTMX trigger syntax

**File:** `crown_crm/templates/accounting/partials/membership_sale_form.html`
**Line:** ~41

**Change from:**

```html
hx-trigger="load, lead-created"
```

**To:**

```html
hx-trigger="load, lead-created from:body"
```

This tells HTMX to listen for the `lead-created` custom event dispatched on the `body` element.

### Step 2: Verify event dispatch is correct

The `HxCreateLeadView` (in `crown_crm/leads/views.py`) already dispatches the `lead-created` event via the `HtmxFormsetMixin`. This is configured with:

```python
success_event = "lead-created"
```

The `HtmxFormMixin` in `crown_crm/core/mixins.py` dispatches events using `trigger_client_event` which fires on the body. This should work correctly - no changes needed here.

### Step 3: Test the fix

After making the change:

1. Navigate to the membership sale create page (`/crown-vitality/accounting/sales/create/`)
2. Click "Create New Lead" button to open the modal
3. Fill in the lead form with valid data and submit
4. Verify the lead table refreshes and shows the newly created lead at the top

## Files to Modify

- `crown_crm/templates/accounting/partials/membership_sale_form.html` (line ~41)

## Expected Outcome

After creating a new lead, the lead search table should automatically refresh via HTMX and display the newly created lead in the list.
