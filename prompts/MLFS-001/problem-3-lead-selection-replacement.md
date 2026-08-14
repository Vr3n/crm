# MLFS-001: Selecting New Lead Doesn't Replace Existing Selection

## Symptom

When a lead is already selected and displayed in the "Selected Lead" card, clicking the "Select" button on a different lead from the table does not replace the existing selection. The previously selected lead remains displayed.

## Current Behavior

The `selectLeadFromTable` function in `membership_sale_form.html` (lines 410-433) appears to handle the replacement:

```javascript
function selectLeadFromTable(btn, event) {
  // Prevent click from bubbling to <tr> and triggering popover
  event.stopPropagation();

  const row = $(btn).closest(".lead-row");
  const leadId = row.data("lead-id");
  const leadName = row.data("lead-name");
  const mobile = row.data("lead-mobile");
  const email = row.data("lead-email");

  // Set hidden input
  document.getElementById("id_lead").value = leadId;

  // Show selected lead card
  document.getElementById("leadSelection").innerHTML = selectedLeadCard(
    leadName,
    leadId,
    [mobile],
    [email],
  );

  // Close any open popovers
  $(".lead-row").popover("hide");
}
```

This code looks correct - it should replace the innerHTML of `#leadSelection` with the new lead's card.

## Potential Root Causes

### Possible Issue 1: Event propagation not properly stopped

The `event.stopPropagation()` might not be working correctly depending on how the click event is triggered.

### Possible Issue 2: Popover blocking interaction

The Bootstrap popover initialized on `.lead-row` might be intercepting clicks or causing visual overlay issues.

### Possible Issue 3: HTMX swapping interfering

When the lead table is loaded via HTMX (on search), the `initLeadTablePopovers()` function might not be re-called properly after the swap, causing the popovers to not work or interfere.

### Possible Issue 4: CSS z-index or stacking context

There might be a visual issue where the new card appears but is behind another element.

## Investigation Steps

1. **Check browser console** - Look for JavaScript errors when clicking "Select"
2. **Inspect the DOM** - After clicking Select, verify:
   - `#leadSelection` innerHTML contains the new lead's card
   - `#id_lead` hidden input has the new lead's ID
3. **Check if function is called** - Add console.log to verify function execution
4. **Verify popover state** - Check if popover is hiding properly

## Plan to Fix

### Step 1: Debug and confirm the issue

Add console logging to understand what's happening:

```javascript
function selectLeadFromTable(btn, event) {
  console.log("selectLeadFromTable called", { btn, event });
  event.stopPropagation();

  const row = $(btn).closest(".lead-row");
  console.log("Row data:", {
    leadId: row.data("lead-id"),
    leadName: row.data("lead-name"),
    mobile: row.data("lead-mobile"),
    email: row.data("lead-email"),
  });

  // ... rest of function
}
```

### Step 2: Ensure proper event handling

If the issue is event propagation, ensure the onclick is properly set:

In `search_results_table.html`, the button onclick passes `event`:

```html
onclick="selectLeadFromTable(this, event)"
```

The function signature should match:

```javascript
function selectLeadFromTable(btn, event) {
```

### Step 3: Reinitialize popovers after HTMX swap

Ensure `initLeadTablePopovers()` is called after any HTMX swap that modifies the lead table. The `initForm()` function should handle this, but let's verify:

```javascript
function initForm() {
  // ... other init code ...

  // Initialize lead table popovers
  initLeadTablePopovers();
}
```

This is already called on `htmx:afterSwap` when `membershipSaleForm` exists (line 475-479), so this should work.

### Step 4: Check if #leadSelection exists at call time

The issue might be that `#leadSelection` is being cleared or replaced before the function runs. Add a check:

```javascript
function selectLeadFromTable(btn, event) {
  event.stopPropagation();

  const row = $(btn).closest(".lead-row");
  const leadId = row.data("lead-id");
  const leadName = row.data("lead-name");
  const mobile = row.data("lead-mobile");
  const email = row.data("lead-email");

  const leadInput = document.getElementById("id_lead");
  const leadSelection = document.getElementById("leadSelection");

  if (!leadInput || !leadSelection) {
    console.error("Required elements not found");
    return;
  }

  leadInput.value = leadId;
  leadSelection.innerHTML = selectedLeadCard(
    leadName,
    leadId,
    [mobile],
    [email],
  );

  $(".lead-row").popover("hide");
}
```

### Step 5: Alternative - Use event delegation

Instead of onclick on each button, use event delegation on the table:

```javascript
document.addEventListener("click", function (e) {
  const btn = e.target.closest(".lead-select-btn");
  if (btn) {
    selectLeadFromTable(btn, e);
  }
});
```

This would require adding a class like `lead-select-btn` to the Select buttons.

## Most Likely Fix

Based on the code review, the function appears correct. The issue might be:

1. The onclick event not being passed correctly
2. The popover interfering with the click

The simplest fix is likely adding `event.preventDefault()` in addition to `event.stopPropagation()`:

```javascript
function selectLeadFromTable(btn, event) {
  event.preventDefault(); // Add this line
  event.stopPropagation();
  // ... rest of function
}
```

## Files to Investigate

1. `crown_crm/templates/accounting/partials/membership_sale_form.html` - `selectLeadFromTable` function (lines 410-433)
2. `crown_crm/templates/leads/partials/search_results_table.html` - Select button (lines 36-43)
3. `crown_crm/templates/accounting/partials/membership_sale_form.html` - `initLeadTablePopovers` function (lines 385-406)

## Expected Behavior

When clicking "Select" on any lead in the table:

1. The hidden input `#id_lead` should update to the new lead's ID
2. The `#leadSelection` div should show the new lead's card with name, mobile, and email
3. Any previously selected lead should be replaced
