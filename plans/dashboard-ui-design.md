# Dashboard Page Redesign.

use the skills `design-taste-frontend`, `high-end-visual-design` and other ui related skills.

You should use Visual Hierarchy and Colors of shadcn, Right now the application lacks colors at appropriate places.

Swap the Greeting and the Organization - Staff. Make the organization and staff bigger text size and make the greeting smaller subtitle.

In the next row add buttons with outline variant, and appropriate colors (with icons if you are fancy) as your liking.

- Add new Lead
- Schedule new Follow-Up
- Schedule new Activity
- New Membership Sale

We don't need those KPI cards right now so remove them for now.
And the tables to show are:

These two tables will be in single row, taking two columns.

1. Membership Expirations.

A table that shows upcoming membership expirations, this will help the staff to easily schedule followup and remind them to renew their membership.
The rows are:

- Client
- Contact
- Expiration Date (with `n days remaining` as subtitle)
- Membership Plan (which also shows the date membership was purcahsed)
- A button which schedule followup (or just `+ Followup`)

Ordering should be ascending, from least to more.

2. Payments Due.

Members that haven't paid money and are due. this will help the staff to easily schedule followup and remind them to pay their dues.
The rows are:

- Client
- Contact
- Amount Due (with total amount as subtitle)
- Membership Plan (which also shows the date membership was purcahsed)
- A button which schedule followup (or just `+ Followup`)

This table will take up whole row.

3. Leads Turning Cold.

The leads that haven't been followed up or haven't been assigned any activity for a long time.
Ordering of this table should be highest to least n days the lead has been last contacted.
You can ignore the lost leads.

The rows are:

- Lead
- Contact
- Last followup / Activity

In the next row we have a single row calender which shows date and day clickable.
The tables will react to the calendar date click (or a range of date).

The tables are:

4. Latest followups
5. Latest Activities.
