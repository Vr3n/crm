# Django HTMX Form Error Handling Fix

## Problem Statement

HTMX form submissions in this project return HTTP **200** even when form validation fails. This is problematic because:

1. **Doesn't follow REST semantics** - 4xx status codes indicate client errors
2. **HTMX discards 4xx content by default** - validation errors aren't displayed
3. **Can't distinguish success from failure** - both return 200

## Current Issues Found

### 1. Views Return 200 on Form Validation Errors

| View                                                  | Current Status | Expected Status |
| ----------------------------------------------------- | -------------- | --------------- |
| `hx_create_lead` (leads/views.py:232)                 | 200            | 422             |
| `hx_create_membership_sale` (accounting/views.py:85)  | 200            | 422             |
| `hx_edit_lead` (leads/views.py:309)                   | 200            | 422             |
| `hx_create_payment_receipt` (accounting/views.py:181) | 200            | 422             |
| `hx_edit_receipt` (accounting/views.py:380)           | 200            | 422             |
| `hx_sale_update` (accounting/views.py:310)            | 200            | 422             |
| `hx_quick_create_lead` (leads/views.py:582)           | 200            | 422             |
| `hx_create_service` (logistics/views.py:88)           | 200            | 422             |
| `hx_edit_service` (logistics/views.py:126)            | 200            | 422             |
| `hx_create_product` (logistics/views.py:266)          | 200            | 422             |
| `hx_edit_product` (logistics/views.py:305)            | 200            | 422             |
| `hx_create_client` (clients/views.py:73)              | 200            | 422             |

### 2. Views Return 200 on Success (Should be 200/204)

| View                        | Current Status | Expected Status | Notes              |
| --------------------------- | -------------- | --------------- | ------------------ |
| `hx_create_lead`            | 200            | **204**         | No body            |
| `hx_create_membership_sale` | 200            | **200**         | Has body (receipt) |
| `hx_edit_lead`              | 200            | **204**         | No body            |
| `hx_create_payment_receipt` | 200            | Check template  | If body → 200      |
| `hx_edit_receipt`           | 200            | **204**         | No body            |
| `hx_sale_update`            | 200            | **204**         | No body            |
| Delete views                | 200            | **204**         | No body            |

### 3. Form Templates Missing Bootstrap Error Classes

Templates use manual error display but don't add `is-invalid` class to form inputs:

- `crown_crm/templates/leads/forms/lead_create.html`
- `crown_crm/templates/accounting/partials/membership_sale_form.html`
- Other form templates

### 4. HTMX Default Behavior

By default, HTMX discards response content on 4xx status codes. Need to add JavaScript handler to allow swapping on validation errors (422).

---

## HTTP Status Code Convention for HTMX

> **Rule:** Body returned → 200, No body → 204, Error → 422

| Scenario                                | Status Code                    | Reason                                      |
| --------------------------------------- | ------------------------------ | ------------------------------------------- |
| Form invalid (validation error)         | **422** (Unprocessable Entity) | Standard for validation failures            |
| Resource created (with body to swap)    | **200**                        | HTMX swaps returned content into DOM        |
| Resource created (no body, event only)  | **204** (No Content)           | Trigger client event, no content to swap    |
| Action completed (no content to return) | **204** (No Content)           | For updates/deletes with client-side events |
| Bad request (CSRF, malformed)           | **400**                        | Client-side error                           |

> **Note:** If a creation endpoint renders a template in the success response (body to swap), use **200**, not 201. The 201 status is for cases where you return nothing but trigger an event. This keeps HTMX behavior consistent.

---

## Implementation Plan

### Step 1: Add HTMX Error Swap Handler (base.html)

**File:** `crown_crm/templates/base.html`

Add JavaScript to allow HTMX to swap content on 422 responses:

```javascript
// Allow HTMX to swap content on 422 (Validation Error) responses
// Without isError = false, HTMX fires htmx:responseError instead of htmx:afterSwap,
// which breaks initForm() and other afterSwap handlers that re-attach event listeners.
htmx.on("htmx:beforeSwap", (e) => {
  if (e.detail.xhr.status === 422) {
    e.detail.shouldSwap = true;
    e.detail.isError = false;
  }
  // Also handle 400 for CSRF errors
  if (e.detail.xhr.status === 400) {
    e.detail.shouldSwap = true;
    e.detail.isError = false;
  }
});
```

---

### Step 2: Fix Leads Views

#### 2.1 `hx_create_lead` (leads/views.py:232)

**Changes:**

- On success: Return `HttpResponse(status=204)` + trigger client event
- On validation error: Return `render(..., status=422)`

```python
# Success - 204 No Content
res = HttpResponse(status=204)
res = trigger_client_event(res, "lead_create_success")
return res

# Error - 422 with form errors
res = render(request, "leads/forms/lead_create.html", context, status=422)
return res
```

#### 2.2 `hx_edit_lead` (leads/views.py:309)

**Changes:**

- On success: Return `HttpResponse(status=204)` + trigger client event
- On validation error: Return `render(..., status=422)`

#### 2.3 `hx_quick_create_lead` (leads/views.py:582)

**Changes:**

- On success: `HttpResponse(status=204)` + trigger event (no body returned)
- On validation error: `render(..., status=422)`

#### 2.4 Add Bootstrap Error Classes to Template

**File:** `crown_crm/templates/leads/forms/lead_create.html`

Add `is-invalid` class to inputs with errors:

```html
<input
  type="text"
  class="form-control {% if lead_form.first_name.errors %}is-invalid{% endif %}"
  name="first_name"
  id="{{ lead_form.first_name.id_for_label }}"
  value="{{ lead_form.first_name.value|default:'' }}"
/>
{% if lead_form.first_name.errors %}
<div class="invalid-feedback">{{ lead_form.first_name.errors.0 }}</div>
{% endif %}
```

**Fields to update:**

- first_name, middle_name, last_name, source
- mobile_number (in formset), email (in formset)
- flat_building, landmark, area, street, city, state, pincode

---

### Step 3: Fix Accounting Views

#### 3.1 `hx_create_membership_sale` (accounting/views.py:85)

**Current implementation returns a rendered template** (`payment_receipt.html`) on success, so body is returned → use **200**.

**Changes:**

- On success: Return `render(..., status=200)` + trigger client event
- On validation error: Return `render(..., status=422)`

```python
# Success - 200 (body to swap)
response = render(
    request,
    "accounting/partials/payment_receipt.html",
    {"sale": sale, "receipt": first_receipt},
)
return trigger_client_event(
    response,
    "membership_sale_create_success",
    {"message": "Membership sale recorded successfully!"},
)

# Error - 422
return render(request, "accounting/partials/membership_sale_form.html",
              {"form": form, "selected_lead": selected_lead}, status=422)
```

> **Note:** The user originally requested 201, but the current implementation returns a rendered body. Per the rule "body returned → 200", this is the correct approach. If the body is not needed, change to 204 + trigger event.

#### 3.2 `hx_create_payment_receipt` (accounting/views.py:181)

**Changes:**

- On success: 201 + trigger event
- On error: 422

#### 3.3 `hx_edit_receipt` (accounting/views.py:380)

**Changes:**

- On success: 204 + trigger event
- On error: 422

#### 3.4 `hx_sale_update` (accounting/views.py:310)

**Changes:**

- On success: 204 + trigger event
- On error: 422

#### 3.5 Add Bootstrap Error Classes to Template

**File:** `crown_crm/templates/accounting/partials/membership_sale_form.html`

Add `is-invalid` class to form inputs:

```html
<input
  type="text"
  class="form-control {% if form.lead.errors %}is-invalid{% endif %}"
  id="leadSearch"
  ...
/>
{% if form.lead.errors %}
<div class="invalid-feedback">{{ form.lead.errors.0 }}</div>
{% endif %}
```

---

### Step 4: Fix Other HTMX Views

#### 4.1 Logistics Views

> Check each view - if success renders a template (body), use 200. If just triggers event, use 204.

| View                | File:Line              | Changes                        |
| ------------------- | ---------------------- | ------------------------------ |
| `hx_create_service` | logistics/views.py:88  | Check template, likely 200/204 |
| `hx_edit_service`   | logistics/views.py:126 | 204 (no body), 422 on error    |
| `hx_create_product` | logistics/views.py:266 | Check template, likely 200/204 |
| `hx_edit_product`   | logistics/views.py:305 | 204 (no body), 422 on error    |

#### 4.2 Clients Views

| View               | File:Line           | Changes                        |
| ------------------ | ------------------- | ------------------------------ |
| `hx_create_client` | clients/views.py:73 | Check template, likely 200/204 |

#### 4.3 Organizations Views

| View                          | File:Line                 | Changes                        |
| ----------------------------- | ------------------------- | ------------------------------ |
| `hx_organization_create_view` | organizations/views.py:59 | Check template, likely 200/204 |

---

### Step 5: Audit Delete Views

Delete views should return 204 (already returning 200 in some cases). Verify:

- `hx_lead_delete_view` (leads/views.py:127)
- `hx_delete_receipt` (accounting/views.py:263)
- `hx_sale_delete` (accounting/views.py:348)
- `hx_lead_mobile_delete` (leads/views.py:400)
- `hx_lead_email_delete` (leads/views.py:547)
- `hx_delete_service` (logistics/views.py:168)
- `hx_delete_product` (logistics/views.py:343)
- `hx_delete_client_view` (clients/views.py:144)

---

## Files to Modify

### Views (Status Codes)

| File                               | Views to Update                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `crown_crm/leads/views.py`         | hx_create_lead, hx_edit_lead, hx_quick_create_lead                                    |
| `crown_crm/accounting/views.py`    | hx_create_membership_sale, hx_create_payment_receipt, hx_edit_receipt, hx_sale_update |
| `crown_crm/logistics/views.py`     | hx_create_service, hx_edit_service, hx_create_product, hx_edit_product                |
| `crown_crm/clients/views.py`       | hx_create_client                                                                      |
| `crown_crm/organizations/views.py` | hx_organization_create_view                                                           |

### Templates (Error Classes)

| File                                                                | Fields to Update            |
| ------------------------------------------------------------------- | --------------------------- |
| `crown_crm/templates/leads/forms/lead_create.html`                  | All form fields             |
| `crown_crm/templates/accounting/partials/membership_sale_form.html` | All form fields             |
| `crown_crm/templates/logistics/...`                                 | Service/Product form fields |
| `crown_crm/templates/clients/...`                                   | Client form fields          |

### Global

| File                            | Change                      |
| ------------------------------- | --------------------------- |
| `crown_crm/templates/base.html` | Add htmx:beforeSwap handler |

---

## Testing Checklist

1. Create lead with invalid data → Expect 422, error displayed in form
2. Create lead with valid data → Expect 204, modal closes/refresh triggered
3. Create membership sale with invalid data → Expect 422, errors displayed
4. Create membership sale with valid data → Expect 201, sale created
5. Check other HTMX forms behave similarly

---

## References

- [HTMX Request/Response docs](https://four.htmx.org/docs/core-concepts/requests-and-responses)
- [StackOverflow: HTMX Form Errors in Django](https://stackoverflow.com/questions/79421323/htmx-form-in-django-errors-not-updating-in-the-dom-after-failed-validation)
- [django-htmx package](https://django-htmx.readthedocs.io/)
- [HTTP Status 422](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/422)
- [HTTP Status 201](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/201)
- [HTTP Status 204](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/204)
