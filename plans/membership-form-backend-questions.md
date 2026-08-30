1.1: NONE is a UI placeholder. Backend must map NONE -> { offerId: null, discountMinor: 0 } and reject discountValue when NONE. As discount is not always offered during the sale.
1.2: leadId which was passed, wins. The clearing is just a UI feature, nothing to do with backend. I don't know about a person_id, there should be no person id. Just Lead and Customer tables that's it. Nothing more complicated.
Membership sold to lead -> create customer if not exists from the leadId. Person is just a domain language, not an entity in database, The entities are Lead (unique(mobile)), when Lead is sold a membership then Customer is created if not exists. Lead -> Customer. That's it.
1.3: 365 days. `memberships.end_date` is the truth, `duration_days_snapshot` reflects what `Start date` and `End date` is. There might be changes from 1 month (30 days) to 3 months (90 days). Mostly we will only use the `memberships.end_date`.

2.1: Create a unique Idempotency key or better a unique `Transaction Id`. Research the internet for better implementation of `Transaction Id` in prodution.
2.2: Round to nearest.
2.3: Research the internet of how the credits is implemented in this domain, If it is not feasable and too complicated, then we don't allow overpayment, just tell the user is `amount_paid > membership amount (I fucking forgot the name, so use common sense here please.)`. Suggest me the best approach.

3.1: For now we won't implement trials, for trials we will have other form, as trial is not considered a membership. But still check the internet for this problem. Research the internet for how this is tackled by other professionals in this domain.
3.2: Remove the `FREE_PERIOD` for now. We don't want to overcomplicate things
3.3: Yess.

4.2: Yess store `organization.timezone` pick automatically from the computer that application is installed in. Check the Internet for better approach if needed.
4.3: We only move further with Date, The days will get fucking confusing and complicate the system. We should only work with Dates.

5.1: UNIQUE violation -> CONFLICT -> Retry.
5.2: Generic `VALIDATION_ERROR` with message `LEAD with this phone number already exists!` and then modal/dialogue with `Do you want to select the Lead: <Lead Name>, <Lead Phone Number>?`
5.3: Yes.

6.1: Computed in backend, The frontend is only for user to look what will be computed.
6.2: Add an `org_invoice_prefix` field to organization field, This should be entered when Organization is created. Field can also be edited in the organization settings page. If not provided then use the first 3 letters of the organization name as default. The increment is done by SQLITE database itself.
6.3: Payment method should also be stored, so can know what type of payment method is mostly used.

7.1: Which one is easier to modify, Implement that approach. We don't want many complications.
7.2: Idempotency is a must.