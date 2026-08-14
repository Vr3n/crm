# Phase 4: Edge Cases (P3 - Minor Fixes)

This phase fixes minor edge cases that could cause bugs in specific scenarios.

## 4.1 Fix c-form-select Comparison Logic

**File:** `crown_crm/templates/cotton/form_select.html`

**Problem:** Current code uses `field.value` for selected state comparison, which can fail for certain edge cases.

**Issue Details:**

```django-html
{% if field.value|stringformat:"s" == choice.0|stringformat:"s" %}selected{% endif %}
```

This works but has issues:

- `field.value` is the cleaned Python value (may be None, "", or actual value)
- `choice.0` is the raw option value
- Comparison between different types (None vs "") can fail silently

**Solution:** Use `field.data` (raw submitted data) instead of `field.value` (cleaned Python value). `field.data` handles `None` vs `""` correctly and matches the raw POST data.

### Implementation

```django-html
{% comment %}
c-form-select: Bootstrap 4 select dropdown with HTMX support

Args:
  field: The form field instance (required)
  label: Override label text (optional)
  choices: Override choices list (optional, defaults to field.field.choices)
  include_blank: Include blank option (default: True)
  blank_text: Text for blank option (default: "---------")

Usage:
  <c-form-select :field="lead_form.source" />
  <c-form-select :field="form.status" :choices="custom_statuses" include_blank="False" />
{% endcomment %}

<c-vars
  field
  label=""
  choices=""
  include_blank="True"
  blank_text="---------"
/>

<div class="form-group">
  <label for="{{ field.id_for_label }}">
    {{ label|default:field.label }}
    {% if field.field.required %}<span class="text-danger">*</span>{% endif %}
  </label>

  <select
    name="{{ field.html_name }}"
    id="{{ field.id_for_label }}"
    class="form-control {% if field.errors %}is-invalid{% endif %}"
    {{ attrs }}
  >
    {% if include_blank == "True" %}
      <option value="">{{ blank_text }}</option>
    {% endif %}

    {% for choice in choices|default:field.field.choices %}
    <option
      value="{{ choice.0 }}"
      {% if field.data is not None and field.data == choice.0 %}selected{% endif %}
    >
      {{ choice.1 }}
    </option>
    {% endfor %}
  </select>

  {% if field.errors %}
  <div class="invalid-feedback">{{ field.errors.0 }}</div>
  {% endif %}

  {% if field.help_text and not field.errors %}
  <small class="form-text text-muted">{{ field.help_text }}</small>
  {% endif %}
</div>
```

### Key Change Explained

| Property      | Description                                | Use Case                                            |
| ------------- | ------------------------------------------ | --------------------------------------------------- |
| `field.value` | Cleaned Python value after form validation | Displaying the current saved value                  |
| `field.data`  | Raw submitted data from POST               | Selecting the option in form re-render after submit |

**Scenario:** User selects "Option B" (value="b") and submits form with validation error on another field.

- With `field.value`: Shows "Option B" (correct)
- With `field.data`: Shows "Option B" (also correct)

**Scenario:** Form is re-submitted after validation error, user didn't change the selection but the form re-renders:

- With `field.value`: May show "None" if value is None
- With `field.data`: Correctly shows "b" because it was in the POST data

---

## 4.2 Verify c-form-input Handles Edge Cases

**File:** `crown_crm/templates/cotton/form_input.html` (review)

### Checkpoints for form_input

1. **Empty value handling:** Should use `default` filter to prevent "None" showing
2. **Required field indicator:** Should show asterisk for required fields
3. **Error class ordering:** `is-invalid` should come AFTER `form-control` (not override it)
4. **Valid class:** Add `is-valid` class when field has value but no errors (optional feedback)

### Recommended c-form-input Code

```django-html
{% comment %}
c-form-input: Reusable Bootstrap 4 input component with HTMX support

Args:
  field: The form field instance (required)
  type: Input type - text, email, number, url, password, tel (default: text)
  placeholder: Placeholder text (optional)
  label: Override label text (optional, defaults to field.label)
  help_text: Override help text (optional, defaults to field.help_text)

Note: Do NOT pass 'class' via attrs to this component. The class attribute
is automatically generated based on validation state.
{% endcomment %}

<c-vars field type="text" placeholder="" label="" help_text="" />

<div class="form-group">
  {% comment %} Label {% endcomment %}
  <label for="{{ field.id_for_label }}">
    {{ label|default:field.label }}
    {% if field.field.required %}<span class="text-danger">*</span>{% endif %}
  </label>

  {% comment %} Input field with Bootstrap 4 validation classes {% endcomment %}
  <input
    type="{{ type }}"
    name="{{ field.html_name }}"
    id="{{ field.id_for_label }}"
    value="{{ field.value|default:'' }}"
    placeholder="{{ placeholder }}"
    class="form-control {% if field.errors %}is-invalid{% elif field.value and not field.errors %}is-valid{% endif %}"
    {{ attrs }}
  />

  {% comment %} Field-specific validation errors {% endcomment %}
  {% if field.errors %}
  <div class="invalid-feedback">{{ field.errors.0 }}</div>
  {% endif %}

  {% comment %} Help text (only shown if no errors to avoid clutter) {% endcomment %}
  {% if help_text|default:field.help_text and not field.errors %}
  <small class="form-text text-muted">
    {{ help_text|default:field.help_text }}
  </small>
  {% endif %}
</div>
```

---

## 4.3 Verify Base.html HTMX Handler

**File:** `crown_crm/templates/base.html` (verify implementation)

### Required Handler Code

```javascript
/**
 * HTMX 2.0 Error Handler
 *
 * Problem: HTMX discards 4xx response bodies by default, firing htmx:responseError
 * instead of swapping content. This breaks form validation error display.
 *
 * Solution: Intercept beforeSwap, allow swapping on 422/400, and mark as non-error
 * so htmx:afterSwap fires (re-initializing any JS handlers).
 */
document.body.addEventListener("htmx:beforeSwap", function (evt) {
  const xhr = evt.detail.xhr;
  const status = xhr.status;

  // 422 Unprocessable Entity: Form validation failed
  // 400 Bad Request: CSRF failure, malformed data
  if (status === 422 || status === 400) {
    // Allow HTMX to swap the response body into the DOM
    evt.detail.shouldSwap = true;

    // CRITICAL: Mark as NOT an error so htmx:afterSwap fires.
    // Without this, htmx:responseError fires instead, breaking any
    // initForm() or event re-attachment in afterSwap handlers.
    evt.detail.isError = false;

    // Optional: Auto-focus first invalid field after swap completes
    evt.detail.target.addEventListener("htmx:afterSwap", function focusError() {
      const firstInvalid = evt.detail.target.querySelector(".is-invalid");
      if (firstInvalid) {
        firstInvalid.focus({ preventScroll: false });
        firstInvalid.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      // Clean up: remove this one-time listener
      evt.detail.target.removeEventListener("htmx:afterSwap", focusError);
    });
  }

  // 204 No Content: Explicitly prevent swapping (HTMX 2.0 default, but explicit is safer)
  if (status === 204) {
    evt.detail.shouldSwap = false;
  }
});

/**
 * Global CSRF Token Handler for HTMX
 * Ensures all HTMX requests include the CSRF token.
 */
document.body.addEventListener("htmx:configRequest", function (evt) {
  const csrfToken = document.querySelector("[name=csrfmiddlewaretoken]")?.value;
  if (csrfToken) {
    evt.detail.headers["X-CSRFToken"] = csrfToken;
  }
});
```

---

## Files to Modify

| File                                          | Change                             |
| --------------------------------------------- | ---------------------------------- |
| `crown_crm/templates/cotton/form_select.html` | Use field.data for comparison      |
| `crown_crm/templates/cotton/form_input.html`  | Verify edge case handling          |
| `crown_crm/templates/base.html`               | Verify HTMX handler implementation |

---

## Implementation Order

1. Update `crown_crm/templates/cotton/form_select.html` with field.data fix
2. Verify `crown_crm/templates/cotton/form_input.html` handles edge cases
3. Verify `crown_crm/templates/base.html` has correct HTMX handler

---

## Verification

After implementation, verify:

1. Select dropdowns correctly show previously selected value after form validation error
2. Required fields show asterisk in labels
3. Help text doesn't show when there are errors
4. 422 responses swap form content into DOM
5. 204 responses don't trigger DOM swap
6. First invalid field gets auto-focus after validation error
