The plan is clean and ready to implement. One final issue worth flagging before the junior dev starts coding.

---

## The One Remaining Issue: `lead` field on `MembershipSaleForm` uses the wrong widget

The base form declares:

```python
"lead": forms.Select(attrs={"class": "form-control select2", "required": True}),
```

But in the template, `lead` is rendered as a **manual hidden input**, not via `{{ form.lead }}`. The Django `Select` widget for `lead` renders a `<select>` dropdown of every lead in the database — which is never shown and never submitted. The actual submitted value comes from the hand-written `<input type="hidden" name="lead" id="id_lead">`.

This causes two problems. First, Django's form validation will try to validate the `Select` widget's submitted value against `ModelChoiceField` normally, which works fine since the hidden input submits the same `name="lead"` — but only if the lead PK is a valid integer. Second, if the junior dev ever accidentally renders `{{ form.lead }}` in the template, a massive unfiltered select of all leads appears.

**Fix**: Override the `lead` widget to `HiddenInput` in the form, and remove `"required": True` from the attrs (it does nothing server-side):

```python
"lead": forms.HiddenInput(),
```

The `ModelChoiceField` for `lead` is still required by default (it's a non-nullable FK), so Django will still raise a validation error if the value is missing or invalid. You get identical server-side validation, but the widget now matches how the template actually renders it. If the lead error needs displaying, `{{ form.lead.errors.0 }}` still works — the plan already has that in the template.

---

That's the last issue.
