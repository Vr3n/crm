# Membership Sale Form.

First explore the codebase for current implementation. Start with @docs.

Full page form for recording a New Membership sale
Here's the flow / sections in the form.

1. Select Lead or Create new lead if not present (Use the lead dialog form here.)
2. Select the plan or Create if not present (Use the plan dialog form)
3. Select the offer or Create if not present (Use the offer dialog form)
4. Start and End date of membership.
5. Base Amount (Auto fill from the selected plan, Can be overriden by the user.), Discount Amount (Auto fill from the selected Offer, Can be overriden by user), Membership Amount (final amount after considering Base and Discount), Paid Amount (The amount paid by lead / customer), Balance Amount (Paid - Membership Amount).

- After submission, convert the lead to customer. Create Customer object of the Lead if not present, This is really important.
- Invoice PDF download, and also preview the invoice in new tab.

Plan the UI, UX and also the micro-interactions thoroughly.

The validation criteria for the Form:

1. Lead is required.
2. Plan is optional, but recommended to select.
3. Offer is optional.
4. Start date default value should be current date (User can edit it), End date should be selected automatically if the plan is selected and has the duration (MONTHLY, QUATERLY, etc..). The End date cannot be less than the duration, and it also cannot be less than start date.
5. Base Amount is required, Discount amount is optional, Membership Amount should be calculated realtime / reactively when Base or Discount amount is changed. Paid amount cannot be less than Membership Amount, Paid Amount is required. Balance Amount should be reactive and calculated when Paid amount or Membership Amount is changed.
