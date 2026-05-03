Three issues to fix before implementing.

---

### 1. Pagination `hx-target="#leadTableBody"` targets a nonexistent element

The pagination buttons target `#leadTableBody` but there is no element with that ID in the template. The table has `id="lead-select-table"` on the `<table>` and the container is `id="leadTableContainer"`. The pagination swap needs to replace the entire table+pagination block, not just a tbody.

The correct target for all pagination buttons is `#leadTableContainer` — the same target the search input uses. This way the full response (table + pagination controls) replaces the container consistently on both search and pagination.

---

### 2. Popovers will not re-initialize after HTMX pagination swap

`initLeadTablePopovers()` is called inside `initForm()`, which is called on `htmx:afterSwap`. However `htmx:afterSwap` fires for **any** HTMX swap on the page, including the membership sale form swap and the table pagination swap. The current guard is:

```javascript
document.body.addEventListener("htmx:afterSwap", function (evt) {
  if (document.getElementById("membershipSaleForm")) {
    initForm();
  }
});
```

This calls `initForm()` (and therefore `initLeadTablePopovers()`) only when `membershipSaleForm` exists — which it does after both form validation re-renders AND after pagination swaps. So popovers will re-initialize correctly on pagination. This is fine. No change needed here, just confirming the junior dev understands why it works.

However there is a real problem: `initLeadTablePopovers()` uses jQuery `$('#lead-select-table .lead-row').popover(...)`. After a pagination swap, HTMX replaces `#leadTableContainer` with new HTML. The old jQuery popover instances are attached to the old DOM nodes which are now gone. The new rows have no popover initialized. Calling `initLeadTablePopovers()` again attaches fresh popovers to the new nodes — this is correct **only if** you're not double-binding on nodes that already have popovers. Since the old nodes are removed from the DOM entirely, there's no double-binding risk. This is fine as written.

---

### 3. The initial table load on page render is missing context

The form partial does:

```html
<div id="leadTableContainer">
  {% include 'leads/partials/search_results_table.html' %}
</div>
```

But `search_results_table.html` uses `{{ leads }}`, `{{ page_obj }}`, `{{ paginator }}`, and `{{ query }}` — none of which are in the context when the form partial is first rendered. The form partial's view (`sale_create_view`) only passes `{"form": form}`.

Two options — pick one:

**Option A (recommended):** Load the initial table via a separate HTMX GET on page load rather than a Django `{% include %}`. Add `hx-trigger="load"` to the table container:

```html
<div
  id="leadTableContainer"
  hx-get="{% url 'search-lead' slug=request.organization.slug %}"
  hx-trigger="load"
  hx-swap="innerHTML"
>
  <p class="text-muted small">Loading leads...</p>
</div>
```

This fires the search view immediately on page load with no `q` parameter, returning all leads paginated. Clean separation — the form view doesn't need to fetch leads at all.

**Option B:** Pass `leads`, `page_obj`, `paginator`, `query` from `sale_create_view` by calling the Paginator there. More code in the view but avoids an extra HTTP request.

Option A is simpler and matches the HTMX pattern already established. Use it.

---

Those are the three real issues. Fix them and the plan is ready to implement.
