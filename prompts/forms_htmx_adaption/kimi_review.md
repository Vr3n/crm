## Complete Review of Your Django HTMX Form Error Handling Plan

### Executive Summary

Your original plan correctly identifies the core problem: **HTMX form submissions return HTTP 200 for both success and validation errors**, breaking REST semantics and making error handling impossible. Your solution—returning 422 for validation errors, 204 for no-content success, and 200 for body-returning success—is architecturally sound.

However, your plan has **three major gaps** that will cause implementation pain:

1. **Manual Bootstrap error classes across 12+ templates** — unmaintainable and error-prone
2. **No reusable component strategy** — every form template duplicates logic
3. **Missing HTMX 2.0 specific patterns** — your `base.html` handler needs refinement for HTMX 2.0 behavior

**django-cotton** solves #1 and #2 by letting you build reusable form components that encapsulate Bootstrap 4 validation styling, HTMX attribute proxying, and error display in one place.

---

## Part 1: Architecture Decisions (Why This Matters)

### The HTMX 2.0 + Django Contract

| Scenario                              | Status Code | HTMX 2.0 Behavior                                                           | Your Action                                  |
| ------------------------------------- | ----------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| Form invalid (validation errors)      | **422**     | `htmx:beforeSwap` fires, then `htmx:afterSwap` if you set `isError = false` | Return rendered form with errors             |
| Success, no body (trigger event only) | **204**     | No swap, fires `htmx:afterRequest`                                          | Trigger client event for refresh/close modal |
| Success, body to swap                 | **200**     | Replaces `hx-target` with response                                          | Return rendered template                     |
| CSRF/malformed request                | **400**     | Same as 422 if configured                                                   | Return error message                         |
| Delete completed                      | **204**     | No swap, trigger event                                                      | Close row/modal via event                    |

**Critical Rule**: HTMX 2.0 by default **discards 4xx response bodies** and fires `htmx:responseError`. You **must** add the `htmx:beforeSwap` handler to allow swapping on 422/400, or validation errors will silently disappear.

---

## Part 2: Global Setup

### Step 2.1: Install Dependencies (I have already installed them, so you don't need to do .)

```bash
pip install django-htmx django-cotton
```

### Step 2.2: Configure Django Settings

```python
# settings.py

INSTALLED_APPS = [
    "django_htmx",           # Must be before your apps
    "django_cotton",         # Must be before django.contrib.staticfiles
    "django.contrib.staticfiles",
    # ... your apps
]

MIDDLEWARE = [
    # ... other middleware
    "django_htmx.middleware.HtmxMiddleware",  # Required for request.htmx
]

# Cotton configuration
COTTON_BASE_DIR = BASE_DIR / "templates"  # Where your cotton/ folder lives
```

### Step 2.3: HTMX 2.0 Error Handler (base.html)

Add this **once** in your base template, before `</body>`:

```html
<!-- crown_crm/templates/base.html -->
<script>
  /**
   * HTMX 2.0 Error Handler
   *
   * Problem: HTMX discards 4xx response bodies by default, firing htmx:responseError
   * instead of swapping content. This breaks form validation error display.
   *
   * Solution: Intercept beforeSwap, allow swapping on 422/400, and mark as non-error
   * so htmx:afterSwap fires (re-initializing any JS handlers).
   */
  document.body.addEventListener("htmx:beforeSwap", function (evt) {
    const xhr = evt.detail.xhr;
    const status = xhr.status;

    // 422 Unprocessable Entity: Form validation failed
    // 400 Bad Request: CSRF failure, malformed data
    if (status === 422 || status === 400) {
      // Allow HTMX to swap the response body into the DOM
      evt.detail.shouldSwap = true;

      // CRITICAL: Mark as NOT an error so htmx:afterSwap fires.
      // Without this, htmx:responseError fires instead, breaking any
      // initForm() or event re-attachment in afterSwap handlers.
      evt.detail.isError = false;

      // Optional: Auto-focus first invalid field after swap completes
      evt.detail.target.addEventListener(
        "htmx:afterSwap",
        function focusError() {
          const firstInvalid = evt.detail.target.querySelector(".is-invalid");
          if (firstInvalid) {
            firstInvalid.focus({ preventScroll: false });
            firstInvalid.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }
          // Clean up: remove this one-time listener
          evt.detail.target.removeEventListener("htmx:afterSwap", focusError);
        },
      );
    }

    // 204 No Content: Explicitly prevent swapping (HTMX 2.0 default, but explicit is safer)
    if (status === 204) {
      evt.detail.shouldSwap = false;
    }
  });

  /**
   * Global CSRF Token Handler for HTMX
   * Ensures all HTMX requests include the CSRF token.
   */
  document.body.addEventListener("htmx:configRequest", function (evt) {
    const csrfToken = document.querySelector(
      "[name=csrfmiddlewaretoken]",
    )?.value;
    if (csrfToken) {
      evt.detail.headers["X-CSRFToken"] = csrfToken;
    }
  });
</script>
```

**Why this matters for junior developers**: Without `isError = false`, HTMX 2.0 fires `htmx:responseError` on 422. If you have any `htmx:afterSwap` handlers (like re-initializing date pickers or event listeners), they won't fire, and your form will appear "dead" after an error.

---

## Part 3: django-cotton Component Library

### Directory Structure

```
templates/
├── cotton/                    # All reusable components
│   ├── form_input.html        # Text, email, number inputs
│   ├── form_select.html       # Dropdown selects
│   ├── form_textarea.html     # Multi-line text
│   ├── form_checkbox.html     # Boolean/checkbox fields
│   ├── form_date.html         # Date inputs with flatpickr
│   ├── form_phone.html        # Phone with intl-tel-input
│   ├── form_group.html        # Wrapper for custom layouts
│   ├── modal_form.html        # Modal wrapper with form
│   ├── delete_button.html     # HTMX delete with confirmation
│   └── spinner.html           # Loading indicator
├── leads/
│   └── forms/
│       └── lead_create.html   # Uses cotton components
├── accounting/
│   └── partials/
│       └── membership_sale_form.html
└── base.html
```

---

### Component 1: `c-form-input` (Text, Email, Number, URL)

**File**: `crown_crm/templates/cotton/form_input.html`

```html
{% comment %} c-form-input: Reusable Bootstrap 4 input component with HTMX
support Args: field: The form field instance (required) type: Input type - text,
email, number, url, password (default: text) placeholder: Placeholder text
(optional) hx_post: HTMX post URL (optional, for inline validation) hx_trigger:
HTMX trigger event (optional) hx_target: HTMX target selector (optional)
hx_swap: HTMX swap method (optional) label: Override label text (optional,
defaults to field.label) help_text: Override help text (optional, defaults to
field.help_text) Example:
<c-form-input :field="form.email" type="email" placeholder="Enter email" />
<c-form-input :field="form.name" hx-post="/check-name/" hx-trigger="blur" />
{% endcomment %}

<c-vars field type="text" placeholder="" label="" help_text="" />

<div class="form-group">
  {% comment %} Label {% endcomment %}
  <label for="{{ field.id_for_label }}">
    {{ label|default:field.label }} {% if field.field.required %}<span
      class="text-danger"
      >*</span
    >{% endif %}
  </label>

  {% comment %} Input field with Bootstrap 4 validation classes {{ attrs }}
  proxies any HTMX attributes (hx-post, hx-trigger, etc.) from the component
  call into the input element {% endcomment %}
  <input
    type="{{ type }}"
    name="{{ field.html_name }}"
    id="{{ field.id_for_label }}"
    value="{{ field.value|default:'' }}"
    placeholder="{{ placeholder }}"
    class="form-control {% if field.errors %}is-invalid{% elif field.value and not field.errors %}is-valid{% endif %}"
    {{
    attrs
    }}
  />

  {% comment %} Field-specific validation errors {% endcomment %} {% if
  field.errors %}
  <div class="invalid-feedback">{{ field.errors.0 }}</div>
  {% endif %} {% comment %} Help text (only shown if no errors to avoid clutter)
  {% endcomment %} {% if help_text|default:field.help_text and not field.errors
  %}
  <small class="form-text text-muted">
    {{ help_text|default:field.help_text }}
  </small>
  {% endif %}
</div>
```

**Usage Examples**:

```html
<!-- Basic usage -->
<c-form-input :field="lead_form.first_name" placeholder="John" />

<!-- With HTMX inline validation -->
<c-form-input
  :field="lead_form.email"
  type="email"
  hx-post="{% url 'leads:hx_validate_email' %}"
  hx-trigger="blur changed"
  hx-target="closest .form-group"
  hx-swap="outerHTML"
/>

<!-- With overridden label -->
<c-form-input
  :field="lead_form.mobile_number"
  type="tel"
  label="Primary Mobile Number"
  help_text="Enter 10-digit mobile number"
/>
```

---

### Component 2: `c-form-select` (Dropdowns)

**File**: `templates/cotton/form_select.html`

```html
{% comment %}
c-form-select: Reusable Bootstrap 4 select dropdown

Args:
  field: The form field instance (required)
  label: Override label (optional)
  choices: Override choices list (optional, defaults to field.field.choices)
  include_blank: Include blank option (default: True)
  blank_text: Text for blank option (default: "---------")

Example:
  <c-form-select :field="form.source" />
  <c-form-select :field="form.status" :choices="custom_statuses" />
{% endcomment %}

<c-vars
  field
  label=""
  choices=""
  include_blank="True"
  blank_text="---------"
/>

<div class="form-group">
  <label for="{{ field.id_for_label }}">
    {{ label|default:field.label }}
    {% if field.field.required %}<span class="text-danger">*</span>{% endif %}
  </label>

  <select
    name="{{ field.html_name }}"
    id="{{ field.id_for_label }}"
    class="form-control {% if field.errors %}is-invalid{% endif %}"
    {{ attrs }}
  >
    {% if include_blank == "True" %}
      <option value="">{{ blank_text }}</option>
    {% endif %}

    {% for choice in choices|default:field.field.choices %}
      <option
        value="{{ choice.0 }}"
        {% if field.value|stringformat:"s" == choice.0|stringformat:"s" %}selected{% endif %}
      >
        {{ choice.1 }}
      </option>
    {% endfor %}
  </select>

  {% if field.errors %}
    <div class="invalid-feedback">{{ field.errors.0 }}</div>
  {% endif %}

  {% if field.help_text and not field.errors %}
    <small class="form-text text-muted">{{ field.help_text }}</small>
  {% endif %}
</div>
```

**Usage**:

```html
<!-- Standard usage -->
<c-form-select :field="lead_form.source" />

<!-- With HTMX-dependent dropdowns (cascading selects) -->
<c-form-select
  :field="lead_form.city"
  hx-get="{% url 'leads:hx_load_areas' %}"
  hx-target="#area-select"
  hx-trigger="change"
/>

<!-- Without blank option -->
<c-form-select :field="lead_form.status" include_blank="False" />
```

---

### Component 3: `c-form-textarea`

**File**: `templates/cotton/form_textarea.html`

```html
{% comment %} c-form-textarea: Multi-line text input Args: field: Form field
instance (required) rows: Number of rows (default: 3) label: Override label
(optional) placeholder: Placeholder text (optional) Example:
<c-form-textarea :field="form.notes" rows="5" placeholder="Enter notes..." />
{% endcomment %}

<c-vars field rows="3" label="" placeholder="" />

<div class="form-group">
  <label for="{{ field.id_for_label }}">
    {{ label|default:field.label }} {% if field.field.required %}<span
      class="text-danger"
      >*</span
    >{% endif %}
  </label>

  <textarea
    name="{{ field.html_name }}"
    id="{{ field.id_for_label }}"
    rows="{{ rows }}"
    placeholder="{{ placeholder }}"
    class="form-control {% if field.errors %}is-invalid{% endif %}"
    {{
    attrs
    }}
  >
{{ field.value|default:'' }}</textarea
  >

  {% if field.errors %}
  <div class="invalid-feedback">{{ field.errors.0 }}</div>
  {% endif %}
</div>
```

---

### Component 4: `c-form-checkbox` (Boolean Fields)

**File**: `templates/cotton/form_checkbox.html`

```html
{% comment %} c-form-checkbox: Single checkbox (boolean field) Args: field: Form
field instance (required) label: Override label (optional) help_text: Additional
explanation (optional) Example:
<c-form-checkbox :field="form.is_active" label="Active Lead" />
{% endcomment %}

<c-vars field label="" help_text="" />

<div class="form-group form-check">
  <input
    type="checkbox"
    name="{{ field.html_name }}"
    id="{{ field.id_for_label }}"
    class="form-check-input {% if field.errors %}is-invalid{% endif %}"
    {%
    if
    field.value
    %}checked{%
    endif
    %}
    {{
    attrs
    }}
  />

  <label class="form-check-label" for="{{ field.id_for_label }}">
    {{ label|default:field.label }}
  </label>

  {% if field.errors %}
  <div class="invalid-feedback d-block">{{ field.errors.0 }}</div>
  {% endif %} {% if help_text|default:field.help_text %}
  <small class="form-text text-muted"
    >{{ help_text|default:field.help_text }}</small
  >
  {% endif %}
</div>
```

---

### Component 5: `c-modal-form` (Modal Wrapper)

**File**: `templates/cotton/modal_form.html`

```html
{% comment %} c-modal-form: Complete modal form wrapper for HTMX Args: title:
Modal title (required) action: Form action URL (required) method: HTTP method -
post, put, patch (default: post) submit_label: Submit button text (default:
"Save") close_label: Close button text (default: "Cancel") size: Modal size -
sm, lg, xl (default: empty for medium) id: Modal ID for targeting (optional,
auto-generated if empty) Example:
<c-modal-form
  title="Create Lead"
  action="{% url 'leads:hx_create' %}"
  method="post"
  submit_label="Create Lead"
>
  <c-form-input :field="form.name" />
  <c-form-input :field="form.email" type="email" />
</c-modal-form>
{% endcomment %}

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
>
  <div
    class="modal-dialog modal-dialog-centered {% if size %}modal-{{ size }}{% endif %}"
    role="document"
  >
    <div class="modal-content">
      {% comment %} Header {% endcomment %}
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

      {% comment %} Body contains the form hx-target="this" ensures errors
      replace just the form, not the whole modal {% endcomment %}
      <div class="modal-body">
        <form
          hx-{{
          method
          }}="{{ action }}"
          hx-target="closest .modal-body"
          hx-swap="innerHTML"
          {{
          attrs
          }}
        >
          {% csrf_token %} {% comment %} Form fields injected here via {{ slot
          }} {% endcomment %} {{ slot }} {% comment %} Footer with actions {%
          endcomment %}
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
                class="htmx-indicator spinner-border spinner-border-sm mr-2"
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

**Usage**:

```html
<!-- Trigger button -->
<button
  class="btn btn-primary"
  data-toggle="modal"
  data-target="#create-lead-modal"
  hx-get="{% url 'leads:hx_create_modal' %}"
  hx-target="#create-lead-modal .modal-body"
  hx-trigger="click once"
>
  Create Lead
</button>

<!-- Modal container (initially empty, populated by HTMX) -->
<div id="create-lead-modal"></div>

<!-- Or use the component directly -->
<c-modal-form
  title="Create New Lead"
  action="{% url 'leads:hx_create' %}"
  method="post"
  submit_label="Create Lead"
  size="lg"
>
  <div class="row">
    <div class="col-md-4">
      <c-form-input :field="lead_form.first_name" />
    </div>
    <div class="col-md-4">
      <c-form-input :field="lead_form.middle_name" />
    </div>
    <div class="col-md-4">
      <c-form-input :field="lead_form.last_name" />
    </div>
  </div>

  <c-form-input :field="lead_form.email" type="email" />
  <c-form-input :field="lead_form.mobile_number" type="tel" />
  <c-form-select :field="lead_form.source" />
  <c-form-textarea :field="lead_form.notes" rows="3" />
</c-modal-form>
```

---

### Component 6: `c-delete-button` (HTMX Delete with Confirmation)

**File**: `templates/cotton/delete_button.html`

```html
{% comment %} c-delete-button: HTMX delete button with confirmation Args: url:
Delete endpoint URL (required) target: Element to remove on success (required)
confirm_message: Confirmation dialog text (default: "Are you sure?") label:
Button text (default: "Delete") size: Button size - sm, lg (default: sm) icon:
Include trash icon (default: True) Example:
<c-delete-button
  url="{% url 'leads:hx_delete' lead.id %}"
  target="#lead-row-{{ lead.id }}"
  confirm_message="Delete this lead permanently?"
/>
{% endcomment %}

<c-vars
  url
  target
  confirm_message="Are you sure you want to delete this?"
  label="Delete"
  size="sm"
  icon="True"
/>

<button
  class="btn btn-outline-danger btn-{{ size }}"
  hx-delete="{{ url }}"
  hx-target="{{ target }}"
  hx-swap="outerHTML swap:0.3s"
  hx-confirm="{{ confirm_message }}"
  hx-indicator="closest tr"
  {{
  attrs
  }}
>
  {% if icon == "True" %}
  <i class="fas fa-trash-alt mr-1"></i>
  {% endif %} {{ label }}
</button>
```

**Usage**:

```html
<!-- In a table row -->
<tr id="lead-row-{{ lead.id }}">
  <td>{{ lead.name }}</td>
  <td>
    <c-delete-button
      url="{% url 'leads:hx_delete' lead.id %}"
      target="#lead-row-{{ lead.id }}"
      confirm_message="Delete {{ lead.name }}?"
    />
  </td>
</tr>
```

---

### Component 7: `c-spinner` (Loading Indicator)

**File**: `templates/cotton/spinner.html`

```html
{% comment %} c-spinner: HTMX loading indicator Args: size: spinner size - sm,
md, lg (default: sm) color: Bootstrap color - primary, secondary, light, dark
(default: primary) text: Loading text (optional) Example:
<c-spinner size="md" color="primary" text="Saving..." />
{% endcomment %}

<c-vars size="sm" color="primary" text="" />

<div class="htmx-indicator d-flex align-items-center">
  <span
    class="spinner-border spinner-border-{{ size }} text-{{ color }} mr-2"
    role="status"
    aria-hidden="true"
  ></span>
  {% if text %}
  <span class="text-{{ color }}">{{ text }}</span>
  {% endif %}
</div>
```

---

## Part 4: Refactored Views (Production-Ready)

### Pattern: The HTMX Form View Mixin

Create this mixin to eliminate repetition across your 12+ views:

```python
# crown_crm/core/mixins.py
from django.http import HttpResponse
from django.template.response import TemplateResponse
from django_htmx.http import trigger_client_event


class HtmxFormMixin:
    """
    Mixin for HTMX form views that handles status codes correctly:
    - 422 for validation errors (with form re-render)
    - 204 for success with no body (triggers client event)
    - 200 for success with body (renders template)

    Usage:
        class LeadCreateView(HtmxFormMixin, View):
            template_name = "leads/forms/lead_create.html"
            success_event = "lead:create_success"
            success_status = 204  # No body, trigger event only

            def get_form(self, request):
                return LeadForm(request.POST or None)

            def form_valid(self, form):
                self.object = form.save()
                return self.htmx_success()
    """

    template_name = None
    success_event = None
    success_event_params = None
    success_status = 204  # Default: no content, trigger event

    def get_context_data(self, **kwargs):
        return kwargs

    def render_form(self, request, context, status=200):
        """Render form template with given status."""
        return TemplateResponse(
            request,
            self.template_name,
            self.get_context_data(**context),
            status=status
        )

    def htmx_success(self, context=None, template_name=None):
        """
        Handle successful form submission.

        If success_status is 204: Return empty response + trigger event
        If success_status is 200: Render template with context
        """
        if self.success_status == 204:
            response = HttpResponse(status=204)
            if self.success_event:
                params = self.success_event_params or {}
                response = trigger_client_event(
                    response,
                    self.success_event,
                    params
                )
            return response

        # 200 with body
        template = template_name or self.template_name
        return TemplateResponse(
            request=self.request,
            template=template,
            context=self.get_context_data(**(context or {})),
            status=200
        )

    def form_invalid(self, request, form, **context):
        """Return 422 with re-rendered form showing errors."""
        return self.render_form(
            request,
            {**context, "form": form},
            status=422
        )
```

### Refactored Views

#### Leads Views

```python
# crown_crm/leads/views.py
from django.views import View
from django_htmx.http import trigger_client_event
from crown_crm.core.mixins import HtmxFormMixin


class HxCreateLeadView(HtmxFormMixin, View):
    """
    HTMX endpoint: Create lead via modal form.

    Returns:
        422: Form validation errors (swapped into modal)
        204: Success, triggers lead:create_success event
    """
    template_name = "leads/forms/lead_create.html"
    success_event = "lead:create_success"
    success_status = 204

    def get(self, request):
        """Return empty form for modal."""
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")

        form = LeadForm()
        return self.render_form(request, {"lead_form": form})

    def post(self, request):
        """Process form submission."""
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")

        form = LeadForm(request.POST)
        if form.is_valid():
            lead = form.save()
            self.success_event_params = {"lead_id": lead.id}
            return self.htmx_success()

        return self.form_invalid(request, form, lead_form=form)


class HxEditLeadView(HtmxFormMixin, View):
    """
    HTMX endpoint: Edit existing lead.

    Returns:
        422: Validation errors
        204: Success, triggers lead:update_success
    """
    template_name = "leads/forms/lead_edit.html"
    success_event = "lead:update_success"
    success_status = 204

    def get(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")

        lead = get_object_or_404(Lead, pk=pk)
        form = LeadForm(instance=lead)
        return self.render_form(request, {"lead_form": form, "lead": lead})

    def post(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")

        lead = get_object_or_404(Lead, pk=pk)
        form = LeadForm(request.POST, instance=lead)

        if form.is_valid():
            form.save()
            self.success_event_params = {"lead_id": lead.id}
            return self.htmx_success()

        return self.form_invalid(request, form, lead_form=form, lead=lead)


class HxQuickCreateLeadView(HtmxFormMixin, View):
    """
    Quick create from dropdown/select2 context.
    Same pattern, different template.
    """
    template_name = "leads/forms/lead_quick_create.html"
    success_event = "lead:quick_create_success"
    success_status = 204

    def get(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        form = LeadForm()
        return self.render_form(request, {"lead_form": form})

    def post(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")

        form = LeadForm(request.POST)
        if form.is_valid():
            lead = form.save()
            self.success_event_params = {
                "lead_id": lead.id,
                "lead_name": lead.full_name
            }
            return self.htmx_success()

        return self.form_invalid(request, form, lead_form=form)


class HxLeadDeleteView(View):
    """
    HTMX endpoint: Delete lead.

    Returns:
        204: Success, triggers lead:delete_success
        400: If not HTMX
    """
    def delete(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")

        lead = get_object_or_404(Lead, pk=pk)
        lead_id = lead.id
        lead.delete()

        response = HttpResponse(status=204)
        return trigger_client_event(
            response,
            "lead:delete_success",
            {"lead_id": lead_id}
        )
```

#### Accounting Views

```python
# crown_crm/accounting/views.py


class HxCreateMembershipSaleView(HtmxFormMixin, View):
    """
    Membership sale creation.

    DIFFERENT from other views: Returns 200 with receipt body on success,
    because the receipt HTML is swapped into the DOM.
    """
    template_name = "accounting/partials/membership_sale_form.html"
    success_template = "accounting/partials/payment_receipt.html"
    success_event = "membership_sale:create_success"
    success_status = 200  # Has body!

    def get(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")

        form = MembershipSaleForm()
        return self.render_form(request, {
            "form": form,
            "selected_lead": None
        })

    def post(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")

        form = MembershipSaleForm(request.POST)
        if form.is_valid():
            sale = form.save()
            first_receipt = sale.receipts.first()

            # Return 200 with receipt body (not 204!)
            response = self.render_form(
                request,
                {
                    "sale": sale,
                    "receipt": first_receipt
                },
                status=200
            )
            return trigger_client_event(
                response,
                self.success_event,
                {"sale_id": sale.id, "message": "Membership sale recorded!"}
            )

        # Validation error: 422 with form
        return self.form_invalid(
            request,
            form,
            selected_lead=form.cleaned_data.get("lead")
        )


class HxCreatePaymentReceiptView(HtmxFormMixin, View):
    """
    Payment receipt creation.
    Check template: if it returns body → 200, if no body → 204
    """
    template_name = "accounting/partials/payment_receipt_form.html"
    success_event = "receipt:create_success"
    success_status = 204  # Assuming no body, just trigger refresh

    def get(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        form = PaymentReceiptForm()
        return self.render_form(request, {"form": form})

    def post(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")

        form = PaymentReceiptForm(request.POST)
        if form.is_valid():
            receipt = form.save()
            self.success_event_params = {"receipt_id": receipt.id}
            return self.htmx_success()

        return self.form_invalid(request, form)


class HxEditReceiptView(HtmxFormMixin, View):
    template_name = "accounting/partials/receipt_edit_form.html"
    success_event = "receipt:update_success"
    success_status = 204

    def get(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        receipt = get_object_or_404(PaymentReceipt, pk=pk)
        form = PaymentReceiptForm(instance=receipt)
        return self.render_form(request, {"form": form, "receipt": receipt})

    def post(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        receipt = get_object_or_404(PaymentReceipt, pk=pk)
        form = PaymentReceiptForm(request.POST, instance=receipt)

        if form.is_valid():
            form.save()
            self.success_event_params = {"receipt_id": receipt.id}
            return self.htmx_success()

        return self.form_invalid(request, form, receipt=receipt)


class HxSaleUpdateView(HtmxFormMixin, View):
    template_name = "accounting/partials/sale_update_form.html"
    success_event = "sale:update_success"
    success_status = 204

    def get(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        sale = get_object_or_404(MembershipSale, pk=pk)
        form = SaleUpdateForm(instance=sale)
        return self.render_form(request, {"form": form, "sale": sale})

    def post(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        sale = get_object_or_404(MembershipSale, pk=pk)
        form = SaleUpdateForm(request.POST, instance=sale)

        if form.is_valid():
            form.save()
            self.success_event_params = {"sale_id": sale.id}
            return self.htmx_success()

        return self.form_invalid(request, form, sale=sale)


class HxDeleteReceiptView(View):
    def delete(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        receipt = get_object_or_404(PaymentReceipt, pk=pk)
        receipt_id = receipt.id
        receipt.delete()

        response = HttpResponse(status=204)
        return trigger_client_event(
            response,
            "receipt:delete_success",
            {"receipt_id": receipt_id}
        )


class HxSaleDeleteView(View):
    def delete(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        sale = get_object_or_404(MembershipSale, pk=pk)
        sale_id = sale.id
        sale.delete()

        response = HttpResponse(status=204)
        return trigger_client_event(
            response,
            "sale:delete_success",
            {"sale_id": sale_id}
        )
```

#### Logistics Views

```python
# crown_crm/logistics/views.py


class HxCreateServiceView(HtmxFormMixin, View):
    template_name = "logistics/partials/service_form.html"
    success_event = "service:create_success"
    success_status = 200  # Check: does template return body? If yes, keep 200

    def get(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        form = ServiceForm()
        return self.render_form(request, {"form": form})

    def post(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        form = ServiceForm(request.POST)

        if form.is_valid():
            service = form.save()
            self.success_event_params = {"service_id": service.id}
            # If returning body:
            # return self.render_form(request, {"service": service}, status=200)
            return self.htmx_success()

        return self.form_invalid(request, form)


class HxEditServiceView(HtmxFormMixin, View):
    template_name = "logistics/partials/service_form.html"
    success_event = "service:update_success"
    success_status = 204  # No body on edit

    def get(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        service = get_object_or_404(Service, pk=pk)
        form = ServiceForm(instance=service)
        return self.render_form(request, {"form": form, "service": service})

    def post(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        service = get_object_or_404(Service, pk=pk)
        form = ServiceForm(request.POST, instance=service)

        if form.is_valid():
            form.save()
            self.success_event_params = {"service_id": service.id}
            return self.htmx_success()

        return self.form_invalid(request, form, service=service)


class HxCreateProductView(HtmxFormMixin, View):
    template_name = "logistics/partials/product_form.html"
    success_event = "product:create_success"
    success_status = 200  # Check template for body

    def get(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        form = ProductForm()
        return self.render_form(request, {"form": form})

    def post(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        form = ProductForm(request.POST)

        if form.is_valid():
            product = form.save()
            self.success_event_params = {"product_id": product.id}
            return self.htmx_success()

        return self.form_invalid(request, form)


class HxEditProductView(HtmxFormMixin, View):
    template_name = "logistics/partials/product_form.html"
    success_event = "product:update_success"
    success_status = 204

    def get(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        product = get_object_or_404(Product, pk=pk)
        form = ProductForm(instance=product)
        return self.render_form(request, {"form": form, "product": product})

    def post(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        product = get_object_or_404(Product, pk=pk)
        form = ProductForm(request.POST, instance=product)

        if form.is_valid():
            form.save()
            self.success_event_params = {"product_id": product.id}
            return self.htmx_success()

        return self.form_invalid(request, form, product=product)


class HxDeleteServiceView(View):
    def delete(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        service = get_object_or_404(Service, pk=pk)
        service_id = service.id
        service.delete()

        response = HttpResponse(status=204)
        return trigger_client_event(
            response,
            "service:delete_success",
            {"service_id": service_id}
        )


class HxDeleteProductView(View):
    def delete(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        product = get_object_or_404(Product, pk=pk)
        product_id = product.id
        product.delete()

        response = HttpResponse(status=204)
        return trigger_client_event(
            response,
            "product:delete_success",
            {"product_id": product_id}
        )
```

#### Clients Views

```python
# crown_crm/clients/views.py


class HxCreateClientView(HtmxFormMixin, View):
    template_name = "clients/partials/client_form.html"
    success_event = "client:create_success"
    success_status = 200  # Check if template returns body

    def get(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        form = ClientForm()
        return self.render_form(request, {"form": form})

    def post(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        form = ClientForm(request.POST)

        if form.is_valid():
            client = form.save()
            self.success_event_params = {"client_id": client.id}
            return self.htmx_success()

        return self.form_invalid(request, form)


class HxDeleteClientView(View):
    def delete(self, request, pk):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        client = get_object_or_404(Client, pk=pk)
        client_id = client.id
        client.delete()

        response = HttpResponse(status=204)
        return trigger_client_event(
            response,
            "client:delete_success",
            {"client_id": client_id}
        )
```

#### Organizations Views

```python
# crown_crm/organizations/views.py


class HxOrganizationCreateView(HtmxFormMixin, View):
    template_name = "organizations/partials/organization_form.html"
    success_event = "organization:create_success"
    success_status = 200  # Check template

    def get(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        form = OrganizationForm()
        return self.render_form(request, {"form": form})

    def post(self, request):
        if not request.htmx:
            return HttpResponseBadRequest("HTMX required")
        form = OrganizationForm(request.POST)

        if form.is_valid():
            org = form.save()
            self.success_event_params = {"organization_id": org.id}
            return self.htmx_success()

        return self.form_invalid(request, form)
```

---

## Part 5: Refactored Templates (Using Cotton)

### Lead Create Form

**File**: `crown_crm/templates/leads/forms/lead_create.html`

```html
{% comment %} Lead Create Form - HTMX Compatible Returns: 422 with errors
(swapped into modal) or triggers 204 success {% endcomment %}

<c-modal-form
  title="Create New Lead"
  action="{% url 'leads:hx_create' %}"
  method="post"
  submit_label="Create Lead"
  size="lg"
>
  {% comment %} Name Row {% endcomment %}
  <div class="row">
    <div class="col-md-4">
      <c-form-input
        :field="lead_form.first_name"
        placeholder="First name"
        required
      />
    </div>
    <div class="col-md-4">
      <c-form-input
        :field="lead_form.middle_name"
        placeholder="Middle name (optional)"
      />
    </div>
    <div class="col-md-4">
      <c-form-input
        :field="lead_form.last_name"
        placeholder="Last name"
        required
      />
    </div>
  </div>

  {% comment %} Contact Row {% endcomment %}
  <div class="row">
    <div class="col-md-6">
      <c-form-input
        :field="lead_form.mobile_number"
        type="tel"
        placeholder="+91 98765 43210"
        help_text="Primary mobile number"
      />
    </div>
    <div class="col-md-6">
      <c-form-input
        :field="lead_form.email"
        type="email"
        placeholder="john@example.com"
      />
    </div>
  </div>

  {% comment %} Source & Status {% endcomment %}
  <div class="row">
    <div class="col-md-6">
      <c-form-select :field="lead_form.source" />
    </div>
    <div class="col-md-6">
      <c-form-select :field="lead_form.status" />
    </div>
  </div>

  {% comment %} Address Section {% endcomment %}
  <hr class="my-3" />
  <h6 class="text-muted mb-3">Address Details</h6>

  <div class="row">
    <div class="col-md-12">
      <c-form-input
        :field="lead_form.flat_building"
        placeholder="Flat / Building"
      />
    </div>
  </div>

  <div class="row">
    <div class="col-md-6">
      <c-form-input :field="lead_form.street" placeholder="Street" />
    </div>
    <div class="col-md-6">
      <c-form-input
        :field="lead_form.landmark"
        placeholder="Landmark (optional)"
      />
    </div>
  </div>

  <div class="row">
    <div class="col-md-4">
      <c-form-input :field="lead_form.area" placeholder="Area / Locality" />
    </div>
    <div class="col-md-4">
      <c-form-input :field="lead_form.city" placeholder="City" />
    </div>
    <div class="col-md-4">
      <c-form-input :field="lead_form.state" placeholder="State" />
    </div>
  </div>

  <div class="row">
    <div class="col-md-4">
      <c-form-input
        :field="lead_form.pincode"
        placeholder="6-digit PIN"
        type="number"
      />
    </div>
  </div>

  {% comment %} Notes {% endcomment %}
  <c-form-textarea
    :field="lead_form.notes"
    rows="3"
    placeholder="Additional notes about this lead..."
  />
</c-modal-form>
```

### Membership Sale Form

**File**: `crown_crm/templates/accounting/partials/membership_sale_form.html`

```html
{% comment %} Membership Sale Form Note: Success returns 200 with receipt body,
not 204 {% endcomment %}

<c-modal-form
  title="Record Membership Sale"
  action="{% url 'accounting:hx_create_membership_sale' %}"
  method="post"
  submit_label="Record Sale"
>
  {% comment %} Lead Selection (with search) {% endcomment %}
  <div class="form-group">
    <label>Lead <span class="text-danger">*</span></label>
    <input
      type="text"
      name="lead_search"
      class="form-control"
      placeholder="Search lead by name or mobile..."
      hx-get="{% url 'leads:hx_search' %}"
      hx-trigger="keyup changed delay:300ms"
      hx-target="#lead-search-results"
      autocomplete="off"
    />
    <div id="lead-search-results" class="list-group mt-1"></div>

    {% comment %} Hidden field stores selected lead ID {% endcomment %}
    <input
      type="hidden"
      name="lead"
      value="{{ selected_lead.id|default:'' }}"
    />

    {% if form.lead.errors %}
    <div class="invalid-feedback d-block">{{ form.lead.errors.0 }}</div>
    {% endif %}
  </div>

  {% comment %} Membership Plan {% endcomment %}
  <c-form-select :field="form.membership_plan" />

  {% comment %} Amount & Payment {% endcomment %}
  <div class="row">
    <div class="col-md-6">
      <c-form-input :field="form.amount" type="number" placeholder="0.00" />
    </div>
    <div class="col-md-6">
      <c-form-select :field="form.payment_mode" />
    </div>
  </div>

  {% comment %} Transaction Details {% endcomment %}
  <c-form-input
    :field="form.transaction_id"
    placeholder="Transaction / Reference ID"
    help_text="Leave blank for cash payments"
  />

  {% comment %} Date & Notes {% endcomment %}
  <div class="row">
    <div class="col-md-6">
      <c-form-input :field="form.sale_date" type="date" />
    </div>
    <div class="col-md-6">
      <c-form-input :field="form.valid_till" type="date" />
    </div>
  </div>

  <c-form-textarea
    :field="form.notes"
    rows="2"
    placeholder="Additional notes..."
  />
</c-modal-form>
```

---

## Part 6: Client-Side Event Handlers

**File**: Add to `base.html` or separate `static/js/htmx-events.js`

```javascript
/**
 * HTMX Event Handlers
 *
 * These listen for server-triggered events and update the UI accordingly.
 * Events are triggered via django-htmx's trigger_client_event().
 */

document.body.addEventListener("lead:create_success", function (evt) {
  // Close modal
  const modal = document.querySelector("#create-lead-modal");
  if (modal) {
    $(modal).modal("hide"); // Bootstrap 4
  }

  // Show toast notification
  showToast("Lead created successfully", "success");

  // Refresh lead list if present
  const leadList = document.querySelector("#lead-list");
  if (leadList) {
    htmx.trigger(leadList, "refresh");
  }
});

document.body.addEventListener("lead:update_success", function (evt) {
  const modal = document.querySelector("#edit-lead-modal");
  if (modal) $(modal).modal("hide");

  showToast("Lead updated", "success");

  // Refresh specific row or full list
  const leadId = evt.detail.lead_id;
  const row = document.querySelector(`#lead-row-${leadId}`);
  if (row) {
    htmx.trigger(row, "refresh");
  }
});

document.body.addEventListener("lead:delete_success", function (evt) {
  const leadId = evt.detail.lead_id;
  const row = document.querySelector(`#lead-row-${leadId}`);

  if (row) {
    // Animate removal
    row.style.transition = "opacity 0.3s";
    row.style.opacity = "0";
    setTimeout(() => row.remove(), 300);
  }

  showToast("Lead deleted", "info");
});

document.body.addEventListener(
  "membership_sale:create_success",
  function (evt) {
    const modal = document.querySelector("#membership-sale-modal");
    if (modal) $(modal).modal("hide");

    showToast(evt.detail.message || "Sale recorded!", "success");

    // Refresh receipt list
    const receiptList = document.querySelector("#receipt-list");
    if (receiptList) {
      htmx.trigger(receiptList, "refresh");
    }
  },
);

// Generic toast function
function showToast(message, type = "info") {
  // Implement with your toast library (Toastr, SweetAlert2, etc.)
  if (typeof toastr !== "undefined") {
    toastr[type](message);
  } else {
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}
```

---

## Part 7: URL Configuration

```python
# crown_crm/leads/urls.py
from django.urls import path
from . import views

app_name = 'leads'

urlpatterns = [
    # HTMX endpoints
    path('hx/create/', views.HxCreateLeadView.as_view(), name='hx_create'),
    path('hx/<int:pk>/edit/', views.HxEditLeadView.as_view(), name='hx_edit'),
    path('hx/quick-create/', views.HxQuickCreateLeadView.as_view(), name='hx_quick_create'),
    path('hx/<int:pk>/delete/', views.HxLeadDeleteView.as_view(), name='hx_delete'),
    path('hx/<int:pk>/mobile/delete/', views.HxLeadMobileDeleteView.as_view(), name='hx_mobile_delete'),
    path('hx/<int:pk>/email/delete/', views.HxLeadEmailDeleteView.as_view(), name='hx_email_delete'),
    path('hx/search/', views.HxLeadSearchView.as_view(), name='hx_search'),
    path('hx/validate-email/', views.HxValidateEmailView.as_view(), name='hx_validate_email'),
]

# crown_crm/accounting/urls.py
app_name = 'accounting'

urlpatterns = [
    path('hx/membership-sale/create/', views.HxCreateMembershipSaleView.as_view(), name='hx_create_membership_sale'),
    path('hx/receipt/create/', views.HxCreatePaymentReceiptView.as_view(), name='hx_create_receipt'),
    path('hx/receipt/<int:pk>/edit/', views.HxEditReceiptView.as_view(), name='hx_edit_receipt'),
    path('hx/receipt/<int:pk>/delete/', views.HxDeleteReceiptView.as_view(), name='hx_delete_receipt'),
    path('hx/sale/<int:pk>/update/', views.HxSaleUpdateView.as_view(), name='hx_sale_update'),
    path('hx/sale/<int:pk>/delete/', views.HxSaleDeleteView.as_view(), name='hx_sale_delete'),
]

# crown_crm/logistics/urls.py
app_name = 'logistics'

urlpatterns = [
    path('hx/service/create/', views.HxCreateServiceView.as_view(), name='hx_create_service'),
    path('hx/service/<int:pk>/edit/', views.HxEditServiceView.as_view(), name='hx_edit_service'),
    path('hx/service/<int:pk>/delete/', views.HxDeleteServiceView.as_view(), name='hx_delete_service'),
    path('hx/product/create/', views.HxCreateProductView.as_view(), name='hx_create_product'),
    path('hx/product/<int:pk>/edit/', views.HxEditProductView.as_view(), name='hx_edit_product'),
    path('hx/product/<int:pk>/delete/', views.HxDeleteProductView.as_view(), name='hx_delete_product'),
]

# crown_crm/clients/urls.py
app_name = 'clients'

urlpatterns = [
    path('hx/create/', views.HxCreateClientView.as_view(), name='hx_create_client'),
    path('hx/<int:pk>/delete/', views.HxDeleteClientView.as_view(), name='hx_delete_client'),
]

# crown_crm/organizations/urls.py
app_name = 'organizations'

urlpatterns = [
    path('hx/create/', views.HxOrganizationCreateView.as_view(), name='hx_organization_create'),
]
```

---

## Part 8: Complete Status Code Reference

| View                         | File                   | Success Status | Error Status | Has Body?      | Event Name                       |
| ---------------------------- | ---------------------- | -------------- | ------------ | -------------- | -------------------------------- |
| `HxCreateLeadView`           | leads/views.py         | **204**        | 422          | No             | `lead:create_success`            |
| `HxEditLeadView`             | leads/views.py         | **204**        | 422          | No             | `lead:update_success`            |
| `HxQuickCreateLeadView`      | leads/views.py         | **204**        | 422          | No             | `lead:quick_create_success`      |
| `HxLeadDeleteView`           | leads/views.py         | **204**        | -            | No             | `lead:delete_success`            |
| `HxCreateMembershipSaleView` | accounting/views.py    | **200**        | 422          | Yes (receipt)  | `membership_sale:create_success` |
| `HxCreatePaymentReceiptView` | accounting/views.py    | **204**        | 422          | No             | `receipt:create_success`         |
| `HxEditReceiptView`          | accounting/views.py    | **204**        | 422          | No             | `receipt:update_success`         |
| `HxSaleUpdateView`           | accounting/views.py    | **204**        | 422          | No             | `sale:update_success`            |
| `HxDeleteReceiptView`        | accounting/views.py    | **204**        | -            | No             | `receipt:delete_success`         |
| `HxSaleDeleteView`           | accounting/views.py    | **204**        | -            | No             | `sale:delete_success`            |
| `HxCreateServiceView`        | logistics/views.py     | **200\***      | 422          | Check template | `service:create_success`         |
| `HxEditServiceView`          | logistics/views.py     | **204**        | 422          | No             | `service:update_success`         |
| `HxDeleteServiceView`        | logistics/views.py     | **204**        | -            | No             | `service:delete_success`         |
| `HxCreateProductView`        | logistics/views.py     | **200\***      | 422          | Check template | `product:create_success`         |
| `HxEditProductView`          | logistics/views.py     | **204**        | 422          | No             | `product:update_success`         |
| `HxDeleteProductView`        | logistics/views.py     | **204**        | -            | No             | `product:delete_success`         |
| `HxCreateClientView`         | clients/views.py       | **200\***      | 422          | Check template | `client:create_success`          |
| `HxDeleteClientView`         | clients/views.py       | **204**        | -            | No             | `client:delete_success`          |
| `HxOrganizationCreateView`   | organizations/views.py | **200\***      | 422          | Check template | `organization:create_success`    |

\*Check if your template returns HTML body on success. If yes, use 200. If no body, use 204.

---

## Part 9: Testing Checklist for Junior Developers

### Manual Testing Steps

1. **Validation Error Test**

   ```bash
   # Open browser DevTools → Network tab
   # Submit form with empty required fields
   # EXPECT: 422 status, form re-renders with red borders and error messages
   # CHECK: `is-invalid` class present on invalid inputs
   # CHECK: `invalid-feedback` divs visible
   ```

2. **Success Test (204)**

   ```bash
   # Submit valid form for views returning 204
   # EXPECT: 204 status, modal closes, toast appears
   # CHECK: Network tab shows no response body
   # CHECK: Console shows event triggered
   ```

3. **Success Test (200 with body)**

   ```bash
   # Submit membership sale form
   # EXPECT: 200 status, receipt HTML appears in modal
   # CHECK: Response body contains receipt template
   ```

4. **Delete Test**

   ```bash
   # Click delete button, confirm dialog
   # EXPECT: 204 status, row animates out
   # CHECK: htmx-confirm attribute present
   ```

5. **CSRF Test**
   ```bash
   # Remove CSRF token from form
   # EXPECT: 400 status, error message displayed
   # CHECK: htmx:beforeSwap handler catches 400
   ```

### Automated Tests

```python
# crown_crm/leads/tests/test_htmx_views.py
import pytest
from django.urls import reverse
from django_htmx.middleware import HtmxMiddleware


class TestHxCreateLeadView:
    def test_get_returns_form(self, client):
        """GET request returns empty form."""
        response = client.get(
            reverse('leads:hx_create'),
            HTTP_HX_REQUEST='true'
        )
        assert response.status_code == 200
        assert b'first_name' in response.content

    def test_post_valid_returns_204(self, client):
        """Valid POST returns 204 and triggers event."""
        response = client.post(
            reverse('leads:hx_create'),
            data={
                'first_name': 'John',
                'last_name': 'Doe',
                'mobile_number': '9876543210',
                'source': 'website'
            },
            HTTP_HX_REQUEST='true'
        )
        assert response.status_code == 204
        assert 'HX-Trigger' in response.headers
        assert 'lead:create_success' in response.headers['HX-Trigger']

    def test_post_invalid_returns_422(self, client):
        """Invalid POST returns 422 with error display."""
        response = client.post(
            reverse('leads:hx_create'),
            data={'first_name': ''},  # Missing required fields
            HTTP_HX_REQUEST='true'
        )
        assert response.status_code == 422
        assert b'is-invalid' in response.content
        assert b'invalid-feedback' in response.content

    def test_non_htmx_returns_400(self, client):
        """Non-HTMX request rejected."""
        response = client.get(reverse('leads:hx_create'))
        assert response.status_code == 400


class TestHxLeadDeleteView:
    def test_delete_returns_204(self, client, lead):
        """DELETE returns 204 and triggers event."""
        response = client.delete(
            reverse('leads:hx_delete', kwargs={'pk': lead.pk}),
            HTTP_HX_REQUEST='true'
        )
        assert response.status_code == 204
        assert 'HX-Trigger' in response.headers
        assert 'lead:delete_success' in response.headers['HX-Trigger']
```

---

## Part 10: Migration Strategy from Current Code

### Phase 1: Setup (1-2 hours)

1. Install `django-cotton`: `pip install django-cotton`
2. Add to `INSTALLED_APPS`
3. Create `templates/cotton/` directory
4. Build `c-form-input`, `c-form-select`, `c-modal-form` components
5. Add `htmx:beforeSwap` handler to `base.html`

### Phase 2: Create Mixin (30 minutes)

1. Create `crown_crm/core/mixins.py`
2. Implement `HtmxFormMixin`
3. Test with one simple view

### Phase 3: Migrate Views (Per view: 15-30 minutes)

For each view in your original plan:

1. Convert to class-based view using `HtmxFormMixin`
2. Set correct `success_status` (200 vs 204)
3. Set `success_event` name
4. Update URL to use `.as_view()`
5. Replace template with Cotton components

### Phase 4: Templates (Per template: 10-20 minutes)

1. Replace manual `<input>` tags with `<c-form-input>`
2. Replace manual `<select>` with `<c-form-select>`
3. Wrap in `<c-modal-form>` if modal
4. Remove all `{% if field.errors %}is-invalid{% endif %}` logic (handled by Cotton)

### Phase 5: Testing (2-3 hours)

1. Run automated tests
2. Manual testing per checklist
3. Verify all 12 views return correct status codes

---

## Summary of Improvements Over Original Plan

| Aspect              | Original Plan                        | This Review                                |
| ------------------- | ------------------------------------ | ------------------------------------------ |
| **Error Classes**   | Manual `is-invalid` in 12+ templates | Encapsulated in `c-form-input` once        |
| **View Code**       | Repetitive status code logic         | `HtmxFormMixin` handles all cases          |
| **Template Syntax** | Verbose, error-prone                 | Clean `<c-form-input>` calls               |
| **HTMX Attributes** | Hardcoded per field                  | Proxied via `{{ attrs }}`                  |
| **Modal Handling**  | Manual form + modal HTML             | `<c-modal-form>` wrapper                   |
| **Event Handling**  | Not specified                        | Standardized event names + handlers        |
| **Testing**         | Manual checklist only                | Automated + manual tests                   |
| **Delete Views**    | Listed but not detailed              | `c-delete-button` component + 204 handling |
| **CSRF Errors**     | Mentioned 400                        | Explicit handler in `base.html`            |

This architecture gives you **maintainable, testable, and consistent** HTMX form handling across your entire SaaS. The Cotton component library grows with your project—add `c-form-date`, `c-form-phone`, etc., as needed, and all forms instantly benefit.
