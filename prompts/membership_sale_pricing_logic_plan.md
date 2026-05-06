# Membership Sale Pricing Logic Plan

## Purpose

Enhance the pricing section in membership sale form to auto-fill and cap the selling price based on base price:

- Auto-fill selling price when base price is entered but selling price is empty
- Ensure selling price never exceeds base price

## Current Behavior

Currently, `updateDiscountDisplay()` just calculates discount percentage without any auto-fill or capping logic.

## Expected Behavior

1. When user types **Base Price** and **Selling Price is empty** → auto-fill selling price with base price value
2. When user types **Base Price** and **Selling Price > Base Price** → cap selling price to equal base price
3. Selling price can never be higher than base price

## Implementation

### File

`crown_crm/templates/accounting/partials/membership_sale_form.html`

### Function to Modify

`updateDiscountDisplay()` — currently at lines 287-313

### Current Code

```javascript
/* Discount display — computed from base_price and price */
function updateDiscountDisplay() {
  const baseInput = document.getElementById("id_base_price");
  const priceInput = document.getElementById("id_price");
  const display = document.getElementById("discountDisplay");
  if (!baseInput || !priceInput || !display) return;

  const base = parseFloat(baseInput.value) || 0;
  const price = parseFloat(priceInput.value) || 0;

  if (base > 0 && price >= 0 && price < base) {
    const pct = (((base - price) / base) * 100).toFixed(1);
    display.textContent = `${pct}% off`;
    display.classList.remove("text-muted");
    display.classList.add("text-success");
  } else if (base > 0 && price === base) {
    display.textContent = "No discount";
    display.classList.remove("text-success");
    display.classList.add("text-muted");
  } else {
    display.textContent = "— %";
    display.classList.remove("text-success");
    display.classList.add("text-muted");
  }

  updateBalanceDisplay();
}
```

### New Code

```javascript
/* Discount display — computed from base_price and price */
function updateDiscountDisplay() {
  const baseInput = document.getElementById("id_base_price");
  const priceInput = document.getElementById("id_price");
  const display = document.getElementById("discountDisplay");
  if (!baseInput || !priceInput || !display) return;

  const base = parseFloat(baseInput.value) || 0;
  let price = parseFloat(priceInput.value) || 0;

  // 1. Auto-fill selling price if empty when base price has value
  if (base > 0 && priceInput.value.trim() === "") {
    priceInput.value = base.toFixed(2);
    price = base;
  }

  // 2. Cap selling price to base price (never higher than base)
  if (base > 0 && price > base) {
    priceInput.value = base.toFixed(2);
    price = base;
  }

  // 3. Update discount display
  if (base > 0 && price >= 0 && price < base) {
    const pct = (((base - price) / base) * 100).toFixed(1);
    display.textContent = `${pct}% off`;
    display.classList.remove("text-muted");
    display.classList.add("text-success");
  } else if (base > 0 && price === base) {
    display.textContent = "No discount";
    display.classList.remove("text-success");
    display.classList.add("text-muted");
  } else {
    display.textContent = "— %";
    display.classList.remove("text-success");
    display.classList.add("text-muted");
  }

  updateBalanceDisplay();
}
```

## Changes Summary

1. Changed `const price` to `let price` to allow modification
2. Added block to auto-fill selling price when empty and base price has value
3. Added block to cap selling price to base price if higher
4. Call `updateBalanceDisplay()` at end (unchanged)

## Testing Scenarios

| Scenario                      | Base Price      | Selling Price (before) | Expected Selling Price (after) |
| ----------------------------- | --------------- | ---------------------- | ------------------------------ |
| 1. Empty base, empty selling  | empty           | empty                  | empty, empty                   |
| 2. Enter base, empty selling  | 1000            | empty                  | 1000 (auto-filled)             |
| 3. Enter base, lower selling  | 1000            | 800                    | 800 (unchanged)                |
| 4. Enter base, equal selling  | 1000            | 1000                   | 1000 (unchanged)               |
| 5. Enter base, higher selling | 1000            | 1200                   | 1000 (capped)                  |
| 6. Change base to lower value | 800 (from 1000) | 1000 → capped          | 800 (capped)                   |

## Edge Cases

- Base price = 0 → no changes to selling price
- Selling price empty string → auto-fill with base price
- Both empty → no changes
