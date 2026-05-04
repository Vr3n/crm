# Membership Sale Form Error Handling Plan

## Purpose

Add robust error handling to membership_sale_form.html following the pattern used in `lead_create.html`, plus specific validation rules.

---

## Additional Validation Rules (from membership-sale-form-validation-rules.md)

These are the REQUIRED validation rules that MUST be enforced:

| #   | Rule                                                                                              | Implementation                                         |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | **Lead must be selected** - If not selected, make search lead input and label red                 | Add `.is-invalid` class to `#leadSearch` and red label |
| 2   | **Duration must be selected** - End date cannot be blank, end date cannot be less than start date | Duration dropdown validation + end >= start check      |
| 3   | **Base price must not be empty** - Not less than selling price                                    | Validation in `updateDiscountDisplay()`                |
| 4   | **Selling price cannot be empty** - Not more than base price, ≤ base price                        | Already implemented with pricing logic                 |
| 5   | **Amount Paid ≤ Selling Price** - Cannot exceed selling price                                     | Already in `updateBalanceDisplay()`                    |
| 6   | **Payment method must be selected** - Cannot be blank                                             | Add required validation                                |

---

## Current State

### Current Error Handling in membership_sale_form.html

- Individual field errors rendered inline (scattered):
  - `form.lead.errors` (line 84-86)
  - `form.membership_start_date.errors` (line 104-106)
  - `form.membership_end_date.errors` (line 112-114)
  - `form.base_price.errors` (line 133-135)
  - `form.price.errors` (line 147-148)
  - `form.payment_amount.errors` (line 174-176)
  - `form.payment_method.errors` (line 183-185)
- No consolidated error alert
- No client-side error popup (Swal)
- No auto-dismiss mechanism

### Reference: lead_create.html Error Pattern

**1. Server-side Error Alert (lines 4-9):**

```jinja
{% if lead_form.errors or mobile_formset.errors or email_formset.errors or address_form.errors %}
<div class="alert alert-danger alert-dismissible fade show" role="alert">
  There was a problem during form submission.
  <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
</div>
{% endif %}
```

**2. Client-side Swal Errors (lines 138-169):**

```javascript
{% if lead_form.errors or mobile_formset.errors or email_formset.errors or address_form.errors %}
<script>
  document.addEventListener("DOMContentLoaded", function() {
    const errors = [
      {% for field, errors_list in lead_form.errors.items %}
      {% for error in errors_list %}"{{ error|escapejs }}",{% endfor %}
      {% endfor %}
      // ... similar for other formsets
    ];
    errors.forEach(function(errorMsg) {
      Swal.fire({
        icon: 'error',
        title: 'Validation Error',
        text: errorMsg,
        timer: 10000,
        timerProgressBar: true
      });
    });
  });
</script>
{% endif %}
```

**3. Auto-dismiss Alert (lines 128-137):**

```javascript
document.addEventListener("htmx:afterRequest", function (e) {
  const alertDiv = document.querySelector(".alert");
  if (alertDiv) {
    setTimeout(function () {
      alertDiv.classList.remove("show");
      setTimeout(function () {
        alertDiv.remove();
      }, 300);
    }, 10000);
  }
});
```

---

## Implementation Plan

### Step 1: Add Consolidated Error Alert

After `{% csrf_token %}` (line 8), add:

```jinja
{% if form.errors %}
<div class="alert alert-danger alert-dismissible fade show" role="alert">
  There was a problem during form submission. Please fix the errors below.
  <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
</div>
{% endif %}
```

**Location:** After line 8 (`{% csrf_token %}`), before line 10 (`{# SECTION 1: LEAD SELECTION #}`)

### Step 2: Add Client-side Swal for Form Errors

Add at the end of the template, inside `{% block custom_js %}` or just before final `</script>`:

```jinja
{% if form.errors %}
<script>
  document.addEventListener("DOMContentLoaded", function() {
    const errors = [
      {% for field, errors_list in form.errors.items %}
      {% for error in errors_list %}"{{ error|escapejs }}",
      {% endfor %}
      {% endfor %}
    ];
    errors.forEach(function(errorMsg) {
      Swal.fire({
        icon: 'error',
        title: 'Validation Error',
        text: errorMsg,
        timer: 10000,
        timerProgressBar: true
      });
    });
  });
</script>
{% endif %}
```

**Location:** After line 523 (before final `</script>`), add new script block.

### Step 3: Add Auto-dismiss for Alert

Add after form submission:

```javascript
document.addEventListener("htmx:afterRequest", function (e) {
  const alertDiv = document.querySelector(".alert");
  if (alertDiv) {
    setTimeout(function () {
      alertDiv.classList.remove("show");
      setTimeout(function () {
        alertDiv.remove();
      }, 300);
    }, 10000);
  }
});
```

**Location:** In the main `<script>` block, near line 500.

### Step 4: Lead Selection Validation (Rule #1)

Add in JavaScript to check lead selection before submit:

```javascript
// Lead selection validation
function validateLeadSelection() {
  const leadId = document.getElementById("id_lead").value;
  const leadSearch = document.getElementById("leadSearch");
  const label = document.querySelector('label[for="leadSearch"]');

  if (!leadId) {
    leadSearch.classList.add("is-invalid");
    if (label) label.classList.add("text-danger");
    return false;
  } else {
    leadSearch.classList.remove("is-invalid");
    if (label) label.classList.remove("text-danger");
    return true;
  }
}
```

Also add `formnovalidate` to form and hook into submit event.

### Step 5: Duration/End Date Validation (Rule #2)

Add in `syncEndDate()` function:

```javascript
function syncEndDate() {
  const startInput = document.getElementById("id_membership_start_date");
  const endInput = document.getElementById("id_membership_end_date");
  const durationSelect = document.getElementById("id_duration_preset");

  if (!startInput || !endInput || !durationSelect) return;

  const durationKey = durationSelect.value;
  const startVal = startInput.value;

  if (durationKey && durationKey !== "custom" && durationKey !== "") {
    const startDate = new Date(startVal);
    const endDate = calcEndDate(startDate, durationKey);
    if (endDate) {
      endInput.value = toDateInputValue(endDate);
    }
  }

  // Validate: end date cannot be less than start date
  if (startVal && endInput.value && endInput.value < startVal) {
    endInput.classList.add("is-invalid");
  } else {
    endInput.classList.remove("is-invalid");
  }
}
```

### Step 6: Update Existing Pricing Logic (Rules #3, #4)

The current implementation already handles:

- Base price must not be empty
- Selling price cannot be empty (auto-fills with base)
- Selling price ≤ base price (capped)

Ensure `updateDiscountDisplay()` validates and shows `is-invalid` on fields.

### Step 7: Payment Amount Validation (Rule #5)

The `updateBalanceDisplay()` already:

- Adds `is-invalid` when paid > price
- Sets `paymentInput.max = price`

Ensure this is linked to form submit validation.

### Step 8: Payment Method Validation (Rule #6)

Add validation to check payment method is selected:

```javascript
function validatePaymentMethod() {
  const methodSelect = document.getElementById("id_payment_method");
  if (methodSelect && !methodSelect.value) {
    methodSelect.classList.add("is-invalid");
    return false;
  }
  methodSelect.classList.remove("is-invalid");
  return true;
}
```

### Step 9: Master Validation Function

Add a master `validateForm()` that runs all validations before submit:

```javascript
function validateForm() {
  let isValid = true;
  isValid = validateLeadSelection() && isValid;
  isValid = validateEndDate() && isValid;
  isValid = validatePrice() && isValid;
  isValid = validatePaymentAmount() && isValid;
  isValid = validatePaymentMethod() && isValid;
  return isValid;
}

// Hook into form submit
document
  .getElementById("membershipSaleForm")
  .addEventListener("submit", function (e) {
    if (!validateForm()) {
      e.preventDefault();
      // Show error
    }
  });
```

---

## Changes Summary

| Step | Change                                     | Lines Affected          |
| ---- | ------------------------------------------ | ----------------------- |
| 1    | Add consolidated error alert               | After line 8            |
| 2    | Add Swal error display                     | End of file             |
| 3    | Add auto-dismiss                           | In main script          |
| 4    | Add lead selection validation (Rule #1)    | JS function             |
| 5    | Add duration/end date validation (Rule #2) | In syncEndDate()        |
| 6    | Ensure pricing validation (Rules #3, #4)   | updateDiscountDisplay() |
| 7    | Ensure payment amount validation (Rule #5) | updateBalanceDisplay()  |
| 8    | Add payment method validation (Rule #6)    | JS function             |
| 9    | Master validateForm()                      | JS function             |

---

## Testing Scenarios

| Scenario                        | Expected Behavior                     |
| ------------------------------- | ------------------------------------- |
| Lead not selected + submit      | Error on lead search, label turns red |
| Duration not selected           | End date blank error                  |
| End date < Start date           | End date shows invalid                |
| Base price empty                | Error shown                           |
| Selling price > Base price      | Selling price capped to base          |
| Payment > Selling price         | Payment shows invalid                 |
| Payment method not selected     | Error shown                           |
| Server returns form with errors | Red alert at top, Swal pops up        |
