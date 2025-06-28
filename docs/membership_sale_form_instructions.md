
# 📋 Membership Sale Form – Implementation Instructions

Implement using: `Django 5.0`, `HTMX 2.0`, `Bootstrap 4.6`, `Select2.js`, `JavaScript`, `jQuery`

---

## ✅ Form Flow Overview

Build a single unified Membership Sale form with three main sections:

1. Lead Selection / Creation  
2. Membership Plan Selection / Creation  
3. Payment Information  

---

## ✅ 1. Lead Selection with Fallback Creation

### 🧠 Logic

- If user **selects an existing Lead** (via Select2 dropdown):
  - Populate fields using `/leads/<id>/fill/` (HTMX).
- If **no Lead is selected**, check if a new lead form was filled:
  - Backend should **create the Lead** from the submitted data before creating the `MembershipSale`.

### ⚠️ Instructions for LLM

- In the view:
  ```python
  if not request.POST.get('lead'):
      # Parse lead fields from POST data and create a new Lead instance
  else:
      # Fetch existing Lead by ID
  ```

- Validate duplicate email/mobile.
- Return errors inline via HTMX if creation fails.

---

## ✅ 2. Membership Plan Selection with Fallback Creation

### 🧠 Logic

- If a Membership Plan is selected:
  - Populate fields using `/plans/<id>/fill/` (HTMX).
- If **no plan selected**, but fields like plan name/duration/price are filled:
  - Backend should **create a new MembershipPlan**.

### ⚠️ Instructions for LLM

- In the view:
  ```python
  if not request.POST.get('plan'):
      # Parse plan fields from POST and create a MembershipPlan
  else:
      # Fetch existing Plan by ID
  ```

- Ensure no duplicate plan exists (name + duration).
- Return errors inline if creation fails.

---

## ✅ 3. Payment Section

- Accept:
  - Payment mode (dropdown)
  - Amount paid (validated)
- Validate amount is > 0 and does not exceed decided amount.
- Automatically create a `PaymentReceipt`.

---

## ✅ 4. Form Submission (HTMX)

- Submit using `hx-post` to a Django view.
- Use `@transaction.atomic` in view to:
  - Conditionally create Lead and Plan
  - Create `MembershipSale`
  - Create `PaymentReceipt`
- Return success block or form with error messages.

---

## ✅ 5. UX and Error Handling

### Frontend
- Show clear error messages if:
  - Lead already exists (duplicate email)
  - Required fields are missing
- Disable submit on form submit.
- Show spinner/loading while waiting.
- Display toast or inline confirmation on success.

### Backend
- Use structured JSON errors or HTMX-friendly partials for re-rendering forms.
- Log and handle any unexpected exceptions.

---

## ✅ 6. Performance Notes

- Index searchable fields: `lead.name`, `email`, `plan.name`
- Paginate Select2 AJAX calls
- Avoid double submission via debounced submit button

---

## 📌 Final Developer Reminder

> ✅ The view must handle both dropdown selections and inline creations.  
> 🧪 Test:  
> 1. Existing lead + plan  
> 2. New lead + existing plan  
> 3. Existing lead + new plan  
> 4. New lead + new plan  
