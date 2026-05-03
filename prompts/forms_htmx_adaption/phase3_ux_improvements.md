# Phase 3: UX Improvements (P2)

This phase adds user experience improvements using existing SweetAlert2 infrastructure.

## Key Finding: Existing Infrastructure

The project already has SweetAlert2 configured as `notifiq` in `base.html`. This phase reuses it rather than creating new toast functions.

---

## 3.1 Fix base.html HTMX Handlers

**File:** `crown_crm/templates/base.html` (lines 210-249)

### Issues Found

| #   | Issue                                                     | Fix                      |
| --- | --------------------------------------------------------- | ------------------------ |
| 1   | `htmx.on("lead_create_success", ...)` uses old event name | Change to `lead-created` |
| 2   | `e.detail.shouldswap = false` — typo (lowercase `s`)      | Change to `shouldSwap`   |
| 3   | `htmx:beforeSwap` for 422/400 not present                 | Add handler              |
| 4   | Modal close on 204 is fragile                             | Use event-based closure  |

### Implementation

Replace the modal script section (lines 210-249) with:

```javascript
// HTMX 2.0: Allow swapping on 422/400 validation errors
document.body.addEventListener("htmx:beforeSwap", function (evt) {
  const status = evt.detail.xhr.status;

  // Allow 422/400 responses to swap (form errors)
  if (status === 422 || status === 400) {
    evt.detail.shouldSwap = true;
    evt.detail.isError = false;
  }

  // Modal close on 204 (no content) - but only for modal target
  if (status === 204 && evt.detail.target.id === "modal-form") {
    $("#modal-container").modal("hide");
    evt.detail.shouldSwap = false;
  }
});

// Single notifiq instance for all toasts (reused by event handlers + window.showToast)
const notifiq = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 5000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.addEventListener("mouseenter", Swal.stopTimer);
    toast.addEventListener("mouseleave", Swal.resumeTimer);
  },
});

// Open modal when form loaded into modal-form
htmx.on("htmx:afterSwap", (e) => {
  if (e.detail.target.id === "modal-form") {
    $("#modal-container").modal({
      show: true,
      keyboard: false,
      backdrop: "static",
    });
  }
});

// Close modal and show toast on success events (kebab-case)
const successEvents = [
  "lead-created",
  "lead-updated",
  "lead-deleted",
  "membership-sale-created",
  "receipt-created",
  "receipt-updated",
  "receipt-deleted",
  "sale-updated",
  "sale-deleted",
  "service-created",
  "service-updated",
  "service-deleted",
  "product-created",
  "product-updated",
  "product-deleted",
  "client-created",
  "client-deleted",
  "organization-created",
  "organization-updated",
];

successEvents.forEach((eventName) => {
  document.body.addEventListener(eventName, (e) => {
    $("#modal-container").modal("hide");

    // Show toast - derive action from event name
    const action = eventName.split("-").pop(); // created/updated/deleted
    const level = action === "deleted" ? "info" : "success";
    const title = eventName
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());

    notifiq.fire({ icon: level, title });
  });
});

// Cleanup modal content after close
htmx.on("hidden.bs.modal", () => {
  document.getElementById("modal-form").innerHTML = "";
});

// Refresh feather icons after HTMX swaps
document.addEventListener("htmx:afterSwap", function (evt) {
  feather.replace();
});
```

---

## 3.2 Add window.showToast Helper

**File:** `crown_crm/templates/base.html` (add after existing message listener)

The existing code creates a new `notifiq` instance for every toast. Add a reusable helper using the global instance defined above:

```javascript
window.showToast = function (message, level = "info") {
  const iconMap = {
    debug: "info",
    info: "info",
    success: "success",
    warning: "warning",
    error: "error",
  };
  notifiq.fire({
    icon: iconMap[level] || "info",
    title: message,
  });
};
```

This replaces the repeated `notifiq` pattern in the message listener and makes it available for custom event handlers.

---

## 3.3 Simplify c-submit-button

**File:** `crown_crm/templates/cotton/submit_button.html`

Since SweetAlert2 handles toasts globally, the button should be simple:

```django-html
{% comment %}
c-submit-button: HTMX submit button with loading spinner

Uses htmx-indicator class for automatic show/hide during requests.
SweetAlert2 toasts are handled globally via window.showToast().

Args:
  label: Button text (default: "Save")
  variant: Bootstrap variant - primary, secondary, danger, success, warning, info (default: primary)
  size: Button size - sm, lg (optional)

Usage:
  <c-submit-button label="Create Lead" />
  <c-submit-button label="Delete" variant="danger" />
{% endcomment %}

<c-vars label="Save" variant="primary" size="" />

<button
  type="submit"
  class="btn btn-{{ variant }}{% if size %} btn-{{ size }}{% endif %}"
  {{ attrs }}
>
  <span class="htmx-indicator spinner-border spinner-border-sm mr-2" style="display:none;"></span>
  {{ label }}
</button>
```

Note: No `loading_text` swap - keep it simple. HTMX's indicator class handles the spinner.

---

## Files to Modify

| File                                            | Change                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `crown_crm/templates/base.html`                 | Replace modal script section, add 422 handler, use new event names |
| `crown_crm/templates/cotton/submit_button.html` | Simplify - no loading text swap                                    |

---

## Implementation Order

1. Update `base.html` modal script section
2. Add `window.showToast` helper
3. Create `crown_crm/templates/cotton/submit_button.html`

---

## Verification

| #   | Test                                | Expected Result                                      |
| --- | ----------------------------------- | ---------------------------------------------------- |
| 1   | Submit form with errors             | 422, form re-renders with `is-invalid`, **no toast** |
| 2   | Submit valid form                   | 204, modal closes, **toast appears**                 |
| 3   | Delete item                         | 204, row fades out, **toast appears**                |
| 4   | Direct browser hit to `/hx/create/` | 400, **toast shows error**                           |
| 5   | Click submit button                 | Spinner appears during request                       |

---

## Event Name Mapping (Pre-Phase 2 Reference)

| Old Event                     | New Event (kebab-case) |
| ----------------------------- | ---------------------- |
| `lead_create_success`         | `lead-created`         |
| `service_update_success`      | `service-updated`      |
| `product_update_success`      | `product-updated`      |
| `organization_update_success` | `organization-updated` |

These were updated in Phase 2. Phase 3 ensures the JS handlers use the new names.
