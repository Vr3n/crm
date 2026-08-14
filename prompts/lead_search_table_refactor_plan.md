# Lead Search Table Refactor Plan

## Overview

Refactor lead selection in Membership Sale Create form. Replace broken dropdown with a **pre-existing paginated table** with search filtering, select buttons, and popover tooltips.

## Design Summary

| Behavior                | Implementation                                                              |
| ----------------------- | --------------------------------------------------------------------------- |
| Pre-existing table      | Table always visible, shows all leads (paginated) on page load              |
| Search filters in place | Typing in search replaces table content via HTMX                            |
| Select button           | Each row has "Select" button to choose lead                                 |
| Popover tooltip         | On row click/hover, show simple static content (name, one phone, one email) |
| Blank query             | Returns ALL leads (paginated) - not empty state                             |

---

## Current Issues

| Issue              | Location                                                    | Impact                                |
| ------------------ | ----------------------------------------------------------- | ------------------------------------- |
| Parameter mismatch | Template: `name="q"`, View: `request.GET.get("leadSearch")` | Search doesn't work                   |
| No pagination      | View returns all results                                    | Performance degrades                  |
| HTMX trigger       | Uses `keyup changed delay:400ms`                            | Search may not re-trigger after clear |
| hx-include wrong   | Template includes hidden lead PK in search                  | Pointless for GET                     |

---

## Codebase Analysis

### Models

- `LeadMaster`: Uses `uuid` as pk (inherited from `BaseModel`)
- Related: `mobile_numbers`, `emails` (QuerySets)

### Existing Patterns to Follow

- Pagination: `accounting/views.py` (Paginator), `accounting/tables/receipts_table.html`
- Table: `leads/tables/leads.html` - Bootstrap table
- Popover: Bootstrap 4.6 `data-toggle="popover"` + JS initialization

---

## Implementation Plan

### Phase 1: Backend - Update Search View

**File**: `crown_crm/leads/views.py`

**Changes to `search_results_view`**:

```python
from django.core.paginator import Paginator

query = request.GET.get("q", "").strip()

# Base queryset
leads = LeadMaster.objects.filter(organization=request.organization)

# If query exists, filter results
if query:
    search_conditions = (
        Q(first_name__icontains=query)
        | Q(last_name__icontains=query)
        | Q(middle_name__icontains=query)
        | Q(mobile_numbers__mobile_number__icontains=query)
        | Q(emails__email__icontains=query)
    )
    leads = leads.filter(search_conditions).distinct()

# Always apply prefetch + ordering
leads = leads.prefetch_related(
    "mobile_numbers",
    "emails",
).order_by("first_name", "last_name")

# Pagination: 5 per page
per_page = 5
paginator = Paginator(leads, per_page)
page_obj = paginator.get_page(request.GET.get("page", 1))

context = {
    "leads": page_obj.object_list,
    "page_obj": page_obj,
    "paginator": paginator,
    "query": query,
}
return render(request, "leads/partials/search_results_table.html", context)
```

**Key Changes**:

1. Parameter name: `q` instead of `leadSearch`
2. No blank guard - return ALL leads when query is empty
3. Pagination always applied
4. Pass `query` to context for pagination links

---

### Phase 2: Create Search Results Table Template

**New File**: `templates/leads/partials/search_results_table.html`

```html
<div class="table-responsive">
  <table class="table table-striped table-hover mb-0" id="lead-select-table">
    <thead class="thead-light">
      <tr>
        <th class="pt-2"><i class="feather icon-user"></i> Name</th>
        <th class="pt-2"><i class="feather icon-phone"></i> Mobile</th>
        <th class="pt-2"><i class="feather icon-mail"></i> Email</th>
        <th class="pt-2">Select</th>
      </tr>
    </thead>
    <tbody>
      {% for lead in leads %}
      <tr
        class="lead-row"
        data-lead-id="{{ lead.pk }}"
        data-lead-name="{{ lead.full_name }}"
        data-lead-mobile="{% firstof lead.mobile_numbers.first.mobile_number 'N/A' %}"
        data-lead-email="{% firstof lead.emails.first.email 'N/A' %}"
      >
        <td>{{ lead.full_name }}</td>
        <td>
          {% if lead.mobile_numbers.first %} {{
          lead.mobile_numbers.first.mobile_number }} {% else %}
          <span class="text-muted">N/A</span>
          {% endif %}
        </td>
        <td>
          {% if lead.emails.first %} {{ lead.emails.first.email }} {% else %}
          <span class="text-muted">N/A</span>
          {% endif %}
        </td>
        <td>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            onclick="selectLeadFromTable(this, event)"
          >
            <i class="feather icon-check-circle"></i> Select
          </button>
        </td>
      </tr>
      {% empty %}
      <tr>
        <td colspan="4" class="text-center py-3">
          {% if query %} No leads found matching "{{ query }}" {% else %} No
          leads available {% endif %}
        </td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
</div>

{# Pagination - only if more than 1 page #} {% if paginator.num_pages > 1 %}
<nav aria-label="Lead search pagination" class="mt-2">
  <ul class="pagination justify-content-center mb-0">
    {% if page_obj.has_previous %}
    <li class="page-item">
      <button
        class="page-link"
        hx-get="{% url 'search-lead' slug=request.organization.slug %}?q={{ query|urlencode }}&page={{ page_obj.previous_page_number }}"
        hx-target="#leadTableContainer"
      >
        <i class="feather icon-chevron-left"></i> Previous
      </button>
    </li>
    {% else %}
    <li class="page-item disabled">
      <span class="page-link"
        ><i class="feather icon-chevron-left"></i> Previous</span
      >
    </li>
    {% endif %} {% for i in paginator.page_range %} {% if page_obj.number == i
    %}
    <li class="page-item active"><span class="page-link">{{ i }}</span></li>
    {% else %}
    <li class="page-item">
      <button
        class="page-link"
        hx-get="{% url 'search-lead' slug=request.organization.slug %}?q={{ query|urlencode }}&page={{ i }}"
        hx-target="#leadTableContainer"
      >
        {{ i }}
      </button>
    </li>
    {% endif %} {% endfor %} {% if page_obj.has_next %}
    <li class="page-item">
      <button
        class="page-link"
        hx-get="{% url 'search-lead' slug=request.organization.slug %}?q={{ query|urlencode }}&page={{ page_obj.next_page_number }}"
        hx-target="#leadTableContainer"
      >
        Next <i class="feather icon-chevron-right"></i>
      </button>
    </li>
    {% else %}
    <li class="page-item disabled">
      <span class="page-link"
        >Next <i class="feather icon-chevron-right"></i
      ></span>
    </li>
    {% endif %}
  </ul>
</nav>
{% endif %} {# Show create lead button when no results #} {% if not leads and
query %}
<div class="text-center mt-2">
  <button
    class="btn btn-outline-primary btn-sm"
    hx-get="{% url 'hx-quick-create-lead' slug=request.organization.slug %}"
    hx-target="#modal-form"
  >
    <i class="feather icon-plus"></i> Create New Lead
  </button>
</div>
{% endif %}
```

**Key Features**:

- Table always rendered (not conditional on `leads`)
- Each `<tr>` has data attributes for popover content
- Pagination targets `#leadTableContainer` (same as search input)
- "Create New Lead" button appears only when search returns no results
- `query|urlencode` for proper URL encoding

---

### Phase 3: Update Membership Sale Form Template

**File**: `templates/accounting/partials/membership_sale_form.html`

**Section 1 Changes**:

```html
{# SECTION 1: LEAD SELECTION #}
<div class="card mb-3">
  <div class="card-header">
    <h5 class="mb-0">
      <i class="feather icon-user-check me-2"></i>1. Select Lead
    </h5>
  </div>
  <div class="card-body">
    {# Hidden input - preserve value on HTMX re-render #}
    <input
      type="hidden"
      name="lead"
      id="id_lead"
      value="{{ selected_lead.pk|default:'' }}"
    />

    {# Search input - filters table in place #}
    <div class="mb-3">
      <input
        type="text"
        id="leadSearch"
        class="form-control"
        placeholder="Search lead by name or phone..."
        hx-get="{% url 'search-lead' slug=request.organization.slug %}"
        hx-trigger="input delay:400ms"
        hx-target="#leadTableContainer"
        name="q"
        autocomplete="off"
      />
    </div>

    {# Pre-existing table container - loads all leads via HTMX on page load #}
    <div
      id="leadTableContainer"
      hx-get="{% url 'search-lead' slug=request.organization.slug %}"
      hx-trigger="load"
      hx-swap="innerHTML"
    >
      <p class="text-muted small text-center py-3">Loading leads...</p>
    </div>

    {# Selected lead card (shown after selection) #}
    <div id="leadSelection">
      {% if selected_lead %}
      <div class="card border-info mb-2">
        <div
          class="card-header bg-info text-white d-flex justify-content-between align-items-center py-2 px-3"
        >
          <h6 class="mb-0 text-white fw-normal">
            <i class="feather icon-user me-2"></i>{{ selected_lead.full_name }}
          </h6>
          <button
            type="button"
            class="btn btn-xs btn-outline-light border-0 p-1"
            onclick="removeSelectedLead()"
            title="Remove"
          >
            <i class="feather icon-x"></i>
          </button>
        </div>
        <div class="card-body p-3">
          <div class="row g-2 text-center">
            <div class="col-6">
              <div class="text-muted small">
                <i class="feather icon-phone me-1"></i>Contact
              </div>
              <div class="fw-bold">
                {{ selected_lead.mobile_numbers.first|default:"N/A" }}
              </div>
            </div>
            <div class="col-6">
              <div class="text-muted small">
                <i class="feather icon-mail me-1"></i>Email
              </div>
              <div class="fw-bold text-truncate">
                {{ selected_lead.emails.first|default:"N/A" }}
              </div>
            </div>
          </div>
        </div>
      </div>
      {% endif %}
    </div>

    {% if form.lead.errors %}
    <div class="text-danger small mt-1">{{ form.lead.errors.0 }}</div>
    {% endif %}
  </div>
</div>
```

**Key Changes**:

1. Header icon: `<i class="feather icon-user-check me-2"></i>`
2. Search `hx-target="#leadTableContainer"` (table container, not separate div)
3. Change `hx-trigger` to `input delay:400ms` (better for clear detection)
4. Remove `hx-include` (pointless for GET)
5. Add `#leadTableContainer` with initial table loaded via `{% include %}`

---

### Phase 4: JavaScript - Popover + Selection

**File**: `templates/accounting/partials/membership_sale_form.html`

**Add to `initForm()` function**:

```javascript
// Initialize popovers for lead table rows
function initLeadTablePopovers() {
  $("#lead-select-table .lead-row").popover({
    title: function () {
      return $(this).data("lead-name");
    },
    content: function () {
      const mobile = $(this).data("lead-mobile");
      const email = $(this).data("lead-email");
      return (
        '<i class="feather icon-phone"></i> ' +
        mobile +
        "<br>" +
        '<i class="feather icon-mail"></i> ' +
        email
      );
    },
    html: true,
    trigger: "click hover",
    placement: "right",
    container: "body",
  });
}

// New function: select lead from table button
function selectLeadFromTable(btn, event) {
  // Prevent click from bubbling to <tr> and triggering popover
  event.stopPropagation();

  const row = $(btn).closest(".lead-row");
  const leadId = row.data("lead-id");
  const leadName = row.data("lead-name");
  const mobile = row.data("lead-mobile");
  const email = row.data("lead-email");

  // Set hidden input
  document.getElementById("id_lead").value = leadId;

  // Show selected lead card
  document.getElementById("leadSelection").innerHTML = selectedLeadCard(
    leadName,
    leadId,
    [mobile],
    [email],
  );

  // Close any open popovers
  $(".lead-row").popover("hide");
}
```

**Update `initForm()`** to call popover init:

```javascript
function initForm() {
  // ... existing code ...

  // Initialize lead table popovers
  initLeadTablePopovers();
}
```

**Call `initForm()` after HTMX swap** (already exists via `htmx:afterSwap` event).

---

## File Changes Summary

| File                                            | Action | Description                                                   |
| ----------------------------------------------- | ------ | ------------------------------------------------------------- |
| `leads/views.py`                                | Modify | Fix param to `q`, return all leads when blank, add pagination |
| `leads/partials/search_results_table.html`      | Create | Table with popover data attrs, pagination, select button      |
| `accounting/partials/membership_sale_form.html` | Modify | Add table container, fix hx-trigger, add header icon, add JS  |

---

## Testing Checklist

- [ ] Page loads with all leads (paginated, 5 per page)
- [ ] Typing in search filters table results
- [ ] Clearing search shows all leads again
- [ ] Pagination works (Next/Previous/Page numbers)
- [ ] Pagination preserves search query (`?q=john&page=2`)
- [ ] Clicking row shows popover with name, phone, email
- [ ] Clicking "Select" button:
  - Sets hidden input with lead pk
  - Shows selected lead card
  - Hides popover
- [ ] "Create New Lead" appears when search returns no results
- [ ] After creating lead, it's auto-selected in form
- [ ] Popover re-initializes after HTMX pagination swap

---

## Dependencies

- Django Paginator (already available)
- Feather icons (already in use)
- Bootstrap 4.6 popover (already available)
- HTMX (already in use)
- URL `search-lead` exists in `leads/urls.py`
- URL `hx-quick-create-lead` exists in `leads/urls.py`

---

## Senior Review Notes

| Issue                      | Resolution                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pk` vs `uuid`             | Confirmed: LeadMaster.pk is UUID field. Use `lead.pk`.                                                                  |
| Pagination URL             | Use `{{ query\|urlencode }}` passed from view context                                                                   |
| hx-trigger                 | Use `input delay:400ms` (better than `keyup changed`)                                                                   |
| Modal target               | Use `#modal-form` (standard pattern)                                                                                    |
| Popover trigger            | Use `click hover` (Bootstrap 4.6 syntax)                                                                                |
| Table vs dropdown          | Pre-existing table that filters in place (not dropdown)                                                                 |
| Selection method           | Select button only (not row click)                                                                                      |
| Tooltip content            | Simple: name, one phone, one email (Option A)                                                                           |
| Pagination target          | Use `#leadTableContainer` (not `#leadTableBody`) - same as search                                                       |
| Initial table load         | Use `hx-trigger="load"` on container (Option A) - fires search view with no q param                                     |
| Popover re-init            | Works via `htmx:afterSwap` calling `initForm()` which calls `initLeadTablePopovers()`                                   |
| Popover vs Select conflict | Button click triggers both select and popover. Fix: pass `event` in onclick, call `event.stopPropagation()` in function |
