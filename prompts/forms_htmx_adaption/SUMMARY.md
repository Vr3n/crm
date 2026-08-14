# Forms HTMX Adaptation - Project Summary

## Context for AI

This project refactors Django forms to use HTMX for seamless partial page updates. The goal is consistent status code handling, reusable cotton components, and proper 422 error handling.

---

## Core Architecture

### Status Code Rules

- **422**: Validation errors → form re-rendered with errors
- **204**: Success, no body → trigger client event
- **200**: Success with body (rare, for redirects)

### HTMX Pattern

- Form submits to Django view
- If invalid → return form HTML (422), HTMX swaps into modal
- If valid → return 204 + trigger event (e.g., `lead-created`)

---

## Key Components

### 1. Mixins (`crown_crm/core/mixins.py`)

```python
from django.http import HttpResponse
from django.core.exceptions import ImproperlyConfigured
from django_htmx.http import trigger_client_event

class HtmxFormMixin:
    """Standard HTMX form view mixin."""
    template_name = None
    form_class = None
    success_event = None  # e.g., "lead-created"
    success_status = 204
    context_object_name = "form"

    def dispatch(self, request, *args, **kwargs):
        if not getattr(request, 'htmx', False):
            from django.http import HttpResponseBadRequest
            return HttpResponseBadRequest("HTMX request required")
        self._request = request
        return super().dispatch(request, *args, **kwargs)

    def get(self, request, *args, **kwargs):
        form = self.get_form()
        return self.render_form(form)

    def post(self, request, *args, **kwargs):
        form = self.get_form()
        if form.is_valid():
            return self.form_valid(form)
        return self.form_invalid(form)

    def get_form(self, **kwargs):
        form_kwargs = self.get_form_kwargs()
        form_kwargs.update(kwargs)
        if self._request.method == "POST":
            return self.form_class(self._request.POST, self._request.FILES, **form_kwargs)
        return self.form_class(**form_kwargs)

    def get_form_kwargs(self):
        return {}

    def render_form(self, form=None, extra_context=None, status=200):
        from django.template.response import TemplateResponse
        context = {}
        if form is not None:
            context[self.context_object_name] = form
        if extra_context:
            context.update(extra_context)
        return TemplateResponse(self._request, self.template_name, context, status=status)

    def htmx_success(self, context=None, template_name=None):
        if self.success_status == 204:
            response = HttpResponse(status=204)
            if self.success_event:
                response = trigger_client_event(response, self.success_event, self.get_success_event_params())
            return response
        return TemplateResponse(self._request, template_name or self.template_name, context or {}, status=200)

    def get_success_event_params(self):
        return {}

    def form_valid(self, form):
        self._object = form.save()
        return self.htmx_success()

    def form_invalid(self, form, **context):
        return self.render_form(form, extra_context=context, status=422)


class HtmxDeleteMixin:
    """HTMX delete view mixin - returns 204 + trigger event."""
    model = None
    success_event = None
    pk_url_kwarg = 'pk'
    event_id_key = 'id'

    def dispatch(self, request, *args, **kwargs):
        if not getattr(request, 'htmx', False):
            from django.http import HttpResponseBadRequest
            return HttpResponseBadRequest("HTMX request required")
        self._request = request
        return super().dispatch(request, *args, **kwargs)

    def delete(self, request, *args, **kwargs):
        from django.shortcuts import get_object_or_404
        obj = get_object_or_404(self.model, pk=self.kwargs[self.pk_url_kwarg])
        obj_id = obj.id
        obj.delete()
        response = HttpResponse(status=204)
        if self.success_event:
            response = trigger_client_event(response, self.success_event, {self.event_id_key: obj_id})
        return response


class HtmxFormsetMixin(HtmxFormMixin):
    """HTMX form with Django formsets."""
    formset_classes = None  # {'mobile': LeadMobileFormSet, 'email': LeadEmailFormSet}

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        for name, formset_class in self.get_formset_classes().items():
            context[f'{name}_formset'] = kwargs.get(f'{name}_formset') or formset_class()
        return context

    def get_formset_classes(self):
        if self.formset_classes is None:
            raise ImproperlyConfigured("Must define formset_classes")
        return self.formset_classes

    def post(self, request, *args, **kwargs):
        form = self.get_form()
        self.formsets = {}
        all_valid = form.is_valid()

        for name, formset_class in self.get_formset_classes().items():
            self.formsets[name] = formset_class(request.POST, prefix=name)
            all_valid = all_valid and self.formsets[name].is_valid()

        if all_valid:
            self._object = form.save()
            for name, fs in self.formsets.items():
                fs.instance = self._object
                fs.save()
            return self.htmx_success()

        context = {f'{name}_formset': fs for name, fs in self.formsets.items()}
        return self.form_invalid(form, **context)
```

### Usage Example

```python
from django.views import View
from django.shortcuts import render
from crown_crm.core.mixins import HtmxFormsetMixin

class HxCreateLeadView(HtmxFormsetMixin, View):
    template_name = "leads/forms/lead_create.html"
    form_class = LeadCreateForm
    formset_classes = {
        'mobile': LeadMobileFormSet,
        'email': LeadEmailFormSet,
    }
    success_event = "lead-created"
```

### 2. Cotton Components (`crown_crm/templates/cotton/`)

**c-form-wrapper** (use instead of c-modal-form):

```django
<c-vars action method="post" attrs="" />
<form hx-{{ method }}="{{ action }}" hx-target="this" hx-swap="outerHTML" {{ attrs }}>
  {% csrf_token %}
  {{ slot }}
</form>
```

**c-form-input**:

```django
<c-vars field type="text" placeholder="" label="" help_text="" />
<div class="form-group">
  <label for="{{ field.id_for_label }}">{{ label|default:field.label }}</label>
  <input type="{{ type }}" name="{{ field.html_name }}" id="{{ field.id_for_label }}"
         value="{{ field.value|default:'' }}" placeholder="{{ placeholder }}"
         class="form-control {% if field.errors %}is-invalid{% endif %}"
         {% if field.field.required %}required{% endif %} hx-validate="true" {{ attrs }} />
  {% if field.errors %}<div class="invalid-feedback">{{ field.errors.0 }}</div>{% endif %}
</div>
```

**c-form-errors**:

```django
<c-vars form />
{% if form.non_field_errors %}
<div class="alert alert-danger" role="alert">
  <strong>Please correct the following errors:</strong>
  <ul class="mb-0 mt-2">{% for error in form.non_field_errors %}<li>{{ error }}</li>{% endfor %}</ul>
</div>
{% endif %}
```

**c-form-hidden**:

```django
<c-vars field />
<input type="hidden" name="{{ field.html_name }}" id="{{ field.id_for_label }}" value="{{ field.value|default:'' }}" />
```

**c-submit-button**:

```django
<c-vars label="Submit" />
<button type="submit" class="btn btn-primary">
  {{ label }}<span class="htmx-indicator ms-1"></span>
</button>
```

**Note**: Don't use `c-modal-form` - conflicts with existing `#modal-container` in base.html.

### 3. Event Naming

All events use **kebab-case**: `lead-created`, `lead-deleted`, `receipt-created`, etc.

---

## Forms with HTMX Views

### Leads Module

- `HxCreateLeadView` - Create lead with formsets (mobile, email, address)
- `HxEditLeadView` - Edit existing lead
- `HxDeleteLeadView` - Delete with confirmation

### Accounting Module

- `HxCreateMembershipSaleView` - Create membership sale
- `HxDeleteSaleView` - Delete sale

---

## Important Patterns

### Form Wrapper (use this pattern)

```django
<c-form-wrapper action="{% url 'hx-create-lead' slug=request.organization.slug %}" method="post">
  <c-form-errors :form="lead_form" />
  <c-form-input :field="lead_form.first_name" />
  <c-form-hidden :field="lead_form.organization" />
  <c-submit-button label="Save Lead" />
</c-form-wrapper>
```

### HTMX Attributes on Form

- `hx-target="this"` - Form replaces itself
- `hx-swap="outerHTML"` - Full replacement (required for 422)

### Mobile Number Validation (in forms.py)

```python
import re
from django import forms
from django.core.validators import RegexValidator

class LeadMobileNumberForm(forms.ModelForm):
    mobile_number = forms.CharField(
        label="Mobile Number",
        max_length=10,
        min_length=10,
        validators=[RegexValidator(regex=r'^\d{10}$', message="Enter a valid 10-digit mobile number")],
        widget=forms.TextInput(attrs={"class": "form-control", "inputmode": "numeric", "maxlength": "10", "pattern": r"\d{10}"})
    )
    class Meta:
        model = LeadMobileNumberMaster
        fields = ["mobile_number"]

class LeadEmailForm(forms.ModelForm):
    email = forms.EmailField(label="Email Address", widget=forms.EmailInput(attrs={"class": "form-control"}))
    class Meta:
        model = LeadEmailAddressMaster
        fields = ["email"]

class LeadCreateForm(forms.ModelForm):
    class Meta:
        model = LeadMaster
        fields = ["organization", "first_name", "middle_name", "last_name", "source"]
        widgets = {"organization": forms.HiddenInput()}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["first_name"].required = True
        self.fields["last_name"].required = True
```

---

## Files to Know

| File                                     | Purpose                           |
| ---------------------------------------- | --------------------------------- |
| `core/mixins.py`                         | HtmxFormMixin, HtmxDeleteMixin    |
| `templates/cotton/*.html`                | Reusable form components          |
| `leads/forms.py`                         | Lead forms with validation        |
| `leads/views.py`                         | HxCreateLeadView, HxEditLeadView  |
| `templates/leads/forms/lead_create.html` | Main create form                  |
| `base.html`                              | Has `#modal-container` for modals |

---

## Common Issues & Fixes

1. **422 empty response** → Use `hx-swap="outerHTML"`, not `"none"`
2. **403 errors** → Remove `permission_required` from mixins (use decorators instead)
3. **Formset data lost on 422** → Store formsets in mixin, pass to context
4. **Modal conflict** → Use `c-form-wrapper` not `c-modal-form`

---

## Next Steps

See `prompts/client-validation-htmx/plan.md` for client-side validation improvements (real-time validation, digit-only enforcement).
