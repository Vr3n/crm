# Phase 2: Additional Components (P1 - Should Fix)

This phase adds missing components and standardizes patterns across the codebase.

## 2.1 Add c-form-errors Component

**File:** `crown_crm/templates/cotton/form_errors.html`

**Purpose:** Display non-field form errors (e.g., "End date must be after start date", "Lead already exists").

The current plan handles field errors but completely ignores non-field errors (`form.non_field_errors`).

### Implementation

```django-html
{% comment %}
c-form-errors: Display non-field form errors

Non-field errors are form-level validation messages that don't belong to a
specific field. Examples:
- "End date must be after start date"
- "This lead already exists in the system"
- "Payment amount cannot exceed remaining balance"

Args:
  form: The form instance (required)

Usage:
  <c-form-errors :form="lead_form" />
{% endcomment %}

<c-vars form />

{% if form.non_field_errors %}
<div class="alert alert-danger" role="alert">
  <strong>Please correct the following errors:</strong>
  <ul class="mb-0 mt-2">
    {% for error in form.non_field_errors %}
    <li>{{ error }}</li>
    {% endfor %}
  </ul>
</div>
{% endif %}
```

### Usage in Form Templates

Add `<c-form-errors :form="..." />` at the top of every form inside the modal:

```django-html
<c-modal-form
  title="Create New Lead"
  action="{% url 'leads:hx-create' %}"
  method="post"
  submit_label="Create Lead"
>
  <c-form-errors :form="lead_form" />

  <div class="row">
    <div class="col-md-4">
      <c-form-input :field="lead_form.first_name" />
    </div>
    <!-- ... -->
  </div>
</c-modal-form>
```

---

## 2.2 Add Formset Support

**File:** `crown_crm/templates/cotton/formset.html`

**Purpose:** Handle Django formsets (e.g., mobile numbers, emails in lead form).

### CRITICAL: Slot Pattern is Broken

The current plan uses `{{ slot }}` inside the loop, but **slots cannot access loop variables**. The slot content is rendered outside the for loop context.

**Solution:** Don't use a slot. Render fields directly in the form template, wrapping only the management form and errors.

### Implementation

```django-html
{% comment %}
c-formset: Django formset wrapper with management form

Django formsets allow handling multiple forms in one view. Common use cases:
- Lead has multiple mobile numbers
- Lead has multiple email addresses
- Order has multiple line items

IMPORTANT: This component does NOT use a slot. Fields must be rendered directly
in the parent template inside the {% for form in formset %} loop. This is a
limitation of django-cotton's slot implementation.

Args:
  formset: The formset instance (required)

Usage:
  <c-formset :formset="mobile_formset">
    {# NO SLOT - render fields directly #}
  </c-formset>

  {# In parent template: #}
  <c-formset :formset="mobile_formset" />
  {% for form in mobile_formset %}
    <c-form-input :field="form.mobile_number" />
  {% endfor %}
{% endcomment %}

<c-vars formset />

{# Management form - required for Django formsets #}
<div style="display: none;">
  {{ formset.management_form }}
</div>

{# Non-form errors (e.g., "Cannot delete last item") #}
{% if formset.non_form_errors %}
<div class="alert alert-danger">
  {% for error in formset.non_form_errors %}
  <div>{{ error }}</div>
  {% endfor %}
</div>
{% endif %}
```

### Usage in Form Templates (Correct Pattern)

```django-html
<c-modal-form title="Create Lead" ...>
  <c-form-errors :form="lead_form" />

  <c-form-input :field="lead_form.first_name" />

  <div class="card mb-3">
    <div class="card-header">Mobile Numbers</div>
    <div class="card-body">
      {# Wrap with formset component for management form #}
      <c-formset :formset="mobile_formset" />
      {% for form in mobile_formset %}
      <div class="row mb-2">
        <div class="col">
          <c-form-input :field="form.mobile_number" />
        </div>
        {% if form.instance.pk %}
        <div class="col-auto">
          <button type="button" class="btn btn-outline-danger"
                  hx-delete="{% url 'leads:hx-mobile-delete' form.instance.pk %}"
                  hx-target="#mobile-row-{{ form.instance.pk }}"
                  hx-swap="outerHTML">Delete</button>
        </div>
        {% endif %}
      </div>
      {% endfor %}
    </div>
  </div>
</c-modal-form>
```

---

## 2.3 Create HtmxFormsetMixin

**Problem:** The current pattern in views reimplements entire `post()` method, losing mixin benefits.

**Solution:** Extend HtmxFormsetMixin that handles formsets properly.

### Implementation

**File:** `crown_crm/core/mixins.py` (add new class)

```python
class HtmxFormsetMixin(HtmxFormMixin):
    """
    Mixin for HTMX form views with formsets.

    Subclasses MUST define:
        template_name: str
        form_class: type[Form]
        formset_classes: dict  # {'mobile': LeadMobileFormSet, 'email': LeadEmailFormSet}

    Usage:
        class HxCreateLeadView(HtmxFormsetMixin, View):
            template_name = "leads/forms/lead_create.html"
            form_class = LeadForm
            formset_classes = {
                'mobile': LeadMobileFormSet,
                'email': LeadEmailFormSet,
            }
            success_event = "lead-created"
    """
    formset_classes = None

    def get_formset_classes(self):
        if self.formset_classes is None:
            raise ImproperlyConfigured(
                f"{self.__class__.__name__} must define formset_classes"
            )
        return self.formset_classes

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        for name, formset_class in self.get_formset_classes().items():
            key = f'{name}_formset'
            context[key] = kwargs.get(key) or formset_class()
        return context

    def post(self, request, *args, **kwargs):
        form = self.get_form()
        formsets = {}
        all_valid = form.is_valid()

        for name, formset_class in self.get_formset_classes().items():
            formsets[name] = formset_class(request.POST, prefix=name)
            all_valid = all_valid and formsets[name].is_valid()

        if all_valid:
            self._object = form.save()
            for name, fs in formsets.items():
                fs.instance = self._object
                fs.save()
            return self.htmx_success()

        context = {f'{name}_formset': fs for name, fs in formsets.items()}
        return self.form_invalid(form, **context)
```

### Usage in Views (After Fix)

```python
class HxCreateLeadView(HtmxFormsetMixin, View):
    template_name = "leads/forms/lead_create.html"
    form_class = LeadForm
    formset_classes = {
        'mobile': LeadMobileFormSet,
        'email': LeadEmailFormSet,
    }
    success_event = "lead-created"

    # No post() override needed - mixin handles it!
    # Just get_context_data if you need extra context
```

---

## 2.4 Standardize Event Names (kebab-case)

**Change all event names from inconsistent format to kebab-case.**

**Rationale:** Custom event names with colons (`lead:create_success`) work but are verbose. Kebab-case (`lead-created`) is more readable and consistent with Django URL conventions.

### Event Name Mapping with View References

| View                         | File                   | Old Event                        | New Event                               |
| ---------------------------- | ---------------------- | -------------------------------- | --------------------------------------- |
| `HxCreateLeadView`           | leads/views.py         | `lead:create_success`            | `lead-created`                          |
| `HxUpdateLeadView`           | leads/views.py         | `lead:update_success`            | `lead-updated`                          |
| `HxDeleteLeadView`           | leads/views.py         | `lead:delete_success`            | `lead-deleted`                          |
| `HxQuickCreateLeadView`      | leads/views.py         | `lead:quick_create_success`      | `lead-created` + params `{quick: true}` |
| `HxCreateMembershipSaleView` | accounting/views.py    | `membership_sale:create_success` | `membership-sale-created`               |
| `HxCreatePaymentReceiptView` | accounting/views.py    | `receipt:create_success`         | `receipt-created`                       |
| `HxUpdatePaymentReceiptView` | accounting/views.py    | `receipt:update_success`         | `receipt-updated`                       |
| `HxDeletePaymentReceiptView` | accounting/views.py    | `receipt:delete_success`         | `receipt-deleted`                       |
| `HxUpdateSaleView`           | accounting/views.py    | `sale:update_success`            | `sale-updated`                          |
| `HxDeleteSaleView`           | accounting/views.py    | `sale:delete_success`            | `sale-deleted`                          |
| `HxCreateServiceView`        | logistics/views.py     | `service:create_success`         | `service-created`                       |
| `HxUpdateServiceView`        | logistics/views.py     | `service:update_success`         | `service-updated`                       |
| `HxDeleteServiceView`        | logistics/views.py     | `service:delete_success`         | `service-deleted`                       |
| `HxCreateProductView`        | logistics/views.py     | `product:create_success`         | `product-created`                       |
| `HxUpdateProductView`        | logistics/views.py     | `product:update_success`         | `product-updated`                       |
| `HxDeleteProductView`        | logistics/views.py     | `product:delete_success`         | `product-deleted`                       |
| `HxCreateClientView`         | clients/views.py       | `client:create_success`          | `client-created`                        |
| `HxDeleteClientView`         | clients/views.py       | `client:delete_success`          | `client-deleted`                        |
| `HxCreateOrganizationView`   | organizations/views.py | `organization:create_success`    | `organization-created`                  |
| `HxUpdateOrganizationView`   | organizations/views.py | `organization:update_success`   | `organization-updated`                  |

**Note on Quick Create:** `HxQuickCreateLeadView` uses `lead-created` with `{quick: true}` in event params. JS handler checks `evt.detail.quick` to distinguish:

```javascript
document.body.addEventListener("lead-created", function (evt) {
  if (evt.detail.quick) {
    // Auto-select in dropdown
  } else {
    // Show notification
  }
});
```

**Alternative (Phase 3+):** If more variants are added later (bulk import, API sync), consider separate event names:

- `lead-created` (standard form)
- `lead-created-quick` (quick create)
- `lead-created-bulk` (bulk import)

This avoids conditional logic in JS handlers - just add separate listeners.

### Update Pattern in Views

**Before:**

```python
class HxCreateLeadView(HtmxFormMixin, View):
    success_event = "lead:create_success"  # Old format
```

**After:**

```python
class HxCreateLeadView(HtmxFormMixin, View):
    success_event = "lead-created"  # New kebab-case format
```

### Update Pattern in JavaScript Handlers

**Before:**

```javascript
document.body.addEventListener("lead:create_success", function (evt) {
```

**After:**

```javascript
document.body.addEventListener("lead-created", function (evt) {
```

---

## Files to Create/Modify

| File                                          | Type   | Change                                   |
| --------------------------------------------- | ------ | ---------------------------------------- |
| `crown_crm/templates/cotton/form_errors.html` | Create | New component                            |
| `crown_crm/templates/cotton/formset.html`     | Create | New component (no slot)                  |
| `crown_crm/core/mixins.py`                    | Modify | Add HtmxFormsetMixin                     |
| `crown_crm/leads/views.py`                    | Modify | Use HtmxFormsetMixin, update event names |
| `crown_crm/accounting/views.py`               | Modify | Update event names                       |
| `crown_crm/logistics/views.py`                | Modify | Update event names                       |
| `crown_crm/clients/views.py`                  | Modify | Update event names                       |
| `crown_crm/organizations/views.py`            | Modify | Update event names                       |
| `crown_crm/templates/base.html`               | Modify | Update JS event handlers                 |

---

## Implementation Order

1. Create `crown_crm/templates/cotton/form_errors.html`
2. Create `crown_crm/templates/cotton/formset.html` (no slot pattern)
3. Add `HtmxFormsetMixin` to `crown_crm/core/mixins.py`
4. Update lead views to use HtmxFormsetMixin
5. Update all views with new event names
6. Update base.html JS event handlers

---

## Verification

After implementation, verify:

1. Non-field errors display properly in forms using c-form-errors
2. Formsets render correctly with management form (no slot, direct loop)
3. Views use HtmxFormsetMixin instead of overriding post()
4. All event names follow kebab-case pattern
5. JavaScript listeners use matching event names
6. lead-created event fired for both regular and quick create (or distinguish if needed)
