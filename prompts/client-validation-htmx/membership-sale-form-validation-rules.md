# Membership sale form rules for Validation.

This is a very crucial and backbone form of our application.

1. If lead is not selected:
   - At search lead, make it red.
   - The input and the label.

2. Duration should be selected
   - The end date cannot be blank.
   - End date cannot be less than the start date.

3. Base price must be added, it should not be empty
   - Not less than selling price.

4. Selling price cannot be empty
   - Not more than Base price.
   - It should be less than or equal to base price.

5. The Amount Paid:
   - Should always be less than or equal to selling price.

6. Payment method should always be selected, cannot be blank.

The error classes and field error messages should stricly follow how we tackled them in lead create form.
Check the cotton components we made and how we used them in lead create form.
