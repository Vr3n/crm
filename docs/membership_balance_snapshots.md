# Membership Balance Snapshots

## Purpose
The `update_balance_snapshots` method in the `MembershipSale` model recalculates the opening and closing balances for all related payment receipts. This ensures accurate tracking of how much is owed or paid after each transaction, which is essential for correcting historical data or maintaining financial integrity.

## How It Works
- **Starts** with the total decided amount for the membership (`decided_amount`).
- **Iterates** through all payment receipts in chronological order.
- **For each receipt**:
  - Sets `opening_balance` to the current running balance.
  - Calculates `closing_balance` as `opening_balance - receipt.amount`.
  - Saves these balances to the receipt.
  - Updates the running balance for the next receipt.
- All operations are wrapped in a database transaction for consistency.

## Example
Suppose a membership has a decided amount of ₹10,000 and three receipts:

| Receipt | Amount | Opening Balance | Closing Balance |
|---------|--------|----------------|----------------|
| 1       | 3,000  | 10,000         | 7,000          |
| 2       | 4,000  | 7,000          | 3,000          |
| 3       | 3,000  | 3,000          | 0              |

## Why Use This?
- Ensures historical payment data is accurate and up-to-date
- Useful for fixing data issues, applying corrections, or after data imports
- Supports clear financial reporting and audit trails

## When to Run It
- After making manual changes to receipts
- When correcting or importing historical data
- To fix inconsistencies in payment balances

---
For further details, refer to the `MembershipSale.update_balance_snapshots` method in `accounting/models.py`.
