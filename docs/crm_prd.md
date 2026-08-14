# Project Overview

The goal of this project is to develop a lightweight, CRM system for gym owners to manage their leads, memberships, personal training sessions, diet plans, and payment tracking. 
The system should be simple yet powerful enough to handle day-to-day gym operations, with clean UI interactions.

# Project Level

Medium : CRUD-heavy app with structured forms, partial updates, and backend reporting.
# Type of Project

CRM + Fitness Domain + Payments Tracking.
# Tech Stack

- **Backend:** Django 5.2
- **Frontend:** HTMX 2.0, Alpine.js
- **UI Framework:** Bootstrap 4.6
- **Dropdowns/Selects:** Select.js
# Modules & Key Features
## Leads Management 🧍

- Add/Edit/Delete Leads
	- Fields: Name, Phone, Email, Gender, Age, Address, Source (Referral, Walk-in, Online, etc.)
- Track which leads converted to memberships.
- Show lead status: `New`, `Interested`, `Converted`, `Dropped`.
## Gym Membership Management 💪🏻

- Create Memberships linked to a Lead
	- Fields:
	    - Type: `Premium`, `Normal`, `Student`
	    - Duration (days or end date)
	    - Start Date (default = Receipt Date)
	    - Decided Amount, Paid Amount, Balance
	    - Payment Status: `Pending`, `Partial`, `Paid`
	    - Notes
- Membership Receipt:
	- Auto-generated with:
	- Receipt Date
	- Linked Lead
	- Membership Details
	- Payment Info (Decided, Paid, Balance)
- Membership Status Tracking
	- Active / Expired / Cancelled
## Reports & Dashboard
- Metrics:
	- Total Leads / Converted / Active Members
	- Total Revenue Collected vs. Balance Pending.
- Member-wise payment and attendance reports.
- Expiring memberships in next 7 days.
# Milestones
## Milestone 1: Core CRM + Memberships Receipts

Goal: Track Leads, sell Memberships using Structured service plans, and auto-assign Included Benefits.

**key features:**
- Lead Management.
- Define service plans (Premium, Normal, etc.) with built-in benefits.
- Receipt creation (select plan, assign to lead).
- Auto-assignment of:
	- Personal Training sessions
	- Diet Plans
	- Any Perks (e.g. Duffle Bag)

**Example:**
> Premium Plan → ₹12,000  
   Includes: 12 PT Sessions, 1 Diet Plan, 1 Duffle Bag  
   Upon receipt, lead is assigned these benefits directly.
## Milestone 2: Reports & Member Summary Dashboard

**Goal:** Provide a clear overview of member stats, session usage, plan allocation, and payment summaries.

**Key features:**
- Dashboard Overview:
	- Total Leads, Active Members, Recent Receipts
	- Upcoming Plan Expiries or renewals.****
- Member-wise usage summary:
	- Pt Sessions assigned vs used
	- Diet plans assigned.
	- Outstanding Payments.
- Filterable Reports.
	- Membership type
	- Payment Status (Paid, Balance)
	- Time Period Filters (e.g. Last 30 days)
- Export Options:
	- Print-friendly views.
	- Basic export (CSV or PDF) for accounting.
## Milestone 3: Scheduling & Attendance Tracking.

**Goal:** Allow the owner to schedule and track the actual usage of PT sessions and diet plans.

**Key Features:**
- Schedule personal training sessions (calendar view)
- Assign trainer, date, and time
- Mark session attendance
- Track diet plan start/completion
- Show session status in reports (Attended / Missed / Upcoming)
---