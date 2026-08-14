Phase 6: Template Migration to Cotton Components
===================================================

This phase migrated form templates to use the cotton components created in Phases 1-4, replacing manual form field rendering with reusable components.

Overview
--------

Prior to this phase, form templates used manual patterns like:

.. code-block:: django

    <label>First Name</label>
    {{ lead_form.first_name }}
    {% if lead_form.first_name.errors %}
    <div class="invalid-feedback d-block">
      {{ lead_form.first_name.errors }}
    </div>
    {% endif %}

This pattern was replaced with cotton components:

.. code-block:: django

    <c-form-input :field="lead_form.first_name" />

Problem: Modal Architecture Conflict
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The original plan included using ``c-modal-form`` component. However, this conflicted with the existing modal infrastructure in ``base.html``:

- ``base.html`` has a global ``#modal-container`` with ``#modal-form`` as the target
- ``c-modal-form`` creates its own modal markup
- These two patterns cannot coexist

Solution: Use ``c-form-wrapper`` instead of ``c-modal-form``. The existing ``#modal-container`` pattern is preserved, and forms load into ``#modal-form`` target.

New Cotton Components
---------------------

1. c-form-wrapper
   ~~~~~~~~~~~~~~

Location: ``crown_crm/templates/cotton/form_wrapper.html``

Purpose: Wraps form with proper HTMX attributes for self-replacing forms.

.. code-block:: django

    <c-vars action method="post" attrs="" />
    <form hx-{{ method }}="{{ action }}" hx-target="this" hx-swap="outerHTML" {{ attrs }}>
      {% csrf_token %}
      {{ slot }}
    </form>

Key attributes:
- ``hx-target="this"`` - Form replaces itself on response
- ``hx-swap="outerHTML"`` - Full form replacement (required for 422 errors)
- ``{{ attrs }}`` - Allows additional attributes like ``hx-indicator``

Usage:

.. code-block:: django

    <c-form-wrapper action="{% url 'hx-create-lead' slug=request.organization.slug %}" method="post">
      <c-form-errors :form="lead_form" />
      <c-form-input :field="lead_form.first_name" />
      <c-submit-button label="Save Lead" />
    </c-form-wrapper>

2. c-form-hidden
   ~~~~~~~~~~~~~~

Location: ``crown_crm/templates/cotton/form_hidden.html``

Purpose: Renders hidden input fields (e.g., organization field).

.. code-block:: django

    <c-vars field />
    <input type="hidden" name="{{ field.html_name }}" id="{{ field.id_for_label }}" value="{{ field.value|default:'' }}" />

Usage:

.. code-block:: django

    <c-form-hidden :field="lead_form.organization" />

Why this matters: Django's ``HiddenInput`` widget renders as a text input when passed through ``c-form-input``. The ``c-form-hidden`` component correctly renders hidden fields.

Form Fixes
----------

1. MembershipSaleForm (accounting/forms.py)
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Removed the unused ``organization`` kwarg handling:

Before:

.. code-block:: python

    def __init__(self, *args, **kwargs):
        kwargs.pop("organization", None)  # Popped but not used
        super().__init__(*args, **kwargs)

After:

.. code-block:: python

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)  # No pop needed

The mixin passes ``organization`` via ``get_form_kwargs()``, but this form doesn't need it (set in view's ``form_valid()``).

Templates Migrated
------------------

1. leads/forms/lead_create.html
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Used by: ``HxCreateLeadView``

Changes:
- Replaced ``<form>`` with ``<c-form-wrapper>``
- Replaced all ``{{ form.field }}`` with ``<c-form-input>``
- Added ``<c-form-errors>``
- Added ``<c-form-hidden>`` for organization field
- Replaced submit button with ``<c-form-submit-button>``

Key code:

.. code-block:: django

    <c-form-wrapper action="{% url 'hx-create-lead' slug=request.organization.slug %}" method="post">
      <c-form-errors :form="lead_form" />

      <div class="card mb-3">
        <div class="card-header">Lead Details</div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-3">
              <c-form-input :field="lead_form.first_name" />
            </div>
            <div class="col-md-3">
              <c-form-input :field="lead_form.middle_name" />
            </div>
            <!-- ... more fields ... -->
          </div>
        </div>
      </div>

      <c-form-hidden :field="lead_form.organization" />

      <!-- Formset fields -->
      <c-form-input :field="form.mobile_number" />

      <!-- Submit -->
      <c-submit-button label="Save Lead" />
    </c-form-wrapper>

2. leads/forms/lead_form.html
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~

Used by: ``HxEditLeadView``

Same migration pattern as lead_create.html.

Status Codes After Migration
-----------------------------

The migration preserves proper status code handling:

- **GET request**: Render form with 200 OK
- **POST with errors**: Render form with errors, 422 Unprocessable Entity
- **POST success**: 204 No Content, trigger client event

HTMX flow:
1. Form submits to URL
2. View validates form
3. If invalid: return form HTML (422)
4. ``hx-swap="outerHTML"`` replaces the form in DOM
5. If valid: return 204 + trigger event

Event Names
-----------

Events triggered on successful form submission (kebab-case):

- ``lead-created``
- ``lead-updated``
- ``lead-deleted``

These events allow other components (like lead list) to refresh after form submission.

Not Migrated (Low Priority)
---------------------------

The following templates were in the original plan but not migrated:

1. **accounting/forms/payment_receipt_form.html** - Dead code, not referenced by any view
2. **logistics/forms/service_form.html** - Not actively used by Hx views
3. **logistics/forms/product_form.html** - Not actively used by Hx views
4. **clients/forms/client_create.html** - Not actively used by Hx views
5. **organizations/forms/create-organization.html** - Not actively used by Hx views

These can be migrated in the future if needed.

Verification
------------

Django system check passes:

.. code-block:: bash

    $ uv run python manage.py check
    System check identified no issues (0 silenced).

See Also
--------

- :doc:`phase_coverage_report` - Overall phase coverage status
- :doc:`/index` - Main documentation index
- Cotton components: ``crown_crm/templates/cotton/``