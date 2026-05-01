# Plan: Add "Create New Lead" Button in Select Lead Card Header

## Summary

Add a "Create new lead" button in the card header of "Select Lead" section in `membership_sale_form.html`, mirroring the existing implementation from other templates.

## Current State

**`membership_sale_form.html` (lines 11-14):**

```html
<div class="card mb-3">
  <div class="card-header">
    <h5 class="mb-0">
      <i class="feather icon-user-check mr-2"></i>Select Lead
    </h5>
  </div>
  <div class="card-body"></div>
</div>
```

## References

### 1. Dashboard Implementation (`organizations/dashboard.html:10-15`)

```html
<button
  type="button"
  hx-get="{% url 'hx-create-lead' slug=request.organization.slug %}"
  hx-target="#modal-form"
  class="btn btn-primary"
>
  <i data-feather="plus" class="icon-sm"></i> Add Lead
</button>
```

### 2. All Leads Page (`leads/all_leads.html:6-15`)

```html
<button
  class="btn btn-primary my-2"
  type="button"
  data-toggle="collapse"
  data-target="#collapseExample"
  aria-expanded="false"
  aria-controls="collapseExample"
>
  Add new Lead
</button>
```

### 3. Modal Container (`base.html:199-205`)

- `#modal-container` - the modal wrapper
- `#modal-form` - the target for HTMX content

### 4. Lead Creation View (`leads/views.py:232-304`)

- `hx_create_lead` view handles lead creation via modal

## Implementation

### Step 1: Update Card Header

Modify lines 11-14 in `membership_sale_form.html`:

**From:**

```html
<div class="card mb-3">
  <div class="card-header">
    <h5 class="mb-0">
      <i class="feather icon-user-check mr-2"></i>Select Lead
    </h5>
  </div>
</div>
```

**To:**

```html
<div class="card mb-3">
  <div class="card-header d-flex justify-content-between align-items-center">
    <h5 class="mb-0">
      <i class="feather icon-user-check mr-2"></i>Select Lead
    </h5>
    <button
      type="button"
      hx-get="{% url 'hx-create-lead' slug=request.organization.slug %}"
      hx-target="#modal-form"
      class="btn btn-primary btn-sm"
    >
      <i class="feather icon-plus"></i> Create New Lead
    </button>
  </div>
</div>
```

### Step 2: Verify Modal Handling

The existing JS in `base.html` already handles:

- `lead_create_success` event (lines 476-487 in `membership_sale_form.html`)
- Modal show/hide behavior (lines 212-244 in `base.html`)

## Files to Modify

- `/home/vr3n/codes/crm/crown_crm/templates/accounting/partials/membership_sale_form.html`

## Notes

- Uses same URL pattern as dashboard: `hx-create-lead`
- Targets `#modal-form` which triggers Bootstrap modal automatically
- Button style matches existing `btn btn-primary btn-sm`
- Icon uses Feather icons (`icon-plus`)
