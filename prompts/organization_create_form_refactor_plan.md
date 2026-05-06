# Organization Create Form Refactor Plan

## Overview

Refactor the organization create form to make mobile number and email strictly required, following the same validation pattern as leads.

## Reference Pattern

The leads module implements this pattern:

- `crown_crm/leads/forms.py`: `LeadMobileNumberForm` uses `required=False` (optional) but validates 10-digit format
- `crown_crm/leads/views.py`: Uses formsets with proper validation
- `crown_crm/templates/leads/forms/lead_create.html`: Error display with alerts + SweetAlert

**We will adapt this pattern for organizations with required=True.**

---

## Current State (to change)

### Forms (`crown_crm/organizations/forms.py`)

**`OrganizationCreateForm`:**

- `mobile_number`: `required=False` - needs to be `required=True`
- `mobile_number` regex: Too permissive pattern - needs to use `r'^\d{10}$'`
- `email`: `required=False` - needs to be `required=True`

### Views (`crown_crm/organizations/views.py`)

**`hx_organization_create_view`:**

- Does not properly validate mobile/email before saving
- Does not re-render form with errors on validation failure

### Template (`crown_crm/templates/organizations/forms/create-organization.html`)

- Simple crispy form only
- No error alert display

---

## Questions for Senior Review (ANSWERED)

1. **Display style:** Should the organization create form use web components like leads (`<c-form-input :field="..." />`) or keep crispy forms?
   - **ANSWER: Use web components like leads (for consistency across all modules)**

2. **Layout:** Should we separate mobile/email into formsets like leads does (with add buttons for multiple), or keep them as single fields in OrganizationCreateForm?
   - **ANSWER: Keep single fields only. No formsets for now.**

---

## Implementation Steps (Updated)

### Step 1: Update Forms (`crown_crm/organizations/forms.py`)

Make these changes in `OrganizationCreateForm`:

1. **Change `mobile_number` to required:**

   ```python
   mobile_number = forms.CharField(
       min_length=10,
       max_length=10,
       validators=[
           RegexValidator(
               regex=r'^\d{10}$',
               message="Enter a valid 10-digit mobile number (digits only)",
           )
       ],
       required=True,
       widget=forms.TextInput(
           attrs={
               "class": "form-control",
               "inputmode": "numeric",
               "maxlength": "10",
               "pattern": r"\d{10}",
               "placeholder": "10-digit mobile number",
           }
       ),
   )
   ```

2. **Change `email` to required:**

   ```python
   email = forms.EmailField(
       required=True,
       widget=forms.EmailInput(
           attrs={
               "class": "form-control",
               "placeholder": "email@example.com",
           }
       ),
   )
   ```

3. **Update crispy FormHelper layout** to remove crispy column wrappers (use web components in template)

### Step 2: Update Views (`crown_crm/organizations/views.py`)

In `hx_organization_create_view`:

1. On validation failure, re-render with error event:

   ```python
   if not org_form.is_valid():
       context = {"form": org_form}
       res = render(request, "organizations/forms/create-organization.html", context)
       res = trigger_client_event(
           res,
           "message",
           {"level": "error", "message": "Please fix the form errors."},
       )
       return res
   ```

2. Validate mobile and email are provided

### Step 3: Update Template (`crown_crm/templates/organizations/forms/create-organization.html`)

Use web components like leads:

1. Use `<c-form-wrapper>` for form wrapper
2. Add error alert box
3. Use `<c-form-input :field="form.name" />` etc.
4. Add `<c-submit-button label="Save Organization" />`
5. Add SweetAlert JS for form errors

---

## Files to Modify

1. `crown_crm/organizations/forms.py` - `OrganizationCreateForm` class
2. `crown_crm/organizations/views.py` - `hx_organization_create_view` function
3. `crown_crm/templates/organizations/forms/create-organization.html` - Template
