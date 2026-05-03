/**
 * Hybrid validation: HTML5 + Constraint Validation API + Django 422 fallback
 * Scope: Only forms with data-validate attribute
 * 
 * Load order: Must be loaded AFTER htmx.min.js
 */

(function () {
  'use strict';

  // Track initialized containers - prevents duplicate listeners
  const initialized = new WeakSet();

  // ── Rules: map field name suffix → validation config ──
  const RULES = {
    mobile_number: {
      pattern: /^\d{10}$/,
      message: 'Enter a valid 10-digit mobile number',
      enforceDigits: true,
      maxLength: 10,
    },
    email: {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: 'Enter a valid email address',
    },
  };

  function getRule(field) {
    const name = field.name || field.id;
    for (const key of Object.keys(RULES)) {
      if (name.includes(key)) return RULES[key];
    }
    return null;
  }

  // ── Enforce input constraints as user types ──
  function enforceConstraints(field) {
    const rule = getRule(field);
    if (!rule) return;

    if (rule.enforceDigits) {
      const clean = field.value
        .replace(/\D/g, '')
        .slice(0, rule.maxLength || 999);
      if (field.value !== clean) {
        field.value = clean;
      }
    }
  }

  // ── Validate using Constraint Validation API ──
  function validateField(field) {
    const rule = getRule(field);
    if (!rule) {
      field.setCustomValidity('');
      return true;
    }

    const value = field.value.trim();

    if (field.required && !value) {
      field.setCustomValidity(rule.message || 'This field is required');
      return false;
    }

    if (value && rule.pattern && !rule.pattern.test(value)) {
      field.setCustomValidity(rule.message);
      return false;
    }

    field.setCustomValidity('');
    return true;
  }

  // ── Visual feedback (Bootstrap classes) ──
  function updateVisuals(field) {
    const group = field.closest('.form-group');
    if (!group) return;

    const oldError = group.querySelector('.js-custom-error');
    if (oldError) oldError.remove();

    if (field.validity.valid) {
      field.classList.remove('is-invalid');
      if (field.value && document.activeElement !== field) {
        field.classList.add('is-valid');
      }
    } else {
      field.classList.remove('is-valid');
      field.classList.add('is-invalid');

      if (field.validationMessage) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'invalid-feedback js-custom-error';
        errorDiv.textContent = field.validationMessage;
        group.appendChild(errorDiv);
      }
    }
  }

  // ── Event handlers ──
  function onInput(e) {
    const field = e.target;
    if (!field.matches('input, select, textarea')) return;

    enforceConstraints(field);

    const rule = getRule(field);
    if (!rule) return;

    // Validate if correcting an error, or if field has value
    if (field.classList.contains('is-invalid') || field.value) {
      validateField(field);
      updateVisuals(field);
    }
  }

  function onBlur(e) {
    const field = e.target;
    if (!field.matches('input, select, textarea')) return;
    validateField(field);
    updateVisuals(field);
  }

  // ── Initialization (idempotent with WeakSet) ──
  function initValidation(scope) {
    const container =
      scope?.closest?.('[data-validate]') ||
      document.querySelector('[data-validate]') ||
      document.body;

    if (initialized.has(container)) return;
    initialized.add(container);

    container.addEventListener('input', onInput);
    container.addEventListener('focusout', onBlur);
  }

  // ── Bootstrap on load ──
  document.addEventListener('DOMContentLoaded', function () {
    document
      .querySelectorAll('form[data-validate]')
      .forEach(function (form) {
        initValidation(form);
      });
  });

  // HTMX after swap: handle both self-swap and container-swap scenarios
  if (document.body) {
    document.body.addEventListener('htmx:afterSettle', function (e) {
      const swapped = e.detail.elt;
      const form = swapped.matches?.('[data-validate]')
        ? swapped
        : swapped.closest?.('[data-validate]') ||
          swapped.querySelector?.('[data-validate]');

      if (form) initValidation(form);
    });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      document.body.addEventListener('htmx:afterSettle', function (e) {
        const swapped = e.detail.elt;
        const form = swapped.matches?.('[data-validate]')
          ? swapped
          : swapped.closest?.('[data-validate]') ||
            swapped.querySelector?.('[data-validate]');

        if (form) initValidation(form);
      });
    });
  }
})();