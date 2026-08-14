# MLFS-001: Selected Lead Card Doesn't Render Details After Creation

## Symptom

When a new lead is created via the "Create New Lead" modal in the membership sale form, the selected lead card that appears after creation doesn't display the lead's contact details (mobile numbers and emails). It shows the lead name but contact info shows empty or "N/A".

## Current Behavior

After creating a lead, the event handler in `membership_sale_form.html` (lines 483-493) tries to render the selected lead card:

```javascript
document.body.addEventListener("lead-created", function (evt) {
  const d = evt.detail;
  const leadName = [d.first_name, d.middle_name, d.last_name]
    .filter(Boolean)
    .join(" ");
  document.getElementById("leadSelection").innerHTML = selectedLeadCard(
    leadName,
    d.id,
    d.mobile_numbers || [],
    d.emails || [],
  );
  document.getElementById("id_lead").value = d.id;
  // ...
});
```

The `selectedLeadCard` function is called with:

- `leadName` - properly constructed from first, middle, last name
- `d.id` - the lead ID
- `d.mobile_numbers` - expected to be an array of mobile numbers
- `d.emails` - expected to be an array of emails

However, these arrays are empty/undefined because the event detail doesn't contain this data.

## Root Cause Analysis

The `HxCreateLeadView.get_success_event_params()` method in `crown_crm/leads/views.py` (line 876) only returns limited data:

```python
def get_success_event_params(self):
    return {"lead_id": self._object.id, "quick": True}
```

This only passes `lead_id` and `quick`, but NOT:

- `first_name`
- `middle_name`
- `last_name`
- `mobile_numbers`
- `emails`

The event handler expects these fields to be in `evt.detail`, but they're missing.

## Plan to Fix

### Option A: Fetch lead details via GET after creation (Recommended per Senior Review)

Instead of passing lead data in the event, fetch the newly created lead's details via an HTMX GET request after the `lead-created` event fires. The endpoint returns pre-rendered HTML (same as selectedLeadCard), and triggers a custom `lead-selected` event.

**Step 1: Create a new endpoint to fetch lead details**

**File:** `crown_crm/leads/urls.py`

Add a new URL pattern:

```python
path("hx/<uuid:pk>/detail/", views.HxLeadDetailView.as_view(), name="hx-lead-detail"),
```

**Step 2: Create HxLeadDetailView**

**File:** `crown_crm/leads/views.py`

```python
class HxLeadDetailView(HtmxMixin, View):
    """Return lead details as HTML for HTMX injection."""
    template_name = "leads/partials/lead_selected_card.html"
    success_event = "lead-selected"

    def get(self, request, *args, **kwargs):
        lead = get_object_or_404(
            LeadMaster,
            pk=kwargs["pk"],
            organization=request.organization
        )
        return self.render_to_response({
            "lead": lead,
            "mobile": lead.mobile_numbers.first(),
            "email": lead.emails.first(),
        })
```

**Step 3: Create HTML template for selected lead card**

**File:** `crown_crm/templates/leads/partials/lead_selected_card.html`

Copy the HTML structure from `selectedLeadCard` function in `membership_sale_form.html`:

```django
<div class="card">
  <div class="card-body">
    <div class="card border-info mb-2">
      <div class="card-header bg-info text-white d-flex justify-content-between align-items-center py-2 px-3">
        <h6 class="mb-0 text-white fw-normal">
          <i class="feather icon-user me-2"></i>{{ lead.full_name }}
        </h6>
        <button type="button" class="btn btn-xs btn-outline-light border-0 p-1"
                onclick="removeSelectedLead()" title="Remove">
          <i class="feather icon-x"></i>
        </button>
      </div>
      <div class="card-body p-3">
        <div class="row g-2 text-center">
          <div class="col-6">
            <div class="text-muted small"><i class="feather icon-phone me-1"></i>Contact</div>
            <div class="fw-bold">{{ mobile.mobile_number|default:"N/A" }}</div>
          </div>
          <div class="col-6">
            <div class="text-muted small"><i class="feather icon-mail me-1"></i>Email</div>
            <div class="fw-bold text-truncate">{{ email.email|default:"N/A" }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

**Step 4: Add HTMX trigger in the template**

Add HTMX attributes to trigger the event on load:

```django
<div id="lead-detail-container"
     hx-get="{% url 'hx-lead-detail' slug=request.organization.slug pk=lead.pk %}"
     hx-trigger="load"
     hx-swap="afterend">
</div>
```

Actually, the better approach is to use the HTMX view to directly trigger the event with the rendered HTML. Let's adjust:

**Step 3 (revised): Create HTML template that includes event trigger**

**File:** `crown_crm/templates/leads/partials/lead_selected_card.html`

```django
{% load utils %}
<div id="lead-selected-content" data-lead-id="{{ lead.pk }}">
  <div class="card">
    <div class="card-body">
      <div class="card border-info mb-2">
        <div class="card-header bg-info text-white d-flex justify-content-between align-items-center py-2 px-3">
          <h6 class="mb-0 text-white fw-normal">
            <i class="feather icon-user me-2"></i>{{ lead.full_name }}
          </h6>
          <button type="button" class="btn btn-xs btn-outline-light border-0 p-1"
                  onclick="removeSelectedLead()" title="Remove">
            <i class="feather icon-x"></i>
          </button>
        </div>
        <div class="card-body p-3">
          <div class="row g-2 text-center">
            <div class="col-6">
              <div class="text-muted small"><i class="feather icon-phone me-1"></i>Contact</div>
              <div class="fw-bold">{{ mobile.mobile_number|default:"N/A" }}</div>
            </div>
            <div class="col-6">
              <div class="text-muted small"><i class="feather icon-mail me-1"></i>Email</div>
              <div class="fw-bold text-truncate">{{ email.email|default:"N/A" }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
  // Dispatch lead-selected event with the rendered HTML
  const content = document.getElementById('lead-selected-content');
  const leadId = content.dataset.leadId;
  document.body.dispatchEvent(new CustomEvent('lead-selected', {
    detail: {
      lead_id: leadId,
      html: content.innerHTML
    }
  }));
  // Remove this script tag after execution
  document.currentScript.remove();
</script>
```

**Step 5: Update event handler in membership_sale_form.html**

**File:** `crown_crm/templates/accounting/partials/membership_sale_form.html`
**Lines:** ~483-493

**Change from:**

```javascript
document.body.addEventListener("lead-created", function (evt) {
  const d = evt.detail;
  const leadName = [d.first_name, d.middle_name, d.last_name]
    .filter(Boolean)
    .join(" ");
  document.getElementById("leadSelection").innerHTML = selectedLeadCard(
    leadName,
    d.id,
    d.mobile_numbers || [],
    d.emails || [],
  );
  document.getElementById("id_lead").value = d.id;
  // ...
});
```

**To:**

```javascript
document.body.addEventListener("lead-created", function (evt) {
  const d = evt.detail;
  // Trigger HTMX to fetch lead details, which will render the card and fire lead-selected
  htmx.trigger("#leadTableContainer", "lead-selected-fetch", {
    lead_id: d.lead_id,
  });
});

// Handler for lead-selected event (receives pre-rendered HTML)
document.body.addEventListener("lead-selected", function (evt) {
  const d = evt.detail;
  // Insert the pre-rendered HTML directly
  document.getElementById("leadSelection").innerHTML = d.html;
  document.getElementById("id_lead").value = d.lead_id;
  // Clear search and results
  const el = document.getElementById("leadSearch");
  if (el) el.value = "";
  const res = document.getElementById("leadSearchResults");
  if (res) res.innerHTML = "";
});
```

**Alternative simpler approach: Use hx-get on hidden element**

Instead of manual HTMX triggering, use HTMX's built-in features:

**Step 3 (simplified): Create HTML template**

**File:** `crown_crm/templates/leads/partials/lead_selected_card.html`

```django
{% load utils %}
<div id="leadSelectionRender">
  <div class="card">
    <div class="card-body">
      <div class="card border-info mb-2">
        <div class="card-header bg-info text-white d-flex justify-content-between align-items-center py-2 px-3">
          <h6 class="mb-0 text-white fw-normal">
            <i class="feather icon-user me-2"></i>{{ lead.full_name }}
          </h6>
          <button type="button" class="btn btn-xs btn-outline-light border-0 p-1"
                  onclick="removeSelectedLead()" title="Remove">
            <i class="feather icon-x"></i>
          </button>
        </div>
        <div class="card-body p-3">
          <div class="row g-2 text-center">
            <div class="col-6">
              <div class="text-muted small"><i class="feather icon-phone me-1"></i>Contact</div>
              <div class="fw-bold">{{ mobile.mobile_number|default:"N/A" }}</div>
            </div>
            <div class="col-6">
              <div class="text-muted small"><i class="feather icon-mail me-1"></i>Email</div>
              <div class="fw-bold text-truncate">{{ email.email|default:"N/A" }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

**Step 4: Use hx-get with hx-on to trigger the lead-selected event**

**File:** `crown_crm/templates/leads/partials/lead_selected_card.html`

```django
<!-- After the card HTML -->
<script>
  (function() {
    const container = document.getElementById('leadSelectionRender');
    const leadId = '{{ lead.pk }}';
    document.body.dispatchEvent(new CustomEvent('lead-selected', {
      detail: {
        lead_id: leadId,
        html: container.outerHTML
      }
    }));
  })();
</script>
```

Then the event handler just needs to listen for `lead-selected` and insert the HTML.

### Why This Approach is Preferred

- No JSON parsing required
- Renders HTML directly using Django templates (same as what's already used for selectedLeadCard)
- Pre-rendered HTML is more reliable than constructing it in JavaScript
- Custom `lead-selected` event carries the pre-rendered HTML in the detail
- Clean separation: `lead-created` triggers the fetch, `lead-selected` handles the display

### Option B: Fetch lead data after creation via HTMX

Instead of passing lead data in the event, make an HTMX GET request to fetch lead details after creation. This is more complex and requires an additional endpoint.

### Why Option A is Preferred

- Simpler implementation
- Reduces round trips to the server
- Event already fires on lead creation, so we just need to include the right data

## Files to Modify

1. `crown_crm/leads/urls.py` - Add new URL pattern for lead detail endpoint
2. `crown_crm/leads/views.py` - Add `HxLeadDetailView` class
3. `crown_crm/templates/leads/partials/lead_selected_card.html` - Create new HTML template
4. `crown_crm/templates/accounting/partials/membership_sale_form.html` - Update event handlers (lines ~483-493)

## Expected Outcome

After creating a new lead:

1. The `lead-created` event fires with `lead_id` in the detail
2. HTMX GET request fetches the lead's pre-rendered HTML
3. The endpoint dispatches `lead-selected` event with the rendered HTML
4. The `lead-selected` handler inserts the HTML into `#leadSelection`
5. The selected lead card displays:
   - Lead full name (first + middle + last)
   - Mobile number (from the first mobile number entered)
   - Email address (from the first email entered)
