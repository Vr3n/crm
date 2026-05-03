You have the right diagnosis and the right fix. One correction on Task 2 before your junior dev codes it.

---

## Task 2 Correction: `get_context_data` Signature is Wrong

Your current code:

```python
def get_context_data(self, kwargs):
    context = super().get_context_data(kwargs)
```

This is **not** how Django's `get_context_data` works. It should be:

```python
def get_context_data(self, **kwargs):
    context = super().get_context_data(**kwargs)
```

But more importantly, your `HtmxFormMixin` doesn't use `get_context_data()` at all — it uses `render_form()` with a manual context dict. So overriding `get_context_data` has **no effect** on GET requests.

Look at your `HtmxFormMixin.get()`:

```python
def get(self, request, *args, **kwargs):
    form = self.get_form()
    return self.render_form(form)  # ← Only passes 'form', nothing else
```

And `render_form()`:

```python
def render_form(self, form=None, extra_context=None, status=200):
    context = {}
    if form is not None:
        context[self.context_object_name] = form
    if extra_context:
        context.update(extra_context)
    return TemplateResponse(self._request, self.template_name, context, status=status)
```

**Fix `get()`, not `get_context_data()`:**

```python
class HtmxFormsetMixin(HtmxFormMixin):
    def get(self, request, *args, **kwargs):
        form = self.get_form()
        extra = {}
        for name, formset_class in self.get_formset_classes().items():
            extra[f'{name}_formset'] = formset_class(prefix=name)
        return self.render_form(form, extra_context=extra)
```

This ensures `mobile_formset` and `email_formset` are available on initial GET render with proper `total_form_count()` values .

---

## Optional: `get_context_data` is Still Useful for POST

Your `form_invalid()` calls `render_form(form, extra_context=context)`. If you want `get_context_data` to work for consistency, call it from `render_form`:

```python
def render_form(self, form=None, extra_context=None, status=200):
    context = self.get_context_data()  # Get base context
    if form is not None:
        context[self.context_object_name] = form
    if extra_context:
        context.update(extra_context)
    return TemplateResponse(self._request, self.template_name, context, status=status)
```

But this is a bigger refactor. For now, just fix `get()`.

---

## Updated Task 2

**File**: `crown_crm/core/mixins.py`

**Change**: Override `get()` in `HtmxFormsetMixin` to pass formsets on initial render.

```python
class HtmxFormsetMixin(HtmxFormMixin):
    def get(self, request, *args, **kwargs):
        form = self.get_form()
        extra = {}
        for name, formset_class in self.get_formset_classes().items():
            extra[f'{name}_formset'] = formset_class(prefix=name)
        return self.render_form(form, extra_context=extra)

    def post(self, request, *args, **kwargs):
        # ... existing code ...
```

Remove or deprecate the `get_context_data` override — it's dead code if `render_form` doesn't use it.

---

## Final File List

| #   | File                                     | Change                                               |
| --- | ---------------------------------------- | ---------------------------------------------------- |
| 1   | `templates/leads/forms/lead_create.html` | Move `{{ management_form }}` inside containers       |
| 2   | `core/mixins.py`                         | Fix `HtmxFormsetMixin.get()` to pass formsets        |
| 3   | `leads/forms.py`                         | (Optional) `SafeFormSet` with friendly error message |

Test and ship.
