# Plan: Dashboard Lead Charts + Recent Leads React to HTMX Events

## Objective

Make the dashboard's lead charts and "Recent Leads" table automatically update when a lead is created or updated via HTMX form submission.

## Current State

### Dashboard (`dashboard.html`)

- Displays 3 metric cards: Total Leads, Memberships Sold, Followups
- Shows "Recent Leads" table via `{% include "leads/tables/leads.html" with leads=recent_leads %}`
- Uses ApexCharts for visualizations in `dashboard.js`
- Static data rendered at page load (not reactive)

### Event Flow

1. User opens "Add Lead" modal → clicks button with `hx-get="{% url 'hx-create-lead' slug=request.organization.slug %}"`
2. Fills form and submits → POST to `HxCreateLeadView`
3. On success → returns 204 + triggers `lead-created` event
4. Event bubbles to `document.body`

### What's Missing

- Dashboard doesn't listen for `lead-created` or `lead-updated` events
- No mechanism to refresh the "Recent Leads" table or update chart counts

## Proposed Solution

### Approach: HTMX Partial Refresh

Add event listeners in dashboard that trigger HTMX requests to refresh specific sections:

1. **For Recent Leads Table:**
   - Add a unique ID to the container (or use HTMX-out-of)
   - On `lead-created`/`lead-updated`, trigger an HTMX GET to fetch updated table

2. **For Lead Count & Chart:**
   - Use a separate HTMX endpoint that returns just the count/chart data
   - Or trigger full dashboard refresh

### Implementation Details

#### 1. Add ID to Recent Leads Container

In `dashboard.html`, add `id` to the Recent Leads div:

```django
<div class="col-md-6">
  <div class="card">
    <div class="card-body">
      <div class="card-title">
        <h5 class="text-danger">Recent Leads</h5>
      </div>
      <div class="table-responsive" id="recent-leads-container">
        {% include "leads/tables/leads.html" with leads=recent_leads %}
      </div>
    </div>
  </div>
</div>
```

#### 2. Create HTMX Endpoint for Recent Leads Table

Add new URL/view in `leads/urls.py`:

```python
path("hx/recent-leads/", HxRecentLeadsTableView.as_view(), name="hx-recent-leads-table"),
```

Add new view in `leads/views.py`:

```python
class HxRecentLeadsTableView(TemplateView):
    """Returns just the recent leads table HTML for HTMX refresh."""
    template_name = "leads/tables/leads.html"

    def get_context_data(self, **kwargs):
        # Get recent leads for org
        context = super().get_context_data(**kwargs)
        context['leads'] = self.request.organization.leads.all()[:10]
        return context
```

#### 3. Add Event Listeners in Dashboard

In `dashboard.html` `{% block custom_js %}`:

```django
<script>
document.addEventListener("DOMContentLoaded", function() {
  // Existing dashboard.js code...

  // NEW: Listen for lead events
  document.body.addEventListener("lead-created", function(evt) {
    htmx.ajax('GET', '{% url "hx-recent-leads-table" slug=request.organization.slug %}', {
      target: '#recent-leads-container',
      swap: 'outerHTML'
    });
  });

  document.body.addEventListener("lead-updated", function(evt) {
    htmx.ajax('GET', '{% url "hx-recent-leads-table" slug=request.organization.slug %}', {
      target: '#recent-leads-container',
      swap: 'outerHTML'
    });
  });
});
</script>
```

#### 4. Handle Lead Count & Chart Updates

**Option A:** Full dashboard refresh (simpler)

```javascript
document.body.addEventListener("lead-created", function (evt) {
  htmx.ajax("GET", window.location.href, {
    target: "#dashboard-container", // wrap dashboard in a div with this ID
    swap: "outerHTML",
  });
});
```

**Option B:** Separate endpoint for counts (more efficient)

```python
class HxDashboardMetricsView(TemplateView):
    """Returns just the metrics card HTML."""
    template_name = "partials/dashboard_metrics.html"

    def get_context_data(self, **kwargs):
        # Return updated lead_count, recent_lead_count, etc.
```

Recommended: Option A for simplicity.

## Files to Modify

| File                                               | Change                                      |
| -------------------------------------------------- | ------------------------------------------- |
| `crown_crm/leads/urls.py`                          | Add `hx-recent-leads-table/` URL            |
| `crown_crm/leads/views.py`                         | Add `HxRecentLeadsTableView`                |
| `crown_crm/templates/organizations/dashboard.html` | Add ID to container + event listeners       |
| `crown_crm/templates/leads/tables/leads.html`      | Ensure proper for-loop with `leads` context |

## Event Payload

The `lead-created` event carries params from `get_success_event_params()`. Currently returns empty. Consider adding lead ID:

```python
# In HtmxFormMixin or view
def get_success_event_params(self):
    return {"lead_id": str(self._object.id)}  # if _object exists
```

Then JS can use:

```javascript
document.body.addEventListener("lead-created", function (evt) {
  console.log("New lead:", evt.detail.lead_id);
});
```

## Acceptance Criteria

1. ✅ After creating a lead via HTMX form, Recent Leads table updates automatically
2. ✅ No page refresh required
3. ✅ Works for both `lead-created` and `lead-updated` events
4. ✅ Lead count in metric card also updates (or table is sufficient)

## Alternative Approaches Considered

1. **WebSocket/SSE** - Overkill for this use case
2. **Polling** - Not real-time enough
3. **Full dashboard reload** - Works but heavier

Current approach (HTMX partial swap) is optimal.
