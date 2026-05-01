# Django HTMX Form Adaptations Plan

## Problem Statement

HTMX form submissions return **HTTP 200** for both success and validation errors, breaking REST semantics. The existing plan had three major gaps:

1. **Manual Bootstrap error classes** across 12+ templates — unmaintainable and error-prone
2. **No reusable component strategy** — every form template duplicates logic
3. **Missing HTMX 2.0 specific patterns** — handler needs refinement

---

## Solution Architecture

Use **django-cotton** for reusable form components + **HtmxFormMixin** for consistent view patterns.

### Components

| Component         | Purpose                                   |
| ----------------- | ----------------------------------------- |
| `c-form-input`    | Text, email, number, url, password inputs |
| `c-form-select`   | Dropdown selects                          |
| `c-form-textarea` | Multi-line text                           |
| `c-form-checkbox` | Boolean/checkbox fields                   |
| `c-form-date`     | Date inputs with flatpickr                |
| `c-modal-form`    | Modal wrapper with form                   |
| `c-delete-button` | HTMX delete with confirmation             |
| `c-spinner`       | Loading indicator                         |

### Mixin

| Class           | Purpose                                       |
| --------------- | --------------------------------------------- |
| `HtmxFormMixin` | Handles 422/204/200 status codes consistently |

---

## Implementation Plan

### Phase 1: Global Setup

#### 1.1 Update base.html - HTMX 2.0 Error Handler

**File:** `crown_crm/templates/base.html`

```javascript
document.body.addEventListener("htmx:beforeSwap", function (evt) {
  const xhr = evt.detail.xhr;
  const status = xhr.status;

  // 422 Unprocessable Entity: Form validation failed
  // 400 Bad Request: CSRF failure, malformed data
  if (status === 422 || status === 400) {
    evt.detail.shouldSwap = true;
    evt.detail.isError = false;

    // Auto-focus first invalid field after swap
    evt.detail.target.addEventListener("htmx:afterSwap", function focusError() {
      const firstInvalid = evt.detail.target.querySelector(".is-invalid");
      if (firstInvalid) {
        firstInvalid.focus({ preventScroll: false });
        firstInvalid.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      evt.detail.target.removeEventListener("htmx:afterSwap", focusError);
    });
  }

  // 204 No Content: Prevent swapping
  if (status === 204) {
    evt.detail.shouldSwap = false;
  }
});

// Global CSRF Token Handler
document.body.addEventListener("htmx:configRequest", function (evt) {
  const csrfToken = document.querySelector("[name=csrfmiddlewaretoken]")?.value;
  if (csrfToken) {
    evt.detail.headers["X-CSRFToken"] = csrfToken;
  }
});
```

---

### Phase 2: Create django-cotton Components

Create components in `crown_crm/templates/cotton/`:

| File                 | Component       |
| -------------------- | --------------- |
| `form_input.html`    | c-form-input    |
| `form_select.html`   | c-form-select   |
| `form_textarea.html` | c-form-textarea |
| `form_checkbox.html` | c-form-checkbox |
| `modal_form.html`    | c-modal-form    |
| `delete_button.html` | c-delete-button |
| `spinner.html`       | c-spinner       |

#### Component Pattern (example: c-form-input)

```html
<c-vars field type="text" placeholder="" label="" help_text="" />

<div class="form-group">
  <label for="{{ field.id_for_label }}">
    {{ label|default:field.label }} {% if field.field.required %}<span
      class="text-danger"
      >*</span
    >{% endif %}
  </label>

  <input
    type="{{ type }}"
    name="{{ field.html_name }}"
    id="{{ field.id_for_label }}"
    value="{{ field.value|default:'' }}"
    placeholder="{{ placeholder }}"
    class="form-control {% if field.errors %}is-invalid{% elif field.value and not field.errors %}is-valid{% endif %}"
    {{
    attrs
    }}
  />

  {% if field.errors %}
  <div class="invalid-feedback">{{ field.errors.0 }}</div>
  {% endif %} {% if help_text|default:field.help_text and not field.errors %}
  <small class="form-text text-muted"
    >{{ help_text|default:field.help_text }}</small
  >
  {% endif %}
</div>
```

---

### Phase 3: Create HtmxFormMixin

**File:** `crown_crm/core/mixins.py`

```python
class HtmxFormMixin:
    """
    Mixin for HTMX form views:
    - 422 for validation errors (with form re-render)
    - 204 for success with no body (triggers client event)
    - 200 for success with body (renders template)
    """
    template_name = None
    success_event = None
    success_event_params = None
    success_status = 204

    def render_form(self, request, context, status=200):
        return TemplateResponse(request, self.template_name, context, status=status)

    def htmx_success(self, context=None, template_name=None):
        if self.success_status == 204:
            response = HttpResponse(status=204)
            if self.success_event:
                response = trigger_client_event(response, self.success_event, self.success_event_params or {})
            return response
        template = template_name or self.template_name
        return TemplateResponse(request=self.request, template=template, context=context or {}, status=200)

    def form_invalid(self, request, form, **context):
        return self.render_form(request, {**context, "form": form}, status=422)
```

---

### Phase 4: Refactor Views

Convert function-based views to class-based views using HtmxFormMixin.

#### 4.1 Leads Views

| View                    | File           | Success | Error | Body? |
| ----------------------- | -------------- | ------- | ----- | ----- |
| `HxCreateLeadView`      | leads/views.py | 204     | 422   | No    |
| `HxEditLeadView`        | leads/views.py | 204     | 422   | No    |
| `HxQuickCreateLeadView` | leads/views.py | 204     | 422   | No    |
| `HxLeadDeleteView`      | leads/views.py | 204     | -     | No    |

#### 4.2 Accounting Views

| View                         | File                | Success | Error | Body?         |
| ---------------------------- | ------------------- | ------- | ----- | ------------- |
| `HxCreateMembershipSaleView` | accounting/views.py | 200     | 422   | Yes (receipt) |
| `HxCreatePaymentReceiptView` | accounting/views.py | 204     | 422   | No            |
| `HxEditReceiptView`          | accounting/views.py | 204     | 422   | No            |
| `HxSaleUpdateView`           | accounting/views.py | 204     | 422   | No            |
| `HxDeleteReceiptView`        | accounting/views.py | 204     | -     | No            |
| `HxSaleDeleteView`           | accounting/views.py | 204     | -     | No            |

#### 4.3 Logistics Views

| View                  | File               | Success | Error | Body? |
| --------------------- | ------------------ | ------- | ----- | ----- |
| `HxCreateServiceView` | logistics/views.py | 200\*   | 422   | Check |
| `HxEditServiceView`   | logistics/views.py | 204     | 422   | No    |
| `HxDeleteServiceView` | logistics/views.py | 204     | -     | No    |
| `HxCreateProductView` | logistics/views.py | 200\*   | 422   | Check |
| `HxEditProductView`   | logistics/views.py | 204     | 422   | No    |
| `HxDeleteProductView` | logistics/views.py | 204     | -     | No    |

#### 4.4 Clients Views

| View                 | File             | Success | Error | Body? |
| -------------------- | ---------------- | ------- | ----- | ----- |
| `HxCreateClientView` | clients/views.py | 200\*   | 422   | Check |
| `HxDeleteClientView` | clients/views.py | 204     | -     | No    |

#### 4.5 Organizations Views

| View                       | File                   | Success | Error | Body? |
| -------------------------- | ---------------------- | ------- | ----- | ----- |
| `HxOrganizationCreateView` | organizations/views.py | 200\*   | 422   | Check |

\*Note: Check template - if returns body use 200, otherwise 204.

---

### Phase 5: Refactor Templates

Update form templates to use cotton components.

#### 5.1 Lead Create Form

**File:** `crown_crm/templates/leads/forms/lead_create.html`

Change from:

```html
<input
  class="form-control {% if lead_form.first_name.errors %}is-invalid{% endif %}"
  ...
/>
```

To:

```html
<c-form-input :field="lead_form.first_name" placeholder="First name" />
```

#### 5.2 Membership Sale Form

**File:** `crown_crm/templates/accounting/partials/membership_sale_form.html`

Change from manual Bootstrap classes to cotton components.

#### 5.3 Other Templates

Refactor:

- `leads/forms/lead_edit.html`
- `accounting/partials/payment_receipt_form.html`
- `accounting/partials/sale_update_form.html`
- `logistics/partials/service_form.html`
- `logistics/partials/product_form.html`
- `clients/partials/client_form.html`
- `organizations/partials/organization_form.html`

---

### Phase 6: Client-Side Event Handlers

**File:** Add to `base.html` or `static/js/htmx-events.js`

```javascript
document.body.addEventListener("lead:create_success", function (evt) {
  const modal = document.querySelector("#create-lead-modal");
  if (modal) $(modal).modal("hide");
  showToast("Lead created successfully", "success");
  const leadList = document.querySelector("#lead-list");
  if (leadList) htmx.trigger(leadList, "refresh");
});

// Similar handlers for: update, delete, membership_sale, receipt, service, product, client, organization
```

---

### Phase 7: Update URLs

Convert function-based view URLs to class-based:

```python
# leads/urls.py
path('hx/create/', views.HxCreateLeadView.as_view(), name='hx_create'),
path('hx/<int:pk>/edit/', views.HxEditLeadView.as_view(), name='hx_edit'),
# etc.
```

---

## Files to Create

### New Files

| File                                            | Purpose            |
| ----------------------------------------------- | ------------------ |
| `crown_crm/templates/cotton/form_input.html`    | Input component    |
| `crown_crm/templates/cotton/form_select.html`   | Select component   |
| `crown_crm/templates/cotton/form_textarea.html` | Textarea component |
| `crown_crm/templates/cotton/form_checkbox.html` | Checkbox component |
| `crown_crm/templates/cotton/modal_form.html`    | Modal wrapper      |
| `crown_crm/templates/cotton/delete_button.html` | Delete button      |
| `crown_crm/templates/cotton/spinner.html`       | Spinner            |
| `crown_crm/core/mixins.py`                      | HtmxFormMixin      |
| `crown_crm/static/js/htmx-events.js`            | Event handlers     |

### Files to Modify

| File                                            | Changes                   |
| ----------------------------------------------- | ------------------------- |
| `crown_crm/templates/base.html`                 | Add HTMX 2.0 handlers     |
| `crown_crm/leads/views.py`                      | Convert to CBV with mixin |
| `crown_crm/accounting/views.py`                 | Convert to CBV with mixin |
| `crown_crm/logistics/views.py`                  | Convert to CBV with mixin |
| `crown_crm/clients/views.py`                    | Convert to CBV with mixin |
| `crown_crm/organizations/views.py`              | Convert to CBV with mixin |
| `leads/forms/lead_create.html`                  | Use cotton components     |
| `accounting/partials/membership_sale_form.html` | Use cotton components     |
| All other form templates                        | Use cotton components     |
| All url files                                   | Update to CBV             |

---

## Status Code Reference

| Scenario             | Status Code | HTMX 2.0 Behavior        |
| -------------------- | ----------- | ------------------------ |
| Form invalid         | **422**     | Swap content with errors |
| Success (body)       | **200**     | Swap body into DOM       |
| Success (event only) | **204**     | No swap, fire event      |
| Delete               | **204**     | No swap, fire event      |
| CSRF/malformed       | **400**     | Swap error message       |

---

## Testing Checklist

1. [ ] Create lead with invalid data → Expect 422, error displayed
2. [ ] Create lead with valid data → Expect 204, modal closes
3. [ ] Create membership sale with invalid data → Expect 422
4. [ ] Create membership sale with valid data → Expect 200 with receipt body
5. [ ] Delete operations → Expect 204 with event
6. [ ] All forms use cotton components consistently
7. [ ] Client-side events fire correctly
8. [ ] Auto-focus on first invalid field works

---

## References

- django-cotton: https://github.com/wheatandcat/django-cotton
- django-htmx: https://django-htmx.readthedocs.io/
- HTMX 2.0: https://htmx.org/
