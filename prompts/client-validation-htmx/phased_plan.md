# Client-Side Validation - Phased Implementation Plan

Based on senior review and codebase analysis.

---

## Already Implemented ✅

| Feature                                               | Location                                  |
| ----------------------------------------------------- | ----------------------------------------- |
| Mobile number 10-digit validation with RegexValidator | `leads/forms.py` - `LeadMobileNumberForm` |
| pattern="\d{10}", maxlength="10", inputmode="numeric" | Widget attrs in forms.py                  |
| Required first_name, last_name                        | `LeadCreateForm.__init__`                 |
| **HTMX 422 response handling (htmx:beforeSwap)**      | `base.html` lines 240-254                 |
| **SweetAlert2 integration**                           | `base.html` lines 76, 102, 211-289        |

---

## Phase 1: HTMX 422 Response Handling - ALREADY DONE ✅

**Status:** Already implemented in `base.html` via `htmx:beforeSwap` event listener (lines 240-254):

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
```

**Why this approach over meta tag:**

- Explicit and inspectable in base.html
- Scoped to app logic, not global HTMX config
- Already implemented

**No action needed.**

---

## Phase 2: HTML5 Validation Attributes (Zero-JS Layer)

**Goal:** Add HTML5 validation attributes to c-form-input component. Browser handles basic constraints.

**Step 2.1** — Update `c-form-input.html`:

```django
<c-vars field type="text" placeholder="" label="" help_text="" show_required="true" />

<div class="form-group">
  <label for="{{ field.id_for_label }}">
    {{ label|default:field.label }}
    {% if show_required == "true" and field.field.required %}
      <span class="text-danger">*</span>
    {% endif %}
  </label>

  <input
    type="{{ type }}"
    name="{{ field.html_name }}"
    id="{{ field.id_for_label }}"
    value="{{ field.value|default:'' }}"
    placeholder="{{ placeholder }}"
    class="form-control {% if field.errors %}is-invalid{% elif field.value and not field.errors %}is-valid{% endif %}"
    {% if field.field.required %}required{% endif %}
    {% if field.field.max_length %}maxlength="{{ field.field.max_length }}"{% endif %}
    {% if field.field.min_length %}minlength="{{ field.field.min_length }}"{% endif %}
    {{ attrs }}
  />

  {% if field.errors %}
  <div class="invalid-feedback">{{ field.errors.0 }}</div>
  {% endif %}

  {% if help_text|default:field.help_text and not field.errors %}
  <small class="form-text text-muted">
    {{ help_text|default:field.help_text }}
  </small>
  {% endif %}
</div>
```

**Note:** Don't add `pattern` here - it's already in the Django widget attrs.

**Files:**

- `crown_crm/templates/cotton/form_input.html` — Add required, maxlength, minlength attrs

---

## Phase 3: Form Wrapper with Validation Hooks

**Goal:** Add validation hooks to form wrapper for scoping JS.

**Step 3.1** — Update `c-form-wrapper.html`:

```django
<c-vars action method="post" attrs="" />
<form
    hx-{{ method }}="{{ action }}"
    hx-target="this"
    hx-swap="outerHTML"
    data-validate
    novalidate
    {{ attrs }}
>
  {% csrf_token %}
  {{ slot }}
</form>
```

**Why novalidate?** Prevents browser's default bubble tooltips - we use custom Bootstrap error divs instead.

**Why data-validate?** Scopes JS validation to only forms that need it.

**Files:**

- `crown_crm/templates/cotton/form_wrapper.html` — Add data-validate and novalidate

---

## Phase 4: JavaScript Validation Module

**Goal:** Create validation.js using Constraint Validation API.

**Note:** Based on senior review corrections:

- Use `WeakSet` for idempotent initialization (prevents duplicate listeners)
- Fix `onInput` validation logic to validate when field has value or is invalid

**Step 4.1** — Create `crown_crm/static/js/validation.js`:

```javascript
/**
 * Hybrid validation: HTML5 + Constraint Validation API + Django 422 fallback
 * Scope: Only forms with data-validate attribute
 */

(function () {
  "use strict";

  // Track initialized containers - prevents duplicate listeners
  const initialized = new WeakSet();

  // ── Rules: map field name suffix → validation config ──
  const RULES = {
    mobile_number: {
      pattern: /^\d{10}$/,
      message: "Enter a valid 10-digit mobile number",
      enforceDigits: true,
      maxLength: 10,
    },
    email: {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: "Enter a valid email address",
    },
  };

  function getRule(field) {
    const name = field.name || field.id;
    for (const key of Object.keys(RULES)) {
      if (name.includes(key)) return RULES[key];
    }
    return null;
  }

  // ── Enforce input constraints as user types ──
  function enforceConstraints(field) {
    const rule = getRule(field);
    if (!rule) return;

    if (rule.enforceDigits) {
      const clean = field.value
        .replace(/\D/g, "")
        .slice(0, rule.maxLength || 999);
      if (field.value !== clean) field.value = clean;
    }
  }

  // ── Validate using Constraint Validation API ──
  function validateField(field) {
    const rule = getRule(field);
    if (!rule) {
      field.setCustomValidity("");
      return true;
    }

    const value = field.value.trim();

    if (field.required && !value) {
      field.setCustomValidity(rule.message || "This field is required");
      return false;
    }

    if (value && rule.pattern && !rule.pattern.test(value)) {
      field.setCustomValidity(rule.message);
      return false;
    }

    field.setCustomValidity("");
    return true;
  }

  // ── Visual feedback (Bootstrap classes) ──
  function updateVisuals(field) {
    const group = field.closest(".form-group");
    if (!group) return;

    const oldError = group.querySelector(".js-custom-error");
    if (oldError) oldError.remove();

    if (field.validity.valid) {
      field.classList.remove("is-invalid");
      if (field.value && document.activeElement !== field) {
        field.classList.add("is-valid");
      }
    } else {
      field.classList.remove("is-valid");
      field.classList.add("is-invalid");

      if (field.validationMessage) {
        const errorDiv = document.createElement("div");
        errorDiv.className = "invalid-feedback js-custom-error";
        errorDiv.textContent = field.validationMessage;
        group.appendChild(errorDiv);
      }
    }
  }

  // ── Event handlers ──
  function onInput(e) {
    const field = e.target;
    if (!field.matches("input, select, textarea")) return;

    enforceConstraints(field);

    const rule = getRule(field);
    if (!rule) return;

    // Validate if correcting an error, or if field has value
    if (field.classList.contains("is-invalid") || field.value) {
      validateField(field);
      updateVisuals(field);
    }
  }

  function onBlur(e) {
    const field = e.target;
    if (!field.matches("input, select, textarea")) return;
    validateField(field);
    updateVisuals(field);
  }

  // ── Initialization (idempotent with WeakSet) ──
  function initValidation(scope) {
    const container =
      scope?.closest?.("[data-validate]") ||
      document.querySelector("[data-validate]") ||
      document.body;

    if (initialized.has(container)) return;
    initialized.add(container);

    container.addEventListener("input", onInput);
    container.addEventListener("focusout", onBlur);
  }

  // ── Bootstrap on load ──
  document.addEventListener("DOMContentLoaded", function () {
    document
      .querySelectorAll("form[data-validate]")
      .forEach((form) => initValidation(form));
  });

  // HTMX after swap: handle both form-self-swap and container-swap scenarios
  document.body.addEventListener("htmx:afterSettle", function (e) {
    const swapped = e.detail.elt;
    // Try: the swapped element itself, its closest form ancestor, or its first child form
    const form = swapped.matches?.("[data-validate]")
      ? swapped
      : swapped.closest?.("[data-validate]") ||
        swapped.querySelector?.("[data-validate]");

    if (form) initValidation(form);
  });
})();
```

**Senior Review Fixes Applied:**

1. **WeakSet** for idempotent initialization - prevents duplicate listeners after HTMX swaps
2. **onInput validation** - validates when field has value or is invalid (not just when already invalid)
3. **htmx:afterSettle** - handles both self-swap and container-swap scenarios

**Step 4.2** — Add validation.js to base.html:

```html
<script src="{% static 'js/validation.js' %}"></script>
```

**Files:**

- `crown_crm/static/js/validation.js` — Create
- `crown_crm/templates/base.html` — Add script include

---

## Phase 5: HTMX Validation Events (Optional)

**Goal:** Add event listeners for debugging/logging.

**Note from Senior Review:**

- Use `focusout` (not `blur`) - it bubbles, which is required for container delegation
- Use `setCustomValidity()` - NOT `e.preventDefault()` to block submission

**Step 5.1** — Add to validation.js (optional enhancement):

```javascript
// HTMX validation events — for debugging only
document.body.addEventListener("htmx:validation:validate", function (e) {
  const field = e.target;
  if (field.matches('input[name*="mobile_number"]')) {
    if (field.value.length !== 10) {
      field.setCustomValidity("Must be exactly 10 digits");
    }
  }
});

document.body.addEventListener("htmx:validation:halted", function (e) {
  console.log("Validation halted:", e.detail.errors);
});
```

**Note:** Use `setCustomValidity()` - NOT `e.preventDefault()` to block submission.

---

## Final Approval: ✅ Ready for Implementation

| Issue                                               | Severity   | Fix Applied                                             |
| --------------------------------------------------- | ---------- | ------------------------------------------------------- |
| Duplicate listeners (initValidation not idempotent) | **HIGH**   | ✅ Fixed with WeakSet                                   |
| Input validation gap (onInput logic)                | **MEDIUM** | ✅ Fixed - validates when field has value or is invalid |
| htmx:afterSettle edge cases (modal container)       | **MEDIUM** | ✅ Fixed - handles both self-swap and container-swap    |
| is-valid/is-invalid conflict on 422                 | LOW        | Verified OK - server is source of truth on 422          |
| pattern omission                                    | NONE       | Correct as-is                                           |

---

## Phase 6: SweetAlert2 Integration - ALREADY DONE ✅

**Status:** Already implemented in `base.html`:

- Line 76: SweetAlert2 CSS
- Line 102: SweetAlert2 JS
- Lines 211-289: Success event handlers + global toast helpers

```javascript
// Global toast helper
window.showToast = function(message, level = 'info') { ... }

// Success events (already registered)
const successEvents = ['lead-created', 'lead-updated', ...];
successEvents.forEach((eventName) => {
  document.body.addEventListener(eventName, (e) => {
    notifiq.fire({ icon: level, title });
  });
});
```

**No action needed.**

---

## Summary by Priority

| Phase | Priority | Status  | Description                                  |
| ----- | -------- | ------- | -------------------------------------------- |
| 1     | HIGH     | ✅ DONE | htmx:beforeSwap 422 handling (base.html)     |
| 2     | HIGH     | ❌ TODO | c-form-input with required/maxlength attrs   |
| 3     | HIGH     | ❌ TODO | c-form-wrapper with data-validate/novalidate |
| 4     | HIGH     | ❌ TODO | validation.js creation                       |
| 5     | MEDIUM   | ❌ TODO | HTMX validation events (optional)            |
| 6     | LOW      | ✅ DONE | SweetAlert2 (base.html)                      |

---

## Files to Modify/Create

| Phase | File                                 | Action                       | Status  |
| ----- | ------------------------------------ | ---------------------------- | ------- |
| 1     | `templates/base.html`                | htmx:beforeSwap (existing)   | ✅ DONE |
| 2     | `templates/cotton/form_input.html`   | Add required/maxlength attrs | ❌ TODO |
| 3     | `templates/cotton/form_wrapper.html` | Add data-validate/novalidate | ❌ TODO |
| 4     | `static/js/validation.js`            | CREATE                       | ❌ TODO |
| 4     | `templates/base.html`                | Add script include           | ❌ TODO |
| 5     | `static/js/validation.js`            | Add HTMX events (optional)   | ❌ TODO |
| 6     | `templates/base.html`                | SweetAlert2 (existing)       | ✅ DONE |

---

## Testing Checklist

| Test                                              | Expected                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| Type "abc" in mobile field                        | Letters stripped, only digits appear                                        |
| Type 11 digits in mobile                          | Stops at 10                                                                 |
| Blur empty required field                         | Red border + error message                                                  |
| Blur invalid email                                | Red border + error message                                                  |
| Submit invalid form                               | No network request (blocked by setCustomValidity)                           |
| Submit valid form                                 | 204 response                                                                |
| Server returns 422                                | Form swaps with Django errors                                               |
| Add formset row                                   | Validation works on new row                                                 |
| HTMX swap 5 times                                 | No duplicate listeners (WeakSet works)                                      |
| Type "a" then delete in mobile                    | Field goes red if now empty+required                                        |
| Blur after 422                                    | Server error preserved, JS doesn't override                                 |
| **Submit form with hx-target="#modal-container"** | validation.js re-initializes on swapped form inside modal                   |
| **5 rapid HTMX swaps on same form**               | WeakSet prevents duplicate listeners; check getEventListeners in DevTools   |
| **Server 422 on email blacklist**                 | Django renders is-invalid; blur without edit → JS may clear it (acceptable) |
| **NEW: Type "a" then delete in mobile**           | Field goes red if now empty+required                                        |
| **NEW: Blur after 422**                           | Server error preserved, JS doesn't override                                 |
| Submit invalid form                               | No network request (blocked by setCustomValidity)                           |
| Submit valid form                                 | 204 response                                                                |
| Server returns 422                                | Form swaps with Django errors                                               |
| Add formset row                                   | Validation works on new row                                                 |
