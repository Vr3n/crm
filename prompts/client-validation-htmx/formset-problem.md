# HTMX Formset Implementation Plan

## Problem Summary

When submitting a form with Django formsets via HTMX, the management form hidden fields are not being properly included in the POST request, causing Django formset validation to fail.

## Root Cause

The management form `{{ mobile_formset.management_form }}` is rendered **OUTSIDE** the HTMX swap target (`#mobile-formset-container`). When HTMX swaps content, the management form becomes stale.

---

## Implementation Plan

### Task 1: Fix lead_create.html Template
**File**: `crown_crm/templates/leads/forms/lead_create.html`

Move `{{ mobile_formset.management_form }}` INSIDE `#mobile-formset-container` for both mobile and email formsets.

**Current (WRONG)**:
```html
{% for hidden in mobile_formset.management_form.hidden_fields %}
  {{ hidden }}
{% endfor %}
<div id="mobile-formset-container" class="card-body">
  {% for form in mobile_formset %}
```

**Target (CORRECT)**:
```html
<div id="mobile-formset-container" class="card-body">
  {{ mobile_formset.management_form }}
  {% for form in mobile_formset %}
```

### Task 2: Fix HtmxFormsetMixin.get() Method
**File**: `crown_crm/core/mixins.py`

Override `get()` in `HtmxFormsetMixin` to pass formsets on initial render.

```python
class HtmxFormsetMixin(HtmxFormMixin):
    def get(self, request, *args, **kwargs):
        form = self.get_form()
        extra = {}
        for name, formset_class in self.get_formset_classes().items():
            extra[f'{name}_formset'] = formset_class(prefix=name)
        return self.render_form(form, extra_context=extra)

    def post(self, request, *args, **kwargs):
        # ... existing code ...
```

This ensures `mobile_formset` and `email_formset` are available on initial GET render with proper `total_form_count()` values.

### Task 3: Optional - Friendly Error Message
**File**: `crown_crm/leads/forms.py`

Override formset error messages to show user-friendly message instead of "(Hidden field TOTAL_FORMS) This field is required."

```python
from django.forms import BaseFormSet
from django.utils.translation import gettext_lazy as _

class SafeFormSet(BaseFormSet):
    default_error_messages = {
        'missing_management_form': _(
            'Form data is incomplete. Please refresh the page and try again.'
        ),
    }
```

---

## Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `crown_crm/templates/leads/forms/lead_create.html` | Move management_form inside formset containers |
| 2 | `crown_crm/core/mixins.py` | Override `get()` in HtmxFormsetMixin to pass formsets on GET |
| 3 | `crown_crm/leads/forms.py` | (Optional) Add SafeFormSet with friendly error messages |

## Test Checklist

- [ ] Submit invalid form → Field-level errors display correctly
- [ ] No "(Hidden field TOTAL_FORMS) This field is required." error
- [ ] Add formset row works correctly
- [ ] Form submits successfully with valid data

---

## Key Differences from lead_form.html

| Aspect | lead_form.html (WORKS) | lead_create.html (BROKEN) |
|--------|------------------------|---------------------------|
| Management form location | Inside `#mobile-formset-container` | Outside container |
| Management form render | `{{ mobile_formset.management_form }}` | `{% for hidden in ... %}` |
| Swap target | `#mobile-formset-container` | Same |

**Copy the lead_form.html pattern exactly.**