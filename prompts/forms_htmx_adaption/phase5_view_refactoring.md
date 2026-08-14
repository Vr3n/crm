# Phase 5: View Refactoring to Use Mixins

This phase refactors existing function-based HTMX views to use the new mixins from `crown_crm/core/mixins.py`.

## Current State

The mixins exist but **zero views use them**. All HTMX views are function-based with manual pattern duplication.

## Target Pattern

### Before (Current - Function-Based)

```python
# crown_crm/leads/views.py - Current pattern
@require_http_methods(["POST"])
def hx_create_lead(request: OrgHttpRequest) -> HttpResponse:
    form = LeadCreateForm(request.POST)
    mobile_formset = MobileNumberFormSet(request.POST, prefix="mobile")
    email_formset = EmailFormSet(request.POST, prefix="email")

    if form.is_valid() and mobile_formset.is_valid() and email_formset.is_valid():
        lead = form.save()
        mobile_formset.instance = lead
        email_formset.instance = lead
        mobile_formset.save()
        email_formset.save()

        res = render(request, "leads/forms/lead_create.html")
        res = trigger_client_event(res, "message", {"level": "success", "message": "Created!"})
        res = trigger_client_event(res, "lead-created")
        return res

    context = {
        "lead_form": form,
        "mobile_formset": mobile_formset,
        "email_formset": email_formset,
    }
    return render(request, "leads/forms/lead_create.html", context)
```

### After (Target - Class-Based with Mixin)

```python
# crown_crm/leads/views.py - Target pattern
from django.views import View
from crown_crm.core.mixins import HtmxFormsetMixin


class HxCreateLeadView(HtmxFormsetMixin, View):
    """Create lead with formsets using HtmxFormsetMixin."""

    template_name = "leads/forms/lead_create.html"
    form_class = LeadCreateForm
    formset_classes = {
        'mobile': MobileNumberFormSet,
        'email': EmailFormSet,
    }
    success_event = "lead-created"
    success_status = 204

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Add address form to context
        context['address_form'] = kwargs.get('address_form') or LeadAddressForm(self._request.POST or None)
        return context

    def form_valid(self, form):
        """Handle valid form + formsets - use custom save for address form."""
        lead = form.save()

        # Save formsets
        for name, fs in self.formsets.items():
            fs.instance = lead
            fs.save()

        # Save address form (needs lead instance)
        address_form = LeadAddressForm(self._request.POST)
        if address_form.is_valid():
            address_form.instance = lead
            address_form.save()

        self._object = lead
        return self.htmx_success()

    # NOTE: Don't override form_invalid() - use get_context_data() instead
    # The mixin's form_invalid() will call render_form which calls get_context_data
```

---

## View Inventory

### leads/views.py

| Current Function       | Target Class            | Mixin to Use     | Priority |
| ---------------------- | ----------------------- | ---------------- | -------- |
| `hx_create_lead`       | `HxCreateLeadView`      | HtmxFormsetMixin | P0       |
| `hx_edit_lead`         | `HxEditLeadView`        | HtmxFormsetMixin | P0       |
| `hx_delete_lead`       | `HxDeleteLeadView`      | HtmxDeleteMixin  | P1       |
| `hx_quick_create_lead` | `HxQuickCreateLeadView` | HtmxFormMixin    | P1       |
| N/A (mobile add)       | `HxAddMobileView`       | HtmxFormMixin    | P2       |
| N/A (mobile delete)    | `HxDeleteMobileView`    | HtmxDeleteMixin  | P2       |
| N/A (email add)        | `HxAddEmailView`        | HtmxFormMixin    | P2       |
| N/A (email delete)     | `HxDeleteEmailView`     | HtmxDeleteMixin  | P2       |

### accounting/views.py

| Current Function            | Target Class                 | Mixin to Use    | Priority |
| --------------------------- | ---------------------------- | --------------- | -------- |
| `hx_create_membership_sale` | `HxCreateMembershipSaleView` | HtmxFormMixin   | P0       |
| `hx_create_payment_receipt` | `HxCreateReceiptView`        | HtmxFormMixin   | P1       |
| `hx_edit_payment_receipt`   | `HxEditReceiptView`          | HtmxFormMixin   | P1       |
| `hx_delete_payment_receipt` | `HxDeleteReceiptView`        | HtmxDeleteMixin | P1       |
| `hx_edit_sale`              | `HxEditSaleView`             | HtmxFormMixin   | P1       |
| `hx_delete_sale`            | `HxDeleteSaleView`           | HtmxDeleteMixin | P1       |

### logistics/views.py

| Current Function    | Target Class          | Mixin to Use    | Priority |
| ------------------- | --------------------- | --------------- | -------- |
| `hx_create_service` | `HxCreateServiceView` | HtmxFormMixin   | P0       |
| `hx_edit_service`   | `HxEditServiceView`   | HtmxFormMixin   | P1       |
| `hx_delete_service` | `HxDeleteServiceView` | HtmxDeleteMixin | P1       |
| `hx_create_product` | `HxCreateProductView` | HtmxFormMixin   | P0       |
| `hx_edit_product`   | `HxEditProductView`   | HtmxFormMixin   | P1       |
| `hx_delete_product` | `HxDeleteProductView` | HtmxDeleteMixin | P1       |

### clients/views.py

| Current Function   | Target Class         | Mixin to Use    | Priority |
| ------------------ | -------------------- | --------------- | -------- |
| `hx_create_client` | `HxCreateClientView` | HtmxFormMixin   | P0       |
| N/A                | `HxDeleteClientView` | HtmxDeleteMixin | P1       |

### organizations/views.py

| Current Function         | Target Class               | Mixin to Use  | Priority |
| ------------------------ | -------------------------- | ------------- | -------- |
| `hx_create_organization` | `HxCreateOrganizationView` | HtmxFormMixin | P0       |
| `hx_edit_organization`   | `HxEditOrganizationView`   | HtmxFormMixin | P1       |

---

## Refactoring Patterns by Mixin Type

### Pattern 1: HtmxFormMixin (Simple Forms)

For views with a single form (no formsets).

**Current Pattern:**

```python
def hx_create_service(request: OrgHttpRequest) -> HttpResponse:
    if request.method == "POST":
        form = ServiceForm(request.POST)
        if form.is_valid():
            service = form.save()
            response = render(request, "logistics/partials/service_detail.html", {"service": service})
            return trigger_client_event(response, "service-created", {"service_id": service.id})

        return render(request, "logistics/forms/service_form.html", {"form": form}, status=422)

    form = ServiceForm()
    return render(request, "logistics/forms/service_form.html", {"form": form})
```

**Target Pattern:**

```python
from django.views import View
from crown_crm.core.mixins import HtmxFormMixin


class HxCreateServiceView(HtmxFormMixin, View):
    """Create service using HtmxFormMixin."""

    template_name = "logistics/forms/service_form.html"
    form_class = ServiceForm
    success_event = "service-created"
    success_status = 200  # Returns body with service detail

    def get_success_event_params(self):
        return {"service_id": self._object.id}

    def htmx_success(self, context=None, template_name=None):
        """Override to use success_status=200 and render service detail."""
        return TemplateResponse(
            request=self._request,
            template="logistics/partials/service_detail.html",
            context={"service": self._object},
            status=200
        )
```

---

### Pattern 2: HtmxDeleteMixin (Delete Views)

**Current Pattern:**

```python
def hx_delete_service(request: OrgHttpRequest, service_id: str) -> HttpResponse:
    service = get_object_or_404(Service, pk=service_id, organization=request.organization)
    service.delete()

    response = HttpResponse(status=204)
    return trigger_client_event(response, "service-deleted", {"service_id": service_id})
```

**Target Pattern:**

```python
from django.views import View
from crown_crm.core.mixins import HtmxDeleteMixin
from crown_crm.logistics.models import Service


class HxDeleteServiceView(HtmxDeleteMixin, View):
    """Delete service using HtmxDeleteMixin."""

    model = Service
    success_event = "service-deleted"
    event_id_key = "service_id"
    permission_required = "logistics.delete_service"

    def get_object(self):
        return get_object_or_404(
            self.model,
            pk=self.kwargs['service_id'],
            organization=self._request.organization
        )
```

---

### Pattern 3: HtmxFormsetMixin (Forms with Formsets)

**Current Pattern:**

```python
def hx_create_lead(request: OrgHttpRequest) -> HttpResponse:
    if request.method == "POST":
        lead_form = LeadCreateForm(request.POST)
        mobile_formset = MobileNumberFormSet(request.POST, prefix="mobile")
        email_formset = EmailFormSet(request.POST, prefix="email")

        if lead_form.is_valid() and mobile_formset.is_valid() and email_formset.is_valid():
            lead = lead_form.save()
            mobile_formset.instance = lead
            email_formset.instance = lead
            mobile_formset.save()
            email_formset.save()

            res = trigger_client_event(render(request, "leads/forms/lead_create.html"), "lead-created")
            return res

        context = {
            "lead_form": lead_form,
            "mobile_formset": mobile_formset,
            "email_formset": email_formset,
        }
        return render(request, "leads/forms/lead_create.html", context, status=422)

    # GET
    context = {
        "lead_form": LeadCreateForm(),
        "mobile_formset": MobileNumberFormSet(),
        "email_formset": EmailFormSet(),
    }
    return render(request, "leads/forms/lead_create.html", context)
```

**Target Pattern:**

```python
from django.views import View
from crown_crm.core.mixins import HtmxFormsetMixin


class HxCreateLeadView(HtmxFormsetMixin, View):
    """Create lead with mobile/email formsets using HtmxFormsetMixin."""

    template_name = "leads/forms/lead_create.html"
    form_class = LeadCreateForm
    formset_classes = {
        'mobile': MobileNumberFormSet,
        'email': EmailFormSet,
    }
    success_event = "lead-created"
    context_object_name = "lead_form"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Add non-formset forms to context
        context['address_form'] = kwargs.get('address_form') or LeadAddressForm(self._request.POST or None)
        return context

    def form_valid(self, form):
        lead = form.save()

        # Save formsets (available via self.formsets from mixin)
        for name, fs in self.formsets.items():
            fs.instance = lead
            fs.save()

        self._object = lead
        return self.htmx_success()

    # NOTE: Don't override form_invalid() - override get_context_data() instead.
    # The mixin's form_invalid() calls render_form() which calls get_context_data(),
    # so address_form will be included automatically.
```

---

### Pattern 4: Views with Custom Save Logic

For views that need custom save logic (like accounting views with `save_and_create_receipt`).

```python
class HxCreateMembershipSaleView(HtmxFormMixin, View):
    """Create membership sale with custom save logic."""

    template_name = "accounting/partials/membership_sale_form.html"
    form_class = MembershipSaleCreateForm
    success_event = "membership-sale-created"
    success_status = 200  # Returns body

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['organization'] = self._request.organization
        return kwargs

    def form_valid(self, form):
        # Custom save - not just form.save()
        sale = form.save_and_create_receipt(self._request.organization)
        self._object = sale
        return self.htmx_success()

    def htmx_success(self, context=None, template_name=None):
        """Render receipt detail on success - only for 200 status."""
        if self.success_status == 200:
            first_receipt = self._object.receipts.order_by("date").first()
            return TemplateResponse(
                request=self._request,
                template="accounting/partials/payment_receipt.html",
                context={"sale": self._object, "receipt": first_receipt},
                status=200
            )
        # For 204, use parent behavior
        return super().htmx_success(context, template_name)
```

---

## Implementation Order

### P0 - Priority Views (Core Functionality)

1. **leads/views.py**
   - Refactor `hx_create_lead` → `HxCreateLeadView` (HtmxFormsetMixin)
   - Refactor `hx_edit_lead` → `HxEditLeadView` (HtmxFormsetMixin)

2. **accounting/views.py**
   - Refactor `hx_create_membership_sale` → `HxCreateMembershipSaleView` (HtmxFormMixin)
   - Refactor `hx_create_payment_receipt` → `HxCreateReceiptView` (HtmxFormMixin)

3. **logistics/views.py**
   - Refactor `hx_create_service` → `HxCreateServiceView` (HtmxFormMixin)
   - Refactor `hx_create_product` → `HxCreateProductView` (HtmxFormMixin)

4. **clients/views.py**
   - Refactor `hx_create_client` → `HxCreateClientView` (HtmxFormMixin)

### P1 - Edit/Delete Views

Continue with edit and delete views in each module.

### P2 - Inline/Child Views

Handle mobile number and email add/delete views.

---

## Key Considerations

### 1. URL Routing Changes

When converting from function-based to class-based views, update urls.py:

```python
# Before (function-based)
path('hx/create/', views.hx_create_lead, name='hx-create')

# After (class-based)
path('hx/create/', views.HxCreateLeadView.as_view(), name='hx-create')
```

### 2. Decorators

Function-based views use `@require_http_methods(["POST"])`. Class-based views inherit from `View` which handles method routing via `dispatch()`.

For authentication/permission, use mixin's `permission_required` or add to class:

```python
class HxCreateLeadView(HtmxFormMixin, View):
    permission_required = "leads.add_lead"
```

Or keep decorator on a wrapper:

```python
@method_decorator(login_required, name='dispatch')
@method_decorator(organization_slug_required, name='dispatch')
class HxCreateLeadView(HtmxFormMixin, View):
    ...
```

### 3. Import Changes

Add imports to each views.py:

```python
from django.views import View
from crown_crm.core.mixins import HtmxFormMixin, HtmxDeleteMixin, HtmxFormsetMixin
```

### 4. Formset Prefix Handling

The mixin uses formset key names as prefix by default. If your formset uses a different prefix:

```python
class HxCreateLeadView(HtmxFormsetMixin, View):
    formset_classes = {
        'mobile': MobileNumberFormSet,
    }

    # Custom prefix mapping
    @property
    def formset_prefixes(self):
        return {'mobile': 'mobile_numbers'}
```

---

## Verification Checklist

After refactoring each view:

| Test                   | Expected                               |
| ---------------------- | -------------------------------------- |
| GET to `/hx/create/`   | 400 "HTMX request required"            |
| POST with valid data   | 204 + trigger event (or 200 with body) |
| POST with invalid data | 422 + form re-rendered with errors     |
| Direct browser access  | 400 error (HTMX enforced)              |
| Success event fired    | JS listener receives event             |
| No user permission     | 403 Forbidden                          |

---

## Files to Modify

| File                               | Change                                        |
| ---------------------------------- | --------------------------------------------- |
| `crown_crm/leads/views.py`         | Add class-based views, keep old for reference |
| `crown_crm/accounting/views.py`    | Add class-based views, keep old for reference |
| `crown_crm/logistics/views.py`     | Add class-based views, keep old for reference |
| `crown_crm/clients/views.py`       | Add class-based views, keep old for reference |
| `crown_crm/organizations/views.py` | Add class-based views, keep old for reference |
| `crown_crm/leads/urls.py`          | Update URL patterns                           |
| `crown_crm/accounting/urls.py`     | Update URL patterns                           |
| `crown_crm/logistics/urls.py`      | Update URL patterns                           |
| `crown_crm/clients/urls.py`        | Update URL patterns                           |
| `crown_crm/organizations/urls.py`  | Update URL patterns                           |

---

## Migration Strategy

1. **Create new class-based views** alongside existing function views
2. **Update URL patterns** to point to new classes (keep old URLs as backup)
3. **Test thoroughly** - both old and new paths
4. **Remove old function views** after confirming new views work
5. **Update JavaScript handlers** if needed (should already be standardized)
