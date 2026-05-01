# Client-Side Validation Plan - Hybrid Approach

## Overview

This plan implements real-time JavaScript validation for lead forms while preserving Django's 422 error handling capability. The hybrid approach provides:

- Instant feedback as user types/blurs
- Digit-only enforcement for mobile numbers
- Email format validation
- Server-side fallback via HTMX form submission

---

## Implementation Architecture

```
User Input → JavaScript Validation (on blur/input) → Django Server (on submit)
     ↓                    ↓                              ↓
  Client-side        Server receives                  422 with
  instant feedback   validated data                   server errors
```

---

## Step 1: Update c-form-input Component

**File**: `crown_crm/templates/cotton/form_input.html`

**Changes**:

1. Add `required` HTML attribute conditionally
2. Add `hx-validate="true"` for HTMX-aware validation
3. Preserve Django error rendering

**Code**:

```django-html
{% comment %}
c-form-input: Reusable Bootstrap input component with HTMX support

NOTE:
- Uses 'required' HTML attribute for browser validation hooks
- HTMX validation events handle form submission logic
- Django 422 errors still render via is-invalid class

Args:
  field: The form field instance (required)
  type: Input type - text, email, number, url, password, tel (default: text)
  placeholder: Placeholder text (optional)
  label: Override label text (optional, defaults to field.label)
  help_text: Override help text (optional, defaults to field.help_text)
  show_required: Show asterisk for required fields (default: true)
{% endcomment %}

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
    hx-validate="true"
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

---

## Step 2: Create Validation JavaScript Module

**File**: `crown_crm/static/js/validation.js`

**Purpose**: Shared validation logic for all forms

**Code**:

```javascript
/**
 * Client-side validation module for lead forms
 * Hybrid approach: Real-time JS validation + Django server validation
 */

(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════════════
  // VALIDATION RULES
  // ═══════════════════════════════════════════════════════════════

  const VALIDATION_RULES = {
    mobile_number: {
      pattern: /^\d{10}$/,
      message: "Enter a valid 10-digit mobile number",
      enforceDigits: true,
      maxLength: 10,
    },
    email: {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: "Enter a valid email address (e.g., user@example.com)",
    },
    first_name: {
      required: true,
      message: "First name is required",
    },
    last_name: {
      required: true,
      message: "Last name is required",
    },
  };

  // ═══════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  function getFieldName(input) {
    return input.name || input.id;
  }

  function getValidationRule(fieldName) {
    // Check for exact match first
    if (VALIDATION_RULES[fieldName]) {
      return VALIDATION_RULES[fieldName];
    }
    // Check for partial match (mobile_number-0 -> mobile_number)
    for (const key of Object.keys(VALIDATION_RULES)) {
      if (fieldName.includes(key)) {
        return VALIDATION_RULES[key];
      }
    }
    return null;
  }

  function setFieldError(field, message) {
    field.classList.remove("is-valid");
    field.classList.add("is-invalid");

    let errorDiv = field.parentNode.querySelector(".invalid-feedback");
    if (!errorDiv) {
      errorDiv = document.createElement("div");
      errorDiv.className = "invalid-feedback";
      field.parentNode.appendChild(errorDiv);
    }
    errorDiv.textContent = message;
  }

  function clearFieldError(field) {
    field.classList.remove("is-invalid");
    const errorDiv = field.parentNode.querySelector(".invalid-feedback");
    if (errorDiv && !field.classList.contains("is-invalid")) {
      errorDiv.remove();
    }
  }

  function setFieldValid(field) {
    field.classList.remove("is-invalid");
    field.classList.add("is-valid");
  }

  // ═══════════════════════════════════════════════════════════════
  // VALIDATION FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  function validateField(field) {
    const fieldName = getFieldName(field);
    const rule = getValidationRule(fieldName);
    const value = field.value;

    // Clear previous state
    clearFieldError(field);
    field.classList.remove("is-valid");

    // Required field check
    if (rule && rule.required && !value.trim()) {
      setFieldError(field, rule.message);
      return false;
    }

    // Empty field - skip validation
    if (!value) {
      return true;
    }

    // Pattern validation
    if (rule && rule.pattern && !rule.pattern.test(value)) {
      setFieldError(field, rule.message);
      return false;
    }

    // Valid
    if (value) {
      setFieldValid(field);
    }
    return true;
  }

  function enforceInputConstraints(field) {
    const fieldName = getFieldName(field);
    const rule = getValidationRule(fieldName);

    if (!rule) return;

    // Enforce digit-only for mobile
    if (rule.enforceDigits && rule.maxLength) {
      const originalValue = field.value;
      const digitsOnly = originalValue
        .replace(/\D/g, "")
        .slice(0, rule.maxLength);
      if (originalValue !== digitsOnly) {
        field.value = digitsOnly;
      }
    }

    // Enforce max length
    if (rule.maxLength && !rule.enforceDigits) {
      if (field.value.length > rule.maxLength) {
        field.value = field.value.slice(0, rule.maxLength);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════

  function handleInput(event) {
    const field = event.target;
    if (
      field.tagName !== "INPUT" &&
      field.tagName !== "SELECT" &&
      field.tagName !== "TEXTAREA"
    ) {
      return;
    }

    // Enforce constraints as user types
    enforceInputConstraints(field);
  }

  function handleBlur(event) {
    const field = event.target;
    if (
      field.tagName !== "INPUT" &&
      field.tagName !== "SELECT" &&
      field.tagName !== "TEXTAREA"
    ) {
      return;
    }

    // Validate on blur (user finished entering)
    validateField(field);
  }

  function handleChange(event) {
    const field = event.target;
    if (
      field.tagName !== "INPUT" &&
      field.tagName !== "SELECT" &&
      field.tagName !== "TEXTAREA"
    ) {
      return;
    }

    validateField(field);
  }

  // ═══════════════════════════════════════════════════════════════
  // HTMX VALIDATION EVENTS
  // ═══════════════════════════════════════════════════════════════

  function setupHTMXValidation() {
    // Before validation check - custom validation logic
    document.body.addEventListener("htmx:validation:validate", function (e) {
      const field = e.target;
      if (!validateField(field)) {
        // Prevent form submission
        e.preventDefault();
        // Optionally show a message
        console.log("Validation failed for:", field.name);
      }
    });

    // When validation fails
    document.body.addEventListener("htmx:validation:failed", function (e) {
      const field = e.target;
      console.log("HTMX validation failed for:", field.name);
    });

    // When request is halted due to validation
    document.body.addEventListener("htmx:validation:halted", function (e) {
      const errors = e.detail.errors;
      console.log("Validation halted, errors:", errors);
      // Could display errors in a toast notification here
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  function init() {
    // Attach event listeners to form inputs
    document.addEventListener("input", handleInput, { capture: true });
    document.addEventListener("blur", handleBlur, { capture: true });
    document.addEventListener("change", handleChange, { capture: true });

    // Setup HTMX validation events
    setupHTMXValidation();

    console.log("Client-side validation initialized");
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Re-initialize after HTMX swaps
  document.body.addEventListener("htmx:afterSwap", function (e) {
    // Re-attach validation listeners to new content
    init();
  });
})();
```

---

## Step 3: Add Validation Script to Lead Form Template

**File**: `crown_crm/templates/leads/forms/lead_create.html`

Add to the template (already using c-form-wrapper, c-form-input components):

```django
{% block custom_js %}
<script src="{% static 'js/validation.js' %}"></script>

<script>
  // existing formset handlers...
</script>
{% endblock custom_js %}
```

---

## Step 4: Update lead_form.html Similarly

**File**: `crown_crm/templates/leads/forms/lead_form.html`

Same changes as lead_create.html - include validation.js script.

---

## Step 5: Update Base Template

**File**: `crown_crm/templates/base.html`

Ensure validation.js is loaded globally:

```django-html
<!-- In existing script block -->
<script src="{% static 'js/jquery.min.js' %}"></script>
<script src="{% static 'js/bootstrap.min.js' %}"></script>
<script src="{% static 'js/htmx.min.js' %}"></script>
<script src="{% static 'js/validation.js' %}"></script>
```

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INPUT                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     onInput Event                                │
│  • enforceInputConstraints()                                    │
│    - Strip non-digits for mobile                                │
│    - Enforce maxLength                                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      onBlur Event                               │
│  • validateField()                                             │
│    - Check required                                            │
│    - Check pattern (10 digits, email format)                   │
│    - Set is-invalid / is-valid classes                          │
│    - Show/remove error message                                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   onHTMX Submit                                  │
│  • htmx:validation:validate event                              │
│  • Runs validateField() one more time                          │
│  • If invalid: preventDefault() stops submission               │
│  • If valid: proceeds to Django                                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Django Server                              │
│  • Validates form (Python)                                      │
│  • If valid: saves and returns 204 + event                     │
│  • If invalid: returns 422 with form + errors                  │
│    - HTMX swaps form with errors                                │
│    - Validation.js re-initializes                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files to Create/Modify

| File                                               | Action | Description               |
| -------------------------------------------------- | ------ | ------------------------- |
| `crown_crm/static/js/validation.js`                | CREATE | Validation module         |
| `crown_crm/templates/cotton/form_input.html`       | MODIFY | Add required, hx-validate |
| `crown_crm/templates/base.html`                    | MODIFY | Include validation.js     |
| `crown_crm/templates/leads/forms/lead_create.html` | MODIFY | Include validation.js     |
| `crown_crm/templates/leads/forms/lead_form.html`   | MODIFY | Include validation.js     |

---

## Validation Rules Summary

| Field           | Validation             | Error Message                          |
| --------------- | ---------------------- | -------------------------------------- |
| `mobile_number` | 10 digits, digits only | "Enter a valid 10-digit mobile number" |
| `email`         | Valid email format     | "Enter a valid email address"          |
| `first_name`    | Required               | "First name is required"               |
| `last_name`     | Required               | "Last name is required"                |

---

## Testing Checklist

| Test Case                    | Expected Behavior                          |
| ---------------------------- | ------------------------------------------ |
| Type letters in mobile field | Letters stripped, only digits remain       |
| Type more than 10 digits     | Truncated to 10 digits                     |
| Leave first_name empty, blur | Red border + "First name is required"      |
| Enter valid email            | Green border (is-valid)                    |
| Enter invalid email, blur    | Red border + "Enter a valid email address" |
| Submit with invalid fields   | Form blocked, errors shown                 |
| Submit with valid fields     | Sent to Django                             |
| Django returns 422           | Form re-rendered with errors               |

---

## Edge Cases Handled

1. **Formset fields** - Validation works for dynamically added forms (e.g., `mobile_number-0`, `mobile_number-1`)
2. **HTMX swap** - Validation re-initializes after form replacement
3. **Empty fields** - Skip pattern validation if field is empty (unless required)
4. **HTML5 constraints** - `maxlength` on input prevents typing beyond limit
5. **Server errors** - Django 422 errors display alongside JS validation

---

## Summary

This plan provides:

- **Real-time feedback**: Instant validation as user types/blurs
- **Digit enforcement**: Mobile numbers auto-strip non-digits
- **HTMX integration**: Uses `hx-validate` and validation events
- **Server fallback**: Django still validates on submit
- **Formset support**: Works with dynamically added form fields
- **Clean code**: Separate validation.js module, reusable across forms
