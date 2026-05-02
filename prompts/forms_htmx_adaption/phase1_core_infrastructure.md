# Phase 1: Core Infrastructure (P0 - Must Fix)

This phase fixes critical issues that would break the implementation if not addressed first.

## 1.1 Fix HtmxFormMixin

**File:** `crown_crm/core/mixins.py`

### Problems with previous version

1. No default `get()` or `post()` handlers - every view must reimplement them (no code savings)
2. `render_form()` expects context dict, not form object directly
3. Missing `success_url` for HX-Redirect header
4. Missing permission checking

### Implementation

```python
# crown_crm/core/mixins.py
"""
HTMX view mixins for Crown CRM.

Provides consistent status code handling for HTMX form views:
- 422: Validation errors (form re-rendered with errors)
- 204: Success, no body, trigger client event
- 200: Success with body (template rendered)
"""

from django.http import HttpResponse, HttpResponseBadRequest, HttpResponseForbidden
from django.shortcuts import get_object_or_404
from django.template.response import TemplateResponse
from django.core.exceptions import ImproperlyConfigured
from django_htmx.http import trigger_client_event

__all__ = ['HtmxFormMixin', 'HtmxDeleteMixin']


class HtmxFormMixin:
    """
    Mixin for HTMX form views.

    Subclasses MUST define:
        template_name: str
        form_class: type[Form]

    May define:
        success_event: str | None
        success_status: int (default: 204)
        context_object_name: str (default: "form")
        redirect_url: str | None (for HX-Redirect header)
        permission_required: str | None
    """
    template_name = None
    form_class = None
    success_event = None
    success_status = 204
    context_object_name = "form"
    redirect_url = None
    permission_required = None

    # Internal state
    _request = None
    _object = None

    def dispatch(self, request, *args, **kwargs):
        """Enforce HTMX-only access, permissions, and store request."""
        if not getattr(request, 'htmx', False):
            return HttpResponseBadRequest("HTMX request required")

        if self.permission_required and not request.user.has_perm(self.permission_required):
            return HttpResponseForbidden("Permission denied")

        self._request = request
        return super().dispatch(request, *args, **kwargs)

    def get(self, request, *args, **kwargs):
        """Default GET: render empty form."""
        form = self.get_form()
        return self.render_form(form)

    def post(self, request, *args, **kwargs):
        """Default POST: validate form and save."""
        form = self.get_form()
        if form.is_valid():
            return self.form_valid(form)
        return self.form_invalid(form)

    def get_form(self, **kwargs):
        """Instantiate form with proper kwargs."""
        if self.form_class is None:
            raise ImproperlyConfigured(
                f"{self.__class__.__name__} must define form_class"
            )

        form_kwargs = self.get_form_kwargs()
        form_kwargs.update(kwargs)

        if self._request.method == "POST":
            return self.form_class(
                self._request.POST,
                self._request.FILES,
                **form_kwargs
            )
        return self.form_class(**form_kwargs)

    def get_form_kwargs(self):
        """Override to pass instance, initial, etc. to form."""
        return {}

    def get_context_data(self, **kwargs):
        """Build template context."""
        context = dict(kwargs)
        return context

    def render_form(self, form=None, extra_context=None, status=200):
        """Render template with given status.

        Args:
            form: The form instance (optional)
            extra_context: Additional context dict (optional)
            status: HTTP status code (default: 200)
        """
        context = {}
        if form is not None:
            context[self.context_object_name] = form
        if extra_context:
            context.update(extra_context)

        return TemplateResponse(
            self._request,
            self.template_name,
            self.get_context_data(**context),
            status=status
        )

    def htmx_success(self, context=None, template_name=None):
        """Handle successful form submission."""
        if self.success_status == 204:
            response = HttpResponse(status=204)

            # Optional HX-Redirect header
            redirect_url = self.build_success_url()
            if redirect_url:
                response['HX-Redirect'] = redirect_url

            if self.success_event:
                response = trigger_client_event(
                    response,
                    self.success_event,
                    self.get_success_event_params()
                )
            return response

        # 200 with body
        template = template_name or self.template_name
        return TemplateResponse(
            request=self._request,
            template=template,
            context=self.get_context_data(**(context or {})),
            status=200
        )

    def build_success_url(self):
        """Return URL for HX-Redirect header, or None.

        Supports format string with {id} placeholder.
        Example: redirect_url = "/leads/{id}/detail"
        """
        if self.redirect_url:
            return self.redirect_url.format(id=getattr(self._object, 'id', ''))
        return None

    def get_success_event_params(self):
        """Override to provide dynamic event params."""
        return {}

    def form_valid(self, form):
        """Save form and return success response. Override for custom save."""
        self._object = form.save()
        return self.htmx_success()

    def form_invalid(self, form, **context):
        """Return 422 with re-rendered form showing errors."""
        return self.render_form(form, extra_context=context, status=422)
```

### Why Default get()/post() Matters

Without default handlers, every view must reimplement get() and post():

**Before (with old mixin):**

```python
class HxCreateLeadView(HtmxFormMixin, View):
    template_name = "leads/forms/lead_create.html"
    form_class = LeadForm

    # MUST override these - mixin provides nothing
    def get(self, request, *args, **kwargs):
        form = self.get_form()
        return self.render_form({self.context_object_name: form})

    def post(self, request, *args, **kwargs):
        form = self.get_form()
        if form.is_valid():
            return self.form_valid(form)
        return self.form_invalid(form)
```

**After (with new mixin):**

```python
class HxCreateLeadView(HtmxFormMixin, View):
    template_name = "leads/forms/lead_create.html"
    form_class = LeadForm
    success_event = "lead-created"
    # get() and post() provided by mixin - no code needed!
```

### Usage Example

```python
class HxCreateLeadView(HtmxFormMixin, View):
    template_name = "leads/forms/lead_create.html"
    form_class = LeadForm
    success_event = "lead-created"
    context_object_name = "lead_form"

    def get_success_event_params(self):
        return {"lead_id": self._object.id}
```

### Edit View with Instance

```python
class HxEditLeadView(HtmxFormMixin, View):
    template_name = "leads/forms/lead_edit.html"
    form_class = LeadForm
    success_event = "lead-updated"

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        self.lead = get_object_or_404(Lead, pk=self.kwargs['pk'])
        kwargs['instance'] = self.lead
        return kwargs
```

---

## 1.2 Add HtmxDeleteMixin

**File:** `crown_crm/core/mixins.py` (add after HtmxFormMixin)

### Problems with previous version

1. Event parameter key is auto-generated from model name (`{model_name}_id`), which is inconsistent across models
2. Missing permission checking

### Implementation

```python
class HtmxDeleteMixin:
    """
    Mixin for HTMX delete views.
    Returns 204 + trigger event on success.

    Subclasses MUST define:
        model: Model class
        success_event: str | None

    May define:
        pk_url_kwarg: str (default: 'pk')
        event_id_key: str (default: 'id') - consistent key for JS handlers
        permission_required: str | None
    """
    model = None
    success_event = None
    pk_url_kwarg = 'pk'
    event_id_key = 'id'
    permission_required = None

    def dispatch(self, request, *args, **kwargs):
        if not getattr(request, 'htmx', False):
            return HttpResponseBadRequest("HTMX request required")

        if self.permission_required and not request.user.has_perm(self.permission_required):
            return HttpResponseForbidden("Permission denied")

        return super().dispatch(request, *args, **kwargs)

    def get_object(self):
        return get_object_or_404(
            self.model,
            pk=self.kwargs[self.pk_url_kwarg]
        )

    def delete(self, request, *args, **kwargs):
        obj = self.get_object()
        obj_id = obj.id
        obj.delete()

        response = HttpResponse(status=204)
        if self.success_event:
            response = trigger_client_event(
                response,
                self.success_event,
                {self.event_id_key: obj_id}
            )
        return response
```

### Usage

```python
class HxLeadDeleteView(HtmxDeleteMixin, View):
    model = Lead
    success_event = "lead-deleted"
    event_id_key = "lead_id"  # Explicit, predictable
```

### Why event_id_key Matters

**Before (inconsistent):**

- Lead → `lead_id` (manual, lucky)
- PaymentReceipt → `paymentreceipt_id` (auto-generated, no underscore!)
- MembershipSale → `membershipsale_id` (auto-generated)

**After (consistent):**

```python
class HxLeadDeleteView(HtmxDeleteMixin, View):
    event_id_key = "lead_id"

class HxReceiptDeleteView(HtmxDeleteMixin, View):
    event_id_key = "receipt_id"

class HxSaleDeleteView(HtmxDeleteMixin, View):
    event_id_key = "sale_id"
```

JS handlers now have predictable access:

```javascript
document.body.addEventListener("lead-deleted", function (evt) {
  const leadId = evt.detail.lead_id; // Always known
});
```

---

## 1.3 Fix c-modal-form Component

**File:** `crown_crm/templates/cotton/modal_form.html`

### Problems with previous version

1. Includes `{{ attrs }}` which could allow users to pass conflicting hx attributes
2. Missing documentation about JS event handler requirement for modal closure

### Implementation

```html
{% comment %} c-modal-form: Bootstrap 4 modal with HTMX form IMPORTANT DESIGN
DECISIONS: - Form targets ITSELF (hx-target="this") with outerHTML swap - On
422: Only the form is re-rendered with errors, modal stays open - On 204: Modal
MUST be closed via JS event handler (see Phase 6) - data-backdrop="static"
prevents accidental closure during form entry - Does NOT accept {{ attrs }} - hx
attributes are fixed for modal behavior Args: title: Modal title (required)
action: Form action URL (required) method: HTTP method - post, put, patch
(default: post) submit_label: Submit button text (default: "Save") close_label:
Close button text (default: "Cancel") size: Modal size - sm, lg, xl (default:
empty for medium) id: Modal ID (optional, auto-generated if empty) {% endcomment
%}

<c-vars
  title
  action
  method="post"
  submit_label="Save"
  close_label="Cancel"
  size=""
  id=""
/>

{% with modal_id=id|default:"modal-"|add:action|slugify %}
<div
  class="modal fade"
  id="{{ modal_id }}"
  tabindex="-1"
  role="dialog"
  aria-labelledby="{{ modal_id }}-label"
  aria-hidden="true"
  data-backdrop="static"
  data-keyboard="true"
>
  <div
    class="modal-dialog modal-dialog-centered {% if size %}modal-{{ size }}{% endif %}"
    role="document"
  >
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="{{ modal_id }}-label">{{ title }}</h5>
        <button
          type="button"
          class="close"
          data-dismiss="modal"
          aria-label="Close"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <div class="modal-body">
        {% comment %} Form targets itself. The explicit hx-target/hx-swap are
        NOT in {{ attrs }} - they're declared directly on the form element. {%
        endcomment %}
        <form
          id="{{ modal_id }}-form"
          hx-{{
          method
          }}="{{ action }}"
          hx-target="this"
          hx-swap="outerHTML"
        >
          {% csrf_token %} {{ slot }}

          <div class="d-flex justify-content-end gap-2 mt-4">
            <button
              type="button"
              class="btn btn-secondary"
              data-dismiss="modal"
            >
              {{ close_label }}
            </button>
            <button type="submit" class="btn btn-primary">
              <span
                class="spinner-border spinner-border-sm mr-2 htmx-indicator"
                style="display:none;"
              ></span>
              {{ submit_label }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
{% endwith %}
```

### Why This Fix Works

The modal form **excludes** `{{ attrs }}` entirely. This is intentional because:

1. The form must always target itself (`hx-target="this"`) for error re-rendering to work
2. Any user-provided hx attributes would break the modal's HTMX behavior
3. If users need custom hx attributes, they should build their own form outside the modal component

This is a deliberate design constraint, not a limitation.

---

## Files to Create/Modify

| File                                         | Type   | Change                                                                                                                    |
| -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `crown_crm/core/mixins.py`                   | Modify | Complete rewrite of HtmxFormMixin (add default get/post, success_url, permissions), Add HtmxDeleteMixin with event_id_key |
| `crown_crm/templates/cotton/modal_form.html` | Modify | Add documentation, ensure hx-target/hx-swap precedence                                                                    |

---

## Implementation Order

1. First: Create/update `crown_crm/core/mixins.py` with both mixins
2. Second: Update `crown_crm/templates/cotton/modal_form.html`

---

## Verification Checklist

Before moving to Phase 2, verify:

| #   | Test                                                    | Expected Result                                    |
| --- | ------------------------------------------------------- | -------------------------------------------------- |
| 1   | `HxCreateLeadView` without defining `get()` or `post()` | Works via mixin defaults                           |
| 2   | Direct browser hit to `/hx/create/`                     | 400 "HTMX request required"                        |
| 3   | POST with invalid data                                  | 422, form re-rendered with `is-invalid`            |
| 4   | POST with valid data                                    | 204, `HX-Trigger` header present                   |
| 5   | `HxLeadDeleteView` DELETE                               | 204, event with `{lead_id: 123}` (predictable key) |
| 6   | Modal form 422 error                                    | Only form swaps, modal header/footer preserved     |
| 7   | Modal form doesn't allow custom hx attributes           | Design constraint - build custom form if needed    |
| 8   | User without permission                                 | 403 Forbidden                                      |
| 9   | View with `redirect_url` set                            | HX-Redirect header present in 204 response         |
