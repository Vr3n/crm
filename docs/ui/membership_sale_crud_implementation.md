# Membership Sale CRUD – High-Level Implementation Plan

## 1. URLs
```
accounting/urls.py
└─ /sales/                  → SalesListView          (GET page)
└─ /sales/<uuid:pk>/        → SaleDetailView         (GET page)
└─ /hx/sales/table/         → hx_sales_table         (partial – table body)
└─ /hx/sales/<uuid:pk>/     → hx_sale_detail         (partial – detail card)
└─ /hx/sales/create/        → hx_sale_create         (modal form)
└─ /hx/sales/<uuid:pk>/edit → hx_sale_update         (modal form)
└─ /hx/sales/<uuid:pk>/del  → hx_sale_delete         (modal confirm)
```
* All `hx_*` routes return HTML fragments and emit `trigger_client_event`.
* Non-HTMX views serve full pages (`…/sales/`, `…/sales/<pk>/`).

---

## 2. Forms
- `MembershipSaleForm` (with `start_date`, Select2 widgets, date-picker)
- Validation for price, discount, sessions, start date

---

## 3. Templates (structure mirrors logistics/products)
```
templates/accounting/
    sales.html                 (page wrapper)
    sale_detail.html           (page wrapper)
    tables/sales_table.html    (table rows fragment)
    partials/sale_detail.html  (detail card fragment)
    forms/sale_form.html       (modal form)
```
- Table rows use feather icons and htmx for edit/delete
- Modal forms leverage Bootstrap 4.6, htmx, and accessibility

---

## 4. Views
- CBVs for List/Detail, HTMX helpers for create/update/delete
- Robust error handling, HTMX events for table refresh

---

## 5. JS Initialisation
- Select2 and date-picker initialised on modal swap
- No HTMX in JS, only initialisation

---

## 6. Client Events
- On create/update/delete, trigger table refresh via htmx event

---

## 7. Tests
- CRUD flows, validation edge cases, HTMX event headers

---

## 8. Documentation
- This file (high-level)
- `ui/membership_sale_form_ui.md` (UX/UI)
- `backend/membership_sale_crud.md` (API, events, validation)

---

## 9. Roll-out Order
1. Finish form tweaks
2. Scaffold templates
3. Implement views & URLs
4. Add JS
5. Write tests
6. Document backend
