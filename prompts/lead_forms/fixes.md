# Lead Form Fixes

## Issue: Organization ID not attached to lead form

### Problem
The `lead_form` in the HTML has a hidden `organization` field, but it's never populated with the organization ID when the form is rendered. The hidden field renders as empty (`<input type="hidden" name="organization" value="">`), causing the form submission to fail validation.

### Current Flow

1. **Form Definition** (`crown_crm/leads/forms.py`):
   - `LeadCreateForm` has `organization` field with `HiddenInput()` widget ✓
   - Field is in `Meta.fields` list

2. **View** (`crown_crm/leads/views.py`):
   - `HxCreateLeadView` does NOT pass `organization` to `get_form_kwargs()`
   - Other views (`HxEditLeadView`, `HxQuickCreateLeadView`) DO pass it
   - This is why `HxCreateLeadView` fails

3. **HTML Template** (`crown_crm/templates/leads/forms/lead_create.html`):
   - Has `<c-form-hidden :field="lead_form.organization" />` but it renders empty

### Root Cause
`HxCreateLeadView.get_form_kwargs()` doesn't include `organization`, unlike the other views.

### Solution

**Option A: Add `get_form_kwargs()` to view (Recommended)**

In `HxCreateLeadView`, add:

```python
def get_form_kwargs(self):
    kwargs = super().get_form_kwargs()
    kwargs['organization'] = self.request.organization
    return kwargs
```

This is exactly what `HxEditLeadView` and `HxQuickCreateLeadView` already do.

**Option B: Auto-set in form's `__init__`**

In `LeadCreateForm.__init__()`, detect organization from request and auto-set:

```python
def __init__(self, *args, **kwargs):
    organization = kwargs.pop('organization', None)
    super().__init__(*args, **kwargs)
    if organization:
        self.fields['organization'].initial = organization
```

Option A is preferred because:
- It's consistent with other views
- Organization comes from request object (already available)
- It's explicit and easy to understand

### Files to Modify

1. **crown_crm/leads/views.py** - Add `get_form_kwargs()` method to `HxCreateLeadView`

### Verification

After fix:
- Hidden organization field should have value in HTML: `<input type="hidden" name="organization" value="<org-id>">`
- Form submission should work without "organization is required" error

---

## Other Fixes (from fixes.md)

### Mobile Number Formset
- 10 digits max - already done
- Only digits allowed - already done
- Errors should render - already done (removed alert divs, added SweetAlert loop)

### Email Formset
- Usual email validation - already done
- Errors should render - already done (removed alert divs, added SweetAlert loop)

### Required Fields
- Validated as required - already done in form definition