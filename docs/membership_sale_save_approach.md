# Approach: Persisting Membership Sale and Generating First Payment Receipt

_Last updated: 2025-06-27_

## 1. Data Flow
1. User completes `membership_sale_form.html`.
2. The form submits **one** HTMX POST request to `hx_create_membership_sale` containing:
   - Lead ID, Membership Type ID, Plan ID
   - Customisation fields (`custom_price`, `custom_duration`, `custom_pt_sessions`, `custom_diet_plans`)
   - `decided_amount` (agreed sale amount)
   - `payment_amount` and `payment_method` (first instalment)
   - Optional `notes`

## 2. `MembershipSaleCreateForm`
Custom Django `ModelForm` for `MembershipSale` with **extra** non-model fields:

| Field           | Type | Validation |
|-----------------|------|------------|
| payment_amount  | Decimal | `>= 0` and `<= decided_amount` |
| payment_method  | Choice (matches `PaymentReceipt.Method`) | required if `payment_amount > 0` |
| custom_price / duration / pt_sessions / diet_plans | Various | If any present → `is_customized = True`; must respect positive / choices rules |

Additional clean-methods:
* `clean_decided_amount` → positive.
* `clean()` → compute `discount_percentage`.

Helper `save_and_create_receipt()` encapsulates atomic save + first receipt creation.

## 3. Atomic Save Logic
```python
with transaction.atomic():
    sale = form.save(commit=False)
    sale.organization = request.organization
    sale.save()

    if payment_amount > 0:
        PaymentReceipt.objects.create(
            sale=sale,
            organization=request.organization,
            amount=payment_amount,
            method=payment_method,
            opening_balance=sale.decided_amount,
            closing_balance=sale.decided_amount - payment_amount,
        )
```

## 4. HTMX Response
* On success → `HttpResponse(status=204)` + `trigger_client_event(
  "membership_sale_create_success", {"sale_uuid": sale.uuid, "redirect_url": f"/sales/{sale.uuid}/"})`.
* On errors → return form partial with field/​non-field errors for inline swap.

## 5. Error Handling & Integrity
* Form handles all user-level validation.
* Model `clean()` continues to enforce domain rules.
* `PaymentReceipt.save()` already maintains balance snapshots.

## 6. Advantages
* Single transaction, no half-saved objects.
* Validation logic reusable in tests & non-HTMX views.
* Front-end receives consistent events to update UI or redirect.

---

Next steps:
1. Add `MembershipSaleCreateForm` to `accounting/forms.py`.
2. Update `hx_create_membership_sale` (new or replace) to use the new form and helper.
3. Adjust template to use the correct endpoint and include `payment_amount` + `payment_method` fields.
