HTMX Form Handling
==================

This section documents the HTMX form handling implementation for Crown CRM.

.. toctree::
   :maxdepth: 2
   :caption: Contents:

   phase_coverage_report
   phase6_template_migration

Overview
--------

The HTMX form handling system provides consistent status code handling:

- **422**: Validation errors (form re-rendered with errors)
- **204**: Success, no body, trigger client event
- **200**: Success with body (template rendered)

Components
----------

- ``c-form-wrapper`` - Form wrapper with HTMX attributes (replaces c-modal-form)
- ``c-form-input`` - Bootstrap 4 input component
- ``c-form-select`` - Bootstrap 4 select dropdown
- ``c-form-errors`` - Non-field form errors
- ``c-form-hidden`` - Hidden input fields
- ``c-formset`` - Django formset wrapper
- ``c-submit-button`` - HTMX-aware submit button

.. note::

   ``c-modal-form`` is not used to avoid conflict with existing ``#modal-container`` infrastructure in ``base.html``. Use ``c-form-wrapper`` instead.

Mixins
------

- ``HtmxFormMixin`` - Standard form views
- ``HtmxDeleteMixin`` - Delete views
- ``HtmxFormsetMixin`` - Form views with formsets

Event Names
-----------

All events use kebab-case format:
- ``lead-created``, ``lead-updated``, ``lead-deleted``
- ``receipt-created``, ``receipt-updated``, ``receipt-deleted``
- ``service-created``, ``service-updated``, ``service-deleted``
- ``product-created``, ``product-updated``, ``product-deleted``
- ``client-created``, ``client-deleted``
- ``organization-created``, ``organization-updated``