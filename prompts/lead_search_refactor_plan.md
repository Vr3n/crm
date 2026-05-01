# Lead Search Refactor Plan: Table with Pagination & Working Search

## Overview

Refactor the lead search functionality in the Membership Sale Create form. Replace the broken card-based search dropdown with a proper paginated table that supports reliable search with icons and headers.

## Current Issues Identified

| Issue              | Location                                                    | Impact                                    |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------- |
| Parameter mismatch | Template: `name="q"`, View: `request.GET.get("leadSearch")` | Search doesn't work - query never matches |
| No pagination      | View returns all results                                    | Performance degrades with many leads      |
| HTMX trigger issue | Template uses `keyup changed delay:400ms`                   | Search may not re-trigger after clear     |
| hx-include wrong   | Template includes hidden lead PK in search                  | Pointless but harmless                    |
| Wrong modal target | Uses `#modal-form` inconsistent with pattern                | Should verify correct target              |

## Codebase Analysis Summary

### Existing Patterns (to follow)

1. **Pagination Pattern**: Django Paginator used in `accounting/views.py` (line 57), template at `accounting/tables/receipts_table.html`
2. **Table Pattern**: `leads/tables/leads.html` - Bootstrap table with actions
3. **HTMX Pattern**: `hx-get`, `hx-target`, `hx-trigger="keyup changed delay:400ms"`
4. **Icon Pattern**: Feather icons via `{% load static %}`, e.g., `<i class="feather icon-user"></i>`
5. **Quick Create Pattern**: `hx_quick_create_lead` view triggers `lead_create_success` event

### Models Involved

- `LeadMaster`: Uses `uuid` as primary key (inherited from `BaseModel` in `utils/models.py`). `pk` and `uuid` are the same field.
- Related: `mobile_numbers` (LeadMobileNumberMaster), `emails` (LeadEmailAddressMaster)
- Full name via `@property full_name`

### Key Finding: LeadMaster Primary Key

- `BaseModel` defines: `uuid = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`
- Therefore `LeadMaster.pk` IS the `uuid` field
- Template should use `lead.pk` (or `lead.uuid`) - both are the same

---

## Implementation Plan

### Phase 1: Backend - Update Search View

**File**: `crown_crm/leads/views.py`

**Changes to `search_results_view`** (lines 35-92):

1. **Fix parameter name**: Use `q` instead of `leadSearch` (matches template)
2. **Add blank query guard**: Return empty `HttpResponse("")` when query is blank (NOT all leads)
3. **Add pagination**: 5 leads per page
4. **Add page parameter**: Support `?page=N` for pagination
5. **Return proper context**: Include `page_obj`, `paginator`, and `query`

```python
# Expected changes:
query = request.GET.get("q", "").strip()  # Changed from "leadSearch"

# BLANK QUERY: Return empty response (NOT all leads)
if not query:
    return HttpResponse("")  # Clears results div

# ... existing filter logic ...

# PAGINATION: 5 per page
per_page = 5
paginator = Paginator(leads, per_page)
page_obj = paginator.get_page(page)

context = {
    "leads": page_obj.object_list,
    "page_obj": page_obj,
    "paginator": paginator,
    "query": query,  # ← IMPORTANT: pass to template for pagination links
}
```

**Key**: Do NOT return all leads when query is empty - that's a performance and UX problem.

### Phase 2: Create Search Results Table Template

**New File**: `templates/leads/partials/search_results_table.html`

Replace card-based `search_results.html` with table format:

| Column | Header with Icon | Content                       |
| ------ | ---------------- | ----------------------------- |
| Name   | 👤 Name          | `lead.full_name`              |
| Mobile | 📱 Mobile        | First mobile number or "N/A"  |
| Email  | ✉️ Email         | First email or "N/A"          |
| Action | Select           | Button to call `selectLead()` |

**Features**:

- Striped table with hover effect
- Button only for selection (NOT row click) - simpler, less ambiguity
- Pagination controls at bottom (Previous/1/2/Next)
- "No leads found" state with "+ Create New Lead" button
- **Critical**: Pagination links embed `q` in URL using `request.GET.q`

**Pagination Link Pattern** (must embed search query from context):

```html
{% if page_obj.has_previous %}
<button
  hx-get="{% url 'search-lead' slug=request.organization.slug %}?q={{ query|urlencode }}&page={{ page_obj.previous_page_number }}"
  hx-target="#leadSearchResults"
  class="btn btn-sm btn-outline-secondary"
>
  Previous
</button>
{% endif %}
```

**Note**: 
- Use `{{ query|urlencode }}` - the `urlencode` filter is critical for queries with spaces/special chars
- Do NOT use `request.GET.q` - it doesn't work in Django templates
- Do NOT use `hx-include` on pagination buttons - embed `q` directly in the URL
- **Django version verified**: 5.0.12 (pyproject.toml line 13) - `urlencode` filter works correctly

### Phase 3: Update Membership Sale Form Template

**File**: `templates/accounting/partials/membership_sale_form.html`

**Section 1 Changes** (lines 10-63):

1. **Fix search input parameter** - ensure `name="q"` matches view
2. **Fix hx-trigger**: Change `keyup changed delay:400ms` to `input delay:400ms`
   - `input` fires on every change including paste, cut, and clear via × button
3. **Remove hx-include**: The `hx-include="[name='lead']"` is pointless for GET requests
4. **Update results container** - replace `#leadSearchResults` with table partial
5. **Add icon to header**:
   ```html
   <div class="card-header">
     <h5 class="mb-0">
       <i class="feather icon-user-check me-2"></i>1. Select Lead
     </h5>
   </div>
   ```
6. **Ensure selectLead function uses `lead.pk`** - since LeadMaster.pk is UUID, both pk and uuid work

### Phase 4: Fix JavaScript

**File**: `templates/accounting/partials/membership_sale_form.html`

**Changes to `selectLead` function** (around line 340):

```javascript
function selectLead(card) {
  // Fix: use pk instead of uuid
  const leadId = card.dataset.leadId; // Should be pk not uuid
  // ... rest of function
}
```

**Verify event handling**:

- Ensure `initForm()` re-attaches listeners after HTMX swap
- The `htmx:afterSwap` listener should handle re-trigger

### Phase 5: Add Create Lead Button

In the search results table:

```html
{% if not leads %}
<div class="text-center py-3">
  <p class="text-muted mb-2">No leads found matching your search.</p>
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

**Note**: Use `hx-target="#modal-form"` - this is the standard pattern used throughout the codebase (see `base.html` line 205).

---

## File Changes Summary

| File                                            | Action | Description                                         |
| ----------------------------------------------- | ------ | --------------------------------------------------- |
| `leads/views.py`                                | Modify | Fix param name `q`, add blank guard, add pagination |
| `leads/partials/search_results_table.html`      | Create | New table template with pagination                  |
| `leads/partials/search_results.html`            | Keep   | May still be used for other purposes                |
| `accounting/partials/membership_sale_form.html` | Modify | Fix hx-trigger to `input`, remove hx-include        |

---

## Senior Review Fixes Applied

| Issue                       | Fix Applied                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| `pk` vs `uuid` ambiguity    | Confirmed: LeadMaster.pk IS the uuid field (inherited from BaseModel). Use `lead.pk` consistently. |
| Pagination URL              | Pagination links embed `q` using `{{ query                                                         | urlencode }}` from view context |
| hx-include on pagination    | Removed - put query in URL instead                                                                 |
| Blank query response        | View returns `HttpResponse("")` when `q` is empty                                                  |
| hx-trigger                  | Changed `keyup changed` to `input` for better clear detection                                      |
| Modal target                | Use `#modal-form` (standard pattern in codebase)                                                   |
| Row + button both clickable | Button only - simpler, less ambiguity                                                              |

---

## Testing Checklist

- [ ] Search for "john" returns correct results
- [ ] Clear search input and type new query works (second search) - `input` trigger fixes this
- [ ] Pagination shows 5 leads per page
- [ ] Pagination preserves search query: `?q=john&page=2`
- [ ] Clicking Next loads next page of results
- [ ] Clicking select button selects lead
- [ ] Selected lead shows in leadSelection div
- [ ] "+ Create New Lead" opens modal
- [ ] After creating lead, it's auto-selected in form

---

## Dependencies

- `django.core.paginator.Paginator` (need to import in leads/views.py)
- Feather icons (already in use)
- HTMX (already in use)
- URL `hx-quick-create-lead` exists in `leads/urls.py` line 11

---

## Reference: Existing Pagination Template

See `templates/accounting/tables/receipts_table.html` lines 51-94 for HTMX pagination pattern.
