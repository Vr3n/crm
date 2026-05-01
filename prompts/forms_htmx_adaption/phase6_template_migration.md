# Phase 6: Template Migration

This phase migrates all form templates to use the cotton components built in Phases 1-4.

## Current State: Cotton Components NOT Used

| What We Built (Phases 1-4) | What's Actually Used                                      |
| -------------------------- | --------------------------------------------------------- |
| `c-form-input`             | Manual `{{ form.field }}`                                 |
| `c-form-select`            | Manual `{{ form.field }}`                                 |
| `c-form-errors`            | Manual `{% if form.non_field_errors %}`                   |
| `c-form-wrapper`           | Manual `<form>` tag (NEW - replaces c-modal-form)         |
| `c-form-hidden`            | Manual hidden input (NEW - needed for organization field) |
| `c-submit-button`          | Manual `<button type="submit">`                           |
| `c-formset`                | Manual formset rendering                                  |

## Senior Review Corrections

### 1. Modal Architecture Conflict (CRITICAL)

**Problem**: `base.html` has a global `#modal-container` with `#modal-form` as the target. The `c-modal-form` component creates its own modal markup. These will conflict.

**Solution**: Don't use `c-modal-form`. Instead, use the existing `#modal-container` pattern with a new `c-form-wrapper` component.

**New Component - c-form-wrapper**:

```django-html
<c-vars action method="post" attrs="" />
<form hx-{{ method }}="{{ action }}" hx-target="this" hx-swap="outerHTML" {{ attrs }}>
  {% csrf_token %}
  {{ slot }}
</form>
```

**Usage Pattern**:

```django-html
<!-- Trigger loads form into #modal-form -->
<button hx-get="{% url 'leads:hx-create' %}" hx-target="#modal-form">Create</button>

<!-- Form template (loaded into #modal-form) -->
<c-form-wrapper action="{% url 'leads:hx-create' %}" method="post">
  <c-form-errors :form="lead_form" />
  <c-form-input :field="lead_form.first_name" />
  <c-submit-button label="Create" />
</c-form-wrapper>
```

### 2. MembershipSaleCreateForm - organization kwarg

**Current issue**: Form has `kwargs.pop("organization", None)` but doesn't use it.

**Fix**: Either:

- Remove the `pop` if organization isn't needed, OR
- Store it: `self.organization = kwargs.pop("organization", None)` and use for lead queryset filtering

### 3. LeadCreateForm - Hidden Field Handling

**Current issue**: `organization` is in `Meta.fields` with `HiddenInput` widget. `c-form-input` will render hidden fields as visible text inputs.

**Solution**: Create `c-form-hidden` component:

```django-html
<c-vars field />
<input type="hidden" name="{{ field.html_name }}" id="{{ field.id_for_label }}" value="{{ field.value|default:'' }}" />
```

Or: Exclude `organization` from form fields entirely and set it in the view's `form_valid()`.

---

## Forms Inventory by Module

### leads/forms.py

| Form                               | Fields                                                      | Widget     | Template Usage           |
| ---------------------------------- | ----------------------------------------------------------- | ---------- | ------------------------ |
| `LeadCreateForm`                   | first_name, middle_name, last_name, source, organization    | TextInput  | lead_create.html         |
| `LeadAddressForm`                  | flat_building, area, landmark, street, state, city, pincode | TextInput  | lead_create.html         |
| `LeadMobileNumberForm`             | mobile_number                                               | TextInput  | mobile_form_row.html     |
| `LeadEmailForm`                    | email                                                       | EmailInput | email_form_row.html      |
| `LeadMobileNumberTableForm`        | mobile_number                                               | TextInput  | mobile_number_table.html |
| `LeadEmailAddressTableForm`        | email                                                       | EmailInput | email_address_table.html |
| **Formset**: `MobileNumberFormSet` | -                                                           | -          | lead_create.html         |
| **Formset**: `EmailFormSet`        | -                                                           | -          | lead_create.html         |

### accounting/forms.py

| Form                       | Fields                                                                                                                      | Widget                                    | Template Usage                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `MembershipSaleCreateForm` | lead, duration_preset, membership_start_date, membership_end_date, base_price, price, payment_amount, payment_method, notes | TextInput, Select, DateInput, NumberInput | membership_sale_form.html, partial/membership_sale_form.html |
| `PaymentReceiptForm`       | amount, method, reference, notes                                                                                            | NumberInput, Select, TextInput, Textarea  | payment_receipt_form.html                                    |

### logistics/forms.py

| Form                | Fields                                                                            | Widget                                                   | Template Usage    |
| ------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------- |
| `ServiceCreateForm` | name, code, description, price, category, type, sessions_count, subscription_type | TextInput, Textarea, NumberInput, Select, SelectMultiple | service_form.html |
| `ProductCreateForm` | name, description, price, sku, hsn, category                                      | TextInput, Textarea, NumberInput, SelectMultiple         | product_form.html |

### clients/forms.py

| Form                                     | Fields                                     | Widget            | Template Usage           |
| ---------------------------------------- | ------------------------------------------ | ----------------- | ------------------------ |
| `ClientComprehensiveForm`                | first_name, middle_name, last_name, gender | TextInput, Select | client_create.html       |
| `ClientMobileNumberForm`                 | mobile_number                              | TextInput         | mobile_number_table.html |
| `ClientEmailForm`                        | email                                      | EmailInput        | email_address_table.html |
| **Formset**: `ClientMobileNumberFormSet` | -                                          | -                 | client_create.html       |
| **Formset**: `ClientEmailFormSet`        | -                                          | -                 | client_create.html       |

### organizations/forms.py

| Form                     | Fields                                        | Widget                                     | Template Usage           |
| ------------------------ | --------------------------------------------- | ------------------------------------------ | ------------------------ |
| `OrganizationCreateForm` | name, logo, description, mobile_number, email | TextInput, FileInput, Textarea, EmailInput | create-organization.html |

---

## Templates Requiring Updates

### Priority P0 - Core Forms (Used by HxCreate/HxEdit Views)

| Template                                        | Form(s)                  | Action                                                          |
| ----------------------------------------------- | ------------------------ | --------------------------------------------------------------- |
| `leads/forms/lead_create.html`                  | LeadCreateForm, formsets | Replace `{{ form.field }}` with `c-form-input`, `c-form-select` |
| `leads/forms/lead_form.html`                    | LeadCreateForm, formsets | Replace `{{ form.field }}` with components                      |
| `accounting/partials/membership_sale_form.html` | MembershipSaleCreateForm | Replace manual inputs with components                           |
| `accounting/forms/payment_receipt_form.html`    | PaymentReceiptForm       | Replace manual inputs with components                           |

### Priority P1 - Other Form Templates

| Template                                       | Form(s)                           | Action                |
| ---------------------------------------------- | --------------------------------- | --------------------- |
| `logistics/forms/service_form.html`            | ServiceCreateForm                 | Replace manual inputs |
| `logistics/forms/product_form.html`            | ProductCreateForm                 | Replace manual inputs |
| `clients/forms/client_create.html`             | ClientComprehensiveForm, formsets | Replace manual inputs |
| `organizations/forms/create-organization.html` | OrganizationCreateForm            | Replace manual inputs |

### Priority P2 - Inline/Row Templates

| Template                                 | Form(s)                     | Action                      |
| ---------------------------------------- | --------------------------- | --------------------------- |
| `leads/forms/mobile_form_row.html`       | LeadMobileNumberForm        | Replace with `c-form-input` |
| `leads/forms/email_form_row.html`        | LeadEmailForm               | Replace with `c-form-input` |
| `leads/forms/mobile_number_table.html`   | LeadMobileNumberTableForm   | Replace                     |
| `leads/forms/email_address_table.html`   | LeadEmailAddressTableForm   | Replace                     |
| `clients/forms/mobile_number_table.html` | ClientMobileNumberTableForm | Replace                     |
| `clients/forms/email_address_table.html` | ClientEmailAddressTableForm | Replace                     |

---

## Migration Patterns

### Pattern 1: Text Input (Current → Target)

**Current:**

```django-html
<label>First Name</label>
{{ lead_form.first_name }}
{% if lead_form.first_name.errors %}
<div class="invalid-feedback d-block">
  {{ lead_form.first_name.errors }}
</div>
{% endif %}
```

**Target:**

```django-html
<c-form-input :field="lead_form.first_name" />
```

### Pattern 2: Select Dropdown (Current → Target)

**Current:**

```django-html
<label>Source</label>
{{ lead_form.source }}
```

**Target:**

```django-html
<c-form-select :field="lead_form.source" />
```

### Pattern 3: Non-Field Errors (Add)

**Add at top of every form:**

```django-html
<c-form-errors :form="lead_form" />
```

### Pattern 4: Submit Button (Current → Target)

**Current:**

```django-html
<button type="submit" class="btn btn-primary">Create Lead</button>
```

**Target:**

```django-html
<c-submit-button label="Create Lead" />
```

### Pattern 5: Form Wrapper (Current → Target)

**Current:**

```django-html
<form hx-post="..." hx-target="#modal-body" hx-swap="none">
```

**Target (use existing modal infrastructure):**

```django-html
<!-- Form loads into #modal-form (handled by base.html modal) -->
<c-form-wrapper action="..." method="post">
  {{ slot }}
</c-form-wrapper>
```

**Note**: Don't use `c-modal-form` - it conflicts with existing `#modal-container` in `base.html`. Keep using the existing modal infrastructure.

### Pattern 5b: Hidden Field (Current → Target)

**Current:**

```django-html
{{ lead_form.organization }}
```

**Target (NEW - need c-form-hidden component):**

```django-html
<!-- Option A: Use new c-form-hidden component -->
<c-form-hidden :field="lead_form.organization" />

<!-- Option B: Exclude from form, set in view's form_valid() -->
<!-- Remove organization from Meta.fields, set in view instead -->
```

### Pattern 6: Formset (Current → Target)

**Current:**

```django-html
{{ mobile_formset.management_form }}
{% for form in mobile_formset %}
  {{ form.mobile_number }}
{% endfor %}
```

**Target:**

```django-html
<c-formset :formset="mobile_formset" />
{% for form in mobile_formset %}
  <c-form-input :field="form.mobile_number" />
{% endfor %}
```

---

## HTMX Attribute Updates Needed

| Template                                      | Current                      | Fix To                                |
| --------------------------------------------- | ---------------------------- | ------------------------------------- |
| leads/forms/lead_create.html                  | hx-swap="none"               | hx-target="this", hx-swap="outerHTML" |
| payment_receipt_form.html                     | hx-target="#modal-container" | hx-target="this"                      |
| accounting/partials/membership_sale_form.html | None                         | Add hx-post, hx-target                |

---

## Implementation Order

### Step 0: Create Missing Cotton Components

1. Create `c-form-wrapper` component (replaces c-modal-form usage)
2. Create `c-form-hidden` component (for hidden fields like organization)

### Step 1: Fix Form Issues

1. **MembershipSaleCreateForm**: Fix `organization` kwarg handling in `__init__`
2. **LeadCreateForm**: Exclude `organization` from fields OR use `c-form-hidden`

### Step 2: Fix HTMX attributes on existing forms (to make 422 work)

1. `leads/forms/lead_create.html` - Fix hx-post/hx-target/hx-swap

### Step 3: Replace simple fields with c-form-input

1. Update all text inputs
2. Update all number inputs
3. Update all email inputs
4. Update all date inputs

### Step 4: Replace select fields with c-form-select

1. Update all Select widgets
2. Update all SelectMultiple (if supported)

### Step 5: Handle hidden fields

1. Use `c-form-hidden` for hidden inputs (organization field)
2. OR exclude hidden fields from form and set in view

### Step 6: Add c-form-errors

1. Add to all form templates at the top

### Step 7: Replace submit buttons

1. Use c-submit-button throughout

### Step 8: Wrap forms with c-form-wrapper

1. Replace manual `<form>` tags with `c-form-wrapper`
2. Keep using existing `#modal-container` infrastructure

---

## Files to Modify

### New Cotton Components (2 files)

| File                         | Purpose                                         |
| ---------------------------- | ----------------------------------------------- |
| `cotton/c-form-wrapper.html` | Replace c-modal-form - wraps form with hx attrs |
| `cotton/c-form-hidden.html`  | Render hidden input fields                      |

### Form Fixes (2 files)

| File                  | Fix                                                  |
| --------------------- | ---------------------------------------------------- |
| `accounting/forms.py` | Fix organization kwarg in MembershipSaleCreateForm   |
| `leads/forms.py`      | Exclude organization from fields OR handle as hidden |

### Templates (16 files)

| File                                            | Changes                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `leads/forms/lead_create.html`                  | All patterns - c-form-input, c-form-select, c-formset, c-form-errors, hx-attrs |
| `leads/forms/lead_form.html`                    | All patterns                                                                   |
| `leads/forms/mobile_form_row.html`              | c-form-input                                                                   |
| `leads/forms/email_form_row.html`               | c-form-input                                                                   |
| `leads/forms/mobile_number_table.html`          | c-form-input                                                                   |
| `leads/forms/email_address_table.html`          | c-form-input                                                                   |
| `accounting/forms/membership_sale_form.html`    | c-form-input, c-form-select, c-form-errors                                     |
| `accounting/partials/membership_sale_form.html` | All patterns, hx-post attributes                                               |
| `accounting/forms/payment_receipt_form.html`    | c-form-input, c-form-select                                                    |
| `logistics/forms/service_form.html`             | c-form-input, c-form-select                                                    |
| `logistics/forms/product_form.html`             | c-form-input, c-form-select                                                    |
| `clients/forms/client_create.html`              | c-form-input, c-form-select, c-formset                                         |
| `clients/forms/mobile_number_table.html`        | c-form-input                                                                   |
| `clients/forms/email_address_table.html`        | c-form-input                                                                   |
| `organizations/forms/create-organization.html`  | c-form-input, c-form-select                                                    |

---

## Verification Checklist

| Test             | Expected Result                       |
| ---------------- | ------------------------------------- |
| Form loads (GET) | Fields rendered via cotton components |
| Submit valid     | 204 + success event                   |
| Submit invalid   | 422 + form re-rendered with errors    |
| Non-field errors | Shown via c-form-errors               |
| Loading state    | Spinner shows via htmx-indicator      |
| hx-swap on 422   | Form replaces itself in modal         |

---

## Summary

- **2 new cotton components** needed: c-form-wrapper, c-form-hidden
- **2 form fixes** needed: MembershipSaleCreateForm, LeadCreateForm
- **16 form templates** need updating
- **~20 forms** across 5 modules need mapping to cotton components
- **Pattern-based migration** - systematic find/replace approach
- **P0 priority**: Core HTMX views (lead create/edit, membership sale, payment receipt)
- **Key decision**: Use existing `#modal-container` infrastructure, NOT c-modal-form
