This plan was only for UI and UX so we weren't going in detail for the backend, and not going to map the backend right now. This is just for UI/UX test.

1: Create the Customer from Lead row. The Lead row that is selected when the form is submitted.
2: This is just to show the end user. A frontend ui only thing. You should figure out how to store in the backend according to the planned module documentation.
3: The `Membership Amount` is Final price. Actually `Final Price` is better label.
4: Offer is FK, we will attach an offer for e.g `Student Offer` with a discount of 20%, so it will then auto fill the `Discount type` (percentage) and `Discount Value` (20) Inputs in the UI. The user can then override or edit these inputs, which will then reflect on the `Discount Amount` input. 
for e.g. `Student Offer (offer), Percentage (discount type), 20 (discount value)`, 5000 (Base Price, we auto filled or entered from the selected Plan), 1000 (discount amount), 4000 (final amount, Base - discount), 4000 (Amount paid), 0 (Balance Amount).
5: It is days. The enums will help us to auto select the Date range (start and end) easily without hassle. The Start date is current date (today), which will dictate the end date.

6: Do according to `backend-implementation-guidelines`. This plan was only for UI and UX so we weren't going in detail for the backend.
7: Yes lead can spawn multiple memberships over time. As the lead will also have an customer object, so we can just reference the customer object lead has referenced, Which will also help us show that this lead / customer is recurring and loyal.
8: If phone already exists, then lead will not be created, instead we will recommend to select the lead / customer which was already existing. For e.g. `1234567890` exists already for John Doe, Have an modal or dialogue popup, and "Do you want to select the following existing lead" and display the details of the lead.
9: One membership.sell permission code.

10: Okay so Plan is required, not Optional as keeping it optional will violate the contract.
11: Plan will just help us set the Initial amount. Then the clerk can override the amount, days, price, discount in the form. We will have flexibility, as the Customer might demand some changes when buying the membership, and will also help us see the comparison from selected Plan and the membership which was sold. This will also enable us to capture history if there's changes in the membership further down the line.
12: Filter offers whose `applicable_plan_ids` contains the chose plan. Yes, show validation error if Offer doesn't apply to current plan.
13: It shouldn't be less than 0, If it exceeds show the error. You can add some fields or give me tips on how to improve the UX according to the domain. You should Research the internet on how other professionals have tackled this problem.

14: Start date = 25-08-2026, Plan Duration = QUARTERLY, End date = 25-11-2026. You should understand this. I think it's start date + 90days, If QUARTERLY (And accordingly figure out for others).
15: End date should not be less than the start date and it shouldn't violate the `days (QUARTERLY, etc)`.
16: Timezone should be UTC, and then accordingly shown in the UI by the Local time. for e.g. (+5.30 Asia/Kolkata). Research about this on internet for better strategies.  
17: It can be back dated, and block `start_date > end_date` live, and also on submit.

18: The one in the Module 05 that says expect partial payments.
19: Do the render work in Rupees, with `,` on thousand. for e.g. plan Annual membership is `10000`, so `10,000`.
20: The pricing doesn't live in react. This is for UX purpose as the user will know what is hapenning.
21: `base_price_minor > 0`, `discount_minor >= 0` and `discount_minor <= base_price_minor` is required. There's no max sale, Yes we allow free trial. If it `free trial membership (0)` then when submitting the sale, have a dialogue popup to ask if this is considered as `trial`, and How many days should the days change to? (For e.g. sometimes clerk might submit unknowingly, this dialog will act as a soft guard rail).
22: Add them, but make them optional.

23: The happy path should be followed, Don't violate the Module 05.
24: The invoice number generation setting should be added in the Organization, The organization should be able to modify their invoice generation. default should be `ORG_INITIALS-DDMMYY-INV_ID` for e.g. `CRO-250826-01` (CRO = Crown Vitality, 250826 = 25/08/2026 (The date when invoice what generated), 01 (The num of invoice in the database, This is the first invoice generated so 01, This is not a primary key. an auto increment helper field))
25: If client over pays, there should be a dialogue which let's us select if we want to keep as credits or return as change. This will be done in same form, and also in the form where the payment is collected. The `payment_method` field is also mandatory, so add it in the UI as dropdown select input.
26: I don't know much about how this works, we will look into this in detail when we will tackle the backend.

27: PDF after finalized invoice + lines + billing snapshot, generate from the APP.
28: It's electron so download the pdf, and have a windows notification and also the shadcn notification that pdf has been downloaded. The pdf filename should be `<generated_invoice_number>_<customer_fullname>_<download_datetime>.pdf`
29: Just download it in the Downloads folder.

30: It's conjunction of multiple permissions. We will tackle this later.
31: We always guard Idempotency. This is a sensitive module, as it tracks finances and membership. No room for error here.
32: Without organization nothing will be created. Org scoping is mandatory.

33: You decide according to what's best practice on the field. The user should be able to change the previous step and change steps easily, Less clicks, more accessible, easy to navigate, and also easy to see most important fields together.
You can also design it like they do It in Tally erp system (Research this on the internet).
34: Auto correct combobox is better UI.
35: The user will always enter the money in rupees. for e.g 10000, or 5240.22, or 65029.41. No paise hint, as the user enters in rupees. Paise is for backend as the 5240.22 (rupees) -> 524022 (paise). We accept only 2 decimals.
36: Start and end date will have independent inputs. Start date (datepicker, no time picker), End Date (datepicker, no time picker). The money will automatically have mask, it should allow only 2 decimals. 5240.00 (if user doesn't type the `.` and number next), if user types `.` then (5240.22) that's it. Nothing fancy. Don't allow more than two decimal places.
37: Research the internet for this, check what the UI/UX expert say and implement the ui.
38: Go to membership detail page or maybe a special page which is structed like an tally invoice.
39: Inline banner so the user can then solve the mistakes.