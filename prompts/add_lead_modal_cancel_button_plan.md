# Add Lead Modal - Cancel Button Implementation Plan

## Summary

Add a Cancel button beside the "Save Lead" button in the Add Lead modal form.

## Current State

**File:** `/home/vr3n/codes/crm/crown_crm/templates/leads/forms/lead_create.html`

- Line 202: Only has `Save Lead` submit button
- Line 183: No Cancel button exists in this template

The modal uses Bootstrap's `data-dismiss="modal"` attribute or jQuery's `$('#modal-container').modal('hide')` to close.

## Implementation

### Changes Required

**File:** `/home/vr3n/codes/crm/crown_crm/templates/leads/forms/lead_create.html`

**Current (line 202):**
```html
<button type="submit" class="btn btn-success">Save Lead</button>
```

**Change to:**
```html
<div class="d-flex gap-2">
  <button type="submit" class="btn btn-success">Save Lead</button>
  <button type="button" class="btn btn-outline-danger" onclick="closeModal()">Cancel</button>
</div>
```

**Add JavaScript function (at end of file, before `{% endblock %}`):**
```html
<script>
  function closeModal() {
    var form = document.getElementById("lead-create-form-partial");
    if (form) {
      form.reset();
    }
    $('#modal-container').modal('hide');
  }
</script>
```

## Notes

- The `data-dismiss="modal"` attribute can also be used on the Cancel button, but jQuery `.modal('hide')` allows additional reset logic
- Modal close logic is already implemented in `base.html:227` for `lead_create_success` event
- The form ID is `lead-create-form-partial` (line 2 of lead_create.html)