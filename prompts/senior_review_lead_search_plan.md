The plan is solid. Here are the issues to fix before implementing.

---

## Issues to Fix

### 1. `LeadMaster.pk` is a UUID, not an integer — the plan is inconsistent about this

The plan says "use `pk` instead of `uuid`" in Phase 4, but also says "Lead ID type: Use `pk` (UUID)". These aren't contradictory — `pk` and `uuid` are the same field if `pk` is the UUID primary key. But the existing JS `selectLead()` and the view's `LeadMaster.objects.filter(pk=lead_id, ...)` both expect a UUID string. The junior dev needs to confirm one thing: is `LeadMaster.pk` actually a UUID field, or is there a separate `uuid` field alongside an integer `pk`?

Check the model. If `LeadMaster` has both `id` (auto int) and `uuid` (UUID field), then using `pk` in `data-lead-id` and `filter(pk=lead_id)` would use the integer ID — which is correct for the Django ORM but may differ from what the existing JS was passing. The template must be consistent: whatever value is put in `data-lead-id` must match what the view's `filter()` uses. Don't change one without the other.

### 2. Pagination must preserve the search query in HTMX requests — the plan notes this but doesn't show how

The plan says "YES" to preserving `?q=john&page=2` but the implementation sketch only shows `?page=N`. With HTMX pagination, each page button needs to include both `q` and `page`. The correct pattern for the pagination controls is:

```html
{% if page_obj.has_previous %}
<button
  hx-get="{% url 'search-lead' slug=request.organization.slug %}?q={{ request.GET.q }}&page={{ page_obj.previous_page_number }}"
  hx-target="#leadSearchResults"
  class="btn btn-sm btn-outline-secondary"
>
  Previous
</button>
{% endif %}
```

Note `request.GET.q` — this works in Django templates since `request.GET` is a QueryDict and you can access it like a dict. Do not use a hardcoded value or JavaScript to build the URL.

### 3. The search input's `hx-include` is wrong in the existing form

The current template has `hx-include="[name='lead']"` on the search input. That includes the hidden lead PK in the search GET request, which is harmless but pointless. More importantly, pagination buttons also need `hx-include` — or better, they should just embed `q` directly in the `hx-get` URL as shown above. Do not use `hx-include` on pagination buttons, it adds complexity for no benefit.

### 4. The search view should return an empty response when the query is blank, not a list of recent leads

The plan says "show prompt to search" when no query is given. This means the view should return an empty HTTP 200 with no content (or a minimal "type to search" message) when `q` is blank. Do not return all leads when `q` is empty — that's a performance and UX problem. The correct view guard:

```python
query = request.GET.get("q", "").strip()
if not query:
    return HttpResponse("")  # clears the results div
```

### 5. `hx-trigger="keyup changed delay:400ms"` has a subtle issue on clear

When the user clears the search input completely, `keyup` fires but `changed` may not if the value was already empty. The safer trigger for a search input is:

```html
hx-trigger="input delay:400ms"
```

`input` fires on every change including paste, cut, and clear via the × button on mobile. Replace `keyup changed` with `input` throughout.

### 6. The "Create New Lead" button target is wrong

The plan shows `hx-target="#modal-form"` but the existing codebase uses `#modal-container` (seen in the JS: `document.getElementById('modal-container')`). Use `#modal-container` to match the existing pattern. Also verify the URL name `hx-quick-create-lead` exists in `urls.py` before using it.

### 7. Row click vs button click — pick one, not both

The plan says "Click row or button to select." Having both creates confusion about which element has `onclick="selectLead(this)"`. If the row is clickable, the button inside it is also clickable, causing potential double-firing. Pick the row as the clickable element and pass `this` from the `<tr>` tag, putting all data attributes on `<tr>`. Remove the separate button column. Or keep the button and make the row non-clickable. The simpler, less error-prone approach is the button only — one clear affordance, no cursor/click ambiguity on the row.

---

## Summary of Changes to the Plan

| Issue                       | Fix                                                                         |
| --------------------------- | --------------------------------------------------------------------------- |
| `pk` vs `uuid` ambiguity    | Verify `LeadMaster` primary key type; use consistently in template and view |
| Pagination URL construction | Embed `q` in `hx-get` URL directly using `request.GET.q`                    |
| `hx-include` on pagination  | Don't use it; put `q` in the URL instead                                    |
| Blank query response        | Return `HttpResponse("")` when `q` is empty                                 |
| `hx-trigger`                | Change `keyup changed` to `input`                                           |
| Modal target                | Use `#modal-container` not `#modal-form`                                    |
| Row + button both clickable | Pick one; recommend button only                                             |
