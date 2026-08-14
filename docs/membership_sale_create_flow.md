# Membership Sale Create Flow

This document describes the complete flow for creating a membership sale at `<organization_slug>/accounting/sales/create/`. The flow involves multiple views (full page and HTMX), forms, models, and templates working together to create a sale and optionally a first payment receipt.

## Table of Contents

1. [URL Pattern](#url-pattern)
2. [Views Involved](#views-involved)
3. [Forms Involved](#forms-involved)
4. [Models Involved](#models-involved)
5. [Templates Involved](#templates-involved)
6. [Complete Flow Diagram](#complete-flow-diagram)
7. [Detailed Step-by-Step Flow](#detailed-step-by-step-flow)

---

## URL Pattern

### File: `crown_crm/accounting/urls.py` (Line 91)

```python
path("sales/create/", views.sale_create_view, name="sale-create"),
```

This URL is nested under the organization slug in `config/urls.py` (line 41):

```python
path("<slug:slug>/", include("crown_crm.organizations.urls"))
```

The complete URL pattern becomes:
```
<organization_slug>/accounting/sales/create/
```

---

## Views Involved

### 1. `sale_create_view` - Full Page View

**File:** `crown_crm/accounting/views.py` (Lines 1029-1044)

```python
@login_required
@organization_slug_required
def sale_create_view(request: OrgHttpRequest) -> HttpResponse:
    """Create a new sale (full page)."""
    if request.method == "POST":
        form = MembershipSaleForm(request.POST, organization=request.organization)
        if form.is_valid():
            sale = form.save(commit=False)
            sale.organization = request.organization
            sale.save()
            messages.success(request, "Membership sale created successfully!")
            return redirect("sales", slug=request.organization.slug)
    else:
        form = MembershipSaleForm(organization=request.organization)

    return render(request, "accounting/forms/membership_sale_form.html", {"form": form})
```

**Purpose:** Renders the full page form for creating a membership sale. Note that this view is NOT used for the actual form submission in the UI - the HTMX view handles the submission.

**Parameters:**
- `request`: The HTTP request with organization context
- `organization`: Available via `request.organization` (set by `@organization_slug_required` decorator)

**Returns:**
- GET: Renders `membership_sale_form.html` with empty form
- POST: Creates `MembershipSale`, redirects to sales list

---

### 2. `hx_create_membership_sale` - HTMX Submission Handler

**File:** `crown_crm/accounting/views.py` (Lines 805-853)

```python
@require_POST
@login_required
@organization_slug_required
def hx_create_membership_sale(request: OrgHttpRequest) -> HttpResponse:
    """Create a membership sale (with first payment) via HTMX.

    Expects a POST request carrying all sale & payment fields. On success the
    view emits a ``membership_sale_create_success`` client-side event which can
    be caught in JS to redirect or update the UI.
    """
    form = MembershipSaleCreateForm(request.POST, organization=request.organization)
    if form.is_valid():
        # Persist sale + first receipt
        sale: MembershipSale = form.save_and_create_receipt(request.organization)
        first_receipt = sale.receipts.order_by("date").first()

        response = render(
            request,
            "accounting/partials/payment_receipt.html",
            {"sale": sale, "receipt": first_receipt},
        )
        # Let client decide where to place; also trigger event
        return trigger_client_event(
            response,
            "membership_sale_create_success",
            {
                "message": "Membership sale recorded successfully!",
            },
        )

    # Invalid – render the form partial with errors and preserve selections
    lead_obj = None
    plan_obj = None
    try:
        lead_pk = request.POST.get("lead")
        if lead_pk:
            lead_obj = LeadMaster.objects.filter(pk=lead_pk).first()
        plan_pk = request.POST.get("plan")
        if plan_pk:
            plan_obj = MembershipPlan.objects.filter(pk=plan_pk).first()
    except Exception:
        pass

    context = {
        "form": form,
        "selected_lead": lead_obj,
        "selected_plan": plan_obj,
    }
    return render(request, "accounting/partials/membership_sale_form.html", context)
```

**Purpose:** Handles the actual HTMX form submission. Creates both the `MembershipSale` and optionally the first `PaymentReceipt` in a single transaction.

**Key Features:**
- Uses `MembershipSaleCreateForm` (extended form with payment fields)
- Calls `form.save_and_create_receipt()` to create sale + receipt atomically
- Returns HTMX response with `membership_sale_create_success` event
- On validation failure, re-renders form with errors and preserves selections

**URL Endpoint:** Named `hx-create-membership-sale` (defined in `urls.py` line 85-88)

---

## Forms Involved

### 1. `MembershipSaleForm` - Base Form

**File:** `crown_crm/accounting/forms.py` (Lines 225-284)

```python
class MembershipSaleForm(forms.ModelForm):
    """
    Form for creating and updating MembershipSale instances.

    This form handles the sale of memberships to leads, including validation
    for the selected plan, membership type, and payment details.
    """

    class Meta:
        model = MembershipSale
        fields = [
            "lead",
            "plan",
            "duration",
            "membership_start_date",
            "notes",
        ]
        widgets = {
            "lead": forms.Select(
                attrs={"class": "form-control select2", "required": True}
            ),
            "membership_type": forms.Select(
                attrs={"class": "form-control select2", "required": True}
            ),
            "plan": forms.Select(
                attrs={"class": "form-control select2", "required": True}
            ),
            "duration": forms.Select(
                attrs={"class": "form-control select2", "required": True}
            ),
            "notes": forms.Textarea(
                attrs={
                    "class": "form-control",
                    "rows": 3,
                    "placeholder": "Enter any additional notes (optional)",
                    "required": False,
                }
            ),
        }

    def __init__(self, *args, **kwargs):
        """Initialize the form with custom settings."""
        kwargs.pop("organization", None)
        super().__init__(*args, **kwargs)

        # # Filter plans and member types by organization
        # if organization:
        #     self.fields["plan"].queryset = MembershipPlan.objects.filter(  # type: ignore
        #         organization=organization, is_active=True
        #     )
        if not self.instance.pk:
            self.fields["custom_price"].initial = 0

    def clean_custom_price(self):
        """Validate that the decided amount is a positive number."""
        amount = self.cleaned_data.get("custom_price")
        if amount is not None and amount < 0:
            raise forms.ValidationError("Amount cannot be negative.")
        return amount
```

**Purpose:** Base form for creating/updating `MembershipSale`. Defines core fields only (lead, plan, duration, start date, notes).

---

### 2. `MembershipSaleCreateForm` - Extended Form with Payment

**File:** `crown_crm/accounting/forms.py` (Lines 286-397)

```python
class MembershipSaleCreateForm(MembershipSaleForm):
    """Form used **only** for initial membership sale creation with payment.

    Extends :class:`MembershipSaleForm` by adding front-end only fields
    required for the first payment so that the model save and the first
    :class:`~accounting.models.PaymentReceipt` are performed in the same
    transaction.
    """

    membership_start_date = forms.DateField(
        label="Membership Start Date",
        required=True,
        widget=forms.DateInput(
            attrs={
                "class": "form-control",
                "type": "date",
            },
            format="%d-%m-%Y",
        ),
        initial=timezone.now().date(),
    )

    payment_amount = forms.DecimalField(
        min_value=Decimal("0"),
        max_digits=10,
        decimal_places=2,
        required=False,
        widget=forms.NumberInput(
            attrs={
                "class": "form-control",
                "step": "0.01",
                "min": "0",
            }
        ),
    )

    # ... additional payment fields ...

    class Meta(MembershipSaleForm.Meta):
        fields = MembershipSaleForm.Meta.fields + [
            "custom_pt_sessions",
            "custom_diet_plans",
            "custom_duration",
            "custom_price",
            "discount_percentage",
            "membership_start_date",
            "payment_amount",
            "payment_method",
        ]

    # ----- validation -----------------------------------------------------
    def clean(self):
        """Run additional inter-field validation."""
        cleaned_data = super().clean()
        if cleaned_data is None:
            self.add_error("__all__", "Invalid data provided.")
            return cleaned_data
        payment_amount: Decimal = cleaned_data.get("payment_amount") or Decimal("0")
        custom_price: Decimal = cleaned_data.get("custom_price") or Decimal("0")
        payment_method = cleaned_data.get("payment_method")

        if payment_amount and payment_amount > custom_price:
            self.add_error(
                "payment_amount", "Paid amount cannot exceed decided amount."
            )

        if payment_amount > 0 and not payment_method:
            self.add_error(
                "payment_method", "Select payment method when amount is provided."
            )

        return cleaned_data

    # ---------------------------------------------------------------------
    def save_and_create_receipt(self, organization):
        """Persist sale and optional first receipt inside a single transaction.

        Args:
            organization (OrganizationMaster): Current organization object.

        Returns:
            MembershipSale: The newly created sale instance.
        """
        from django.db import transaction  # local import to avoid circular

        payment_amount = self.cleaned_data.get("payment_amount") or Decimal("0")
        payment_method = (
            self.cleaned_data.get("payment_method") or PaymentReceipt.Method.CASH
        )

        with transaction.atomic():
            sale: MembershipSale = super().save(commit=False)
            sale.organization = organization
            sale.save()

            if payment_amount and payment_amount > 0:
                PaymentReceipt.objects.create(
                    sale=sale,
                    organization=organization,
                    amount=payment_amount,
                    method=payment_method,
                    opening_balance=sale.custom_price,
                    closing_balance=sale.custom_price - payment_amount,
                )
        return sale
```

**Purpose:** Extended form used specifically for initial sale creation with an optional first payment. Adds payment-related fields and implements the atomic save method that creates both `MembershipSale` and `PaymentReceipt`.

**Key Methods:**
- `clean()`: Validates payment amount doesn't exceed custom price, ensures payment method is selected when amount > 0
- `save_and_create_receipt()`: Atomically saves sale and creates first receipt in a transaction

---

## Models Involved

### 1. `LeadMaster` - The Customer/Lead

**File:** `crown_crm/leads/models.py` (Lines 17-90)

```python
class LeadMaster(BaseModel):
    """Represents a lead in the system with basic personal information.

     This model stores core information about leads including their name, gender, and
     organizational affiliation. It serves as the central model for lead management.

     Attributes:
         organization (ForeignKey): Reference to the organization this lead belongs to.
         first_name (str): Lead's first name.
         middle_name (str, optional): Lead's middle name.
         last_name (str): Lead's last name.
         gender (str, optional): Lead's gender, chosen from GENDER_CHOICES.

    Methods:
         full_name -> str: Lead's Full name.

    """

    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"
        TRANSGENDER = "T", "Transgender"

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        INTERESTED = "INTERESTED", "Interested"
        CONVERTED = "CONVERTED", "Converted"
        DROPPED = "DROPPED", "Dropped"

    organization = models.ForeignKey(
        OrganizationMaster, on_delete=models.CASCADE, related_name="leads"
    )
    first_name = models.CharField(max_length=50)
    middle_name = models.CharField(max_length=50, blank=True, null=True)
    last_name = models.CharField(max_length=50)
    gender = models.CharField(
        max_length=10, choices=Gender.choices, blank=True, null=True
    )
    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.NEW,
        help_text="Current status of the lead",
    )

    @property
    def full_name(self) -> str:
        """Constructs the full name of the lead."""
        return f"{self.first_name} {self.middle_name if self.middle_name else ''} {self.last_name}"

    # Related querysets
    mobile_numbers: models.QuerySet["LeadMobileNumberMaster"]
    emails: models.QuerySet["LeadEmailAddressMaster"]
    addresses: models.QuerySet["LeadAddressMaster"]
    discussions: models.QuerySet["LeadDiscussionHistory"]
    sources: models.QuerySet["LeadSourceMaster"]
    memberships: models.QuerySet["MembershipSale"]

    class Meta:
        verbose_name = "Lead"
        verbose_name_plural = "Leads"
```

**Purpose:** Represents the lead/customer purchasing the membership. Linked to `MembershipSale` via a ForeignKey relationship (`related_name="memberships"`).

---

### 2. `MembershipPlan` - The Membership Plan

**File:** `crown_crm/accounting/models.py` (Lines 36-69)

```python
class MembershipPlan(BaseModel):
    """
    Defines available membership plans and their benefits.

    Attributes:
        name: Name of the membership plan
        duration: Duration of the plan (monthly, quarterly, etc.)
        price: Price of the membership plan
        pt_sessions: Number of personal training sessions included
        diet_plans: Number of diet plans included
        perks: Additional perks included with the plan
        is_active: Whether the plan is currently active
        description: Detailed description of the plan
    """

    organization = models.ForeignKey(
        "organizations.OrganizationMaster", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    pt_sessions = models.PositiveIntegerField(default=0)
    diet_plans = models.PositiveIntegerField(default=0)
    perks = models.CharField(
        max_length=255,
        blank=True,
        help_text="Comma-separated perks, e.g. Duffle Bag, T-Shirt",
    )
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True)

    def __str__(self) -> str:
        """Return a string representation of the membership plan."""
        return f"{self.name}"
```

**Purpose:** Defines the membership plan being sold. Contains base price and included benefits (PT sessions, diet plans). Can be customized at sale time.

---

### 3. `MembershipSale` - The Core Sale Model

**File:** `crown_crm/accounting/models.py` (Lines 79-180)

```python
class MembershipSale(BaseModel):
    """
    Represents a single sale of a membership plan to a lead with optional customizations.

    This model allows for customization of plan details at the time of sale while maintaining
    a reference to the original plan. This enables tracking of deviations from standard plans.

    Attributes:
        lead (LeadMaster): The lead who purchased the membership.
        plan (MembershipPlan): The standard membership plan being sold.
        membership_type (MemberType): Type of membership (e.g., Gold, Platinum).
        duration (str): Selected duration from Duration.choices.
        custom_pt_sessions (int, optional): Override for PT sessions if customized.
        custom_diet_plans (int, optional): Override for diet plans if customized.
        custom_duration (str, optional): Override for duration if customized.
        custom_price (Decimal, optional): Override for price if customized.
        discount_percentage (Decimal, optional): Calculated discount percentage.
        date_created (date): Date when the sale was created.
        notes (str, optional): Additional notes about the sale.

    Properties:
        total_paid (Decimal): Total amount paid across all receipts.
        balance (Decimal): Remaining balance to be paid.
        membership_end_date (date): End date of the membership.
    """

    class Duration(models.TextChoices):
        """Available duration options for membership plans."""

        MONTHLY = "monthly", "Monthly"
        QUARTERLY = "quarterly", "Quarterly"
        SIX_MONTHS = "6months", "6 Months"
        YEARLY = "yearly", "Yearly"

    # Core Fields
    lead = models.ForeignKey(
        LeadMaster,
        on_delete=models.CASCADE,
        related_name="memberships",
        help_text="The lead who purchased the membership",
    )
    organization = models.ForeignKey(
        "organizations.OrganizationMaster",
        on_delete=models.CASCADE,
    )
    plan = models.ForeignKey(
        MembershipPlan,
        on_delete=models.PROTECT,
        related_name="sales",
    )
    # Standard Plan Fields (can be overridden)
    duration = models.CharField(
        max_length=20,
        choices=Duration.choices,
        help_text="Selected duration for this membership",
    )

    custom_pt_sessions = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Custom PT sessions (overrides plan default)",
    )
    custom_diet_plans = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Custom diet plans (overrides plan default)",
    )
    custom_duration = models.CharField(
        max_length=20,
        choices=Duration.choices,
        null=True,
        blank=True,
        help_text="Custom duration (overrides plan default)",
    )
    custom_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Custom price (overrides plan default)",
    )
    discount_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Discount percentage applied",
    )
    membership_start_date = models.DateField(
        null=True,
        blank=True,
        help_text="Start date of the membership",
    )
    notes = models.TextField(blank=True, help_text="Additional notes about the sale")

    # ... additional fields ...
```

**Purpose:** The core model representing a membership sale. Links the lead, plan, and allows customization of plan attributes at sale time. Also tracks pricing and membership dates.

**Key Relationships:**
- `lead`: ForeignKey to `LeadMaster` (related_name="memberships")
- `plan`: ForeignKey to `MembershipPlan` (related_name="sales")
- `organization`: ForeignKey to `OrganizationMaster`
- `receipts`: Reverse relation to `PaymentReceipt` (related_name="receipts")

---

### 4. `PaymentReceipt` - The Payment Receipt

**File:** `crown_crm/accounting/models.py` (Lines 272-340)

```python
class PaymentReceipt(BaseModel):
    """
    Represents a single payment receipt (one per cash-in event).

    Attributes:
        sale: The membership sale this payment belongs to
        amount: Amount of this payment
        date: Date and time of the payment
        method: Payment method used
        reference: Reference number for the payment
        notes: Additional notes about the payment
        opening_balance: Balance before this payment
        closing_balance: Balance after this payment
        receipt_number: Auto-generated unique receipt number in format YY/MM/DD/duration_code/count
    """

    # Mapping of duration to code for receipt number generation
    DURATION_CODES = {
        "monthly": "01",
        "quarterly": "03",
        "6months": "06",
        "yearly": "12",
    }

    class Method(models.TextChoices):
        """Available payment methods."""

        CASH = "cash", "Cash"
        CARD = "card", "Card"
        UPI = "upi", "UPI"
        BANK = "bank", "Bank Transfer"
        OTHER = "other", "Other"

    sale = models.ForeignKey(
        "accounting.MembershipSale",
        on_delete=models.CASCADE,
        related_name="receipts",
        related_query_name="receipt",
    )
    organization = models.ForeignKey(
        "organizations.OrganizationMaster", on_delete=models.CASCADE
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    date = models.DateTimeField(default=timezone.now)
    method = models.CharField(
        max_length=20, choices=Method.choices, default=Method.CASH
    )
    receipt_number = models.CharField(max_length=20, null=True, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True, null=True)

    # Snapshot fields - capture state at time of receipt
    opening_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Balance before this payment was applied",
    )
    closing_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Balance after this payment was applied",
    )

    class Meta:
        ordering = ["-date"]
        indexes = [
            models.Index(fields=["sale", "date"], name="receipt_sale_date_idx"),
        ]
```

**Purpose:** Represents a single payment against a membership sale. Created atomically with the sale for the initial payment, or later for additional payments.

**Key Relationships:**
- `sale`: ForeignKey to `MembershipSale` (related_name="receipts")
- `organization`: ForeignKey to `OrganizationMaster`

---

## Templates Involved

### 1. `accounting/forms/membership_sale_form.html` - Full Page Template

**File:** `crown_crm/templates/accounting/forms/membership_sale_form.html`

```html
{% extends "base.html" %}
{% load static %}
{% block title %}
  New Membership Sale - {{ block.super }}
{% endblock title %}
{% block content %}
  <h4 class="mb-3">Membership Sale</h4>
  {% include "accounting/partials/membership_sale_form.html" %}
{% endblock content %}
{% block custom_js %}
  <script>
    // JavaScript for lead selection, plan selection, payment calculations
    // ... (see full file for complete implementation)
  </script>
{% endblock custom_js %}
```

**Purpose:** Full page wrapper that extends the base template. Includes the partial form and contains JavaScript for:
- Lead search and selection
- Membership plan search and selection
- Payment amount calculations
- Discount calculations
- Balance updates

---

### 2. `accounting/partials/membership_sale_form.html` - Partial Form

**File:** `crown_crm/templates/accounting/partials/membership_sale_form.html`

```html
<form hx-post="{% url 'hx-create-membership-sale' slug=request.organization.slug %}"
      hx-target="this"
      hx-swap="innerHTML"
      hx-disabled-elt="button#submitBtn"
      class="needs-validation">
  {% csrf_token %}
  {% if form.non_field_errors %}
    <div class="alert alert-danger">
      {% for error in form.non_field_errors %}{{ error }}{% endfor %}
    </div>
  {% endif %}
  <input type="hidden"
         name="organization"
         value="{{ request.organization.slug }}">

  <!-- Lead Card -->
  <div class="card mb-2">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h3 class="card-title mb-0">Lead</h3>
      <button hx-get="{% url 'hx-quick-create-lead' slug=request.organization.slug %}"
              hx-target="#modal-form"
              class="btn btn-outline-danger">+ Create New Lead</button>
    </div>
    <div class="card-body">
      <!-- Lead search input -->
      <input type="hidden" name="lead" required value="{{ form.lead.uuid }}" id="lead">
      <div id="leadSelection"></div>
    </div>
  </div>

  <!-- Membership Plan Card -->
  <div class="card mb-2">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h3 class="card-title mb-0">Membership Plan</h3>
      <button hx-get="{% url 'hx-create-membership-plan' slug=request.organization.slug %}"
              hx-target="#modal-form"
              class="btn btn-outline-danger">+ Create New Membership Plan</button>
    </div>
    <div class="card-body">
      <!-- Plan search input -->
      <input type="hidden" name="plan" required value="{{ form.plan.uuid }}" id="plan">
      <div id="membershipPlanSelection"></div>

      <!-- Customization Section -->
      <div id="customizationSection" class="mt-4" style="display: none;">
        <!-- PT Sessions, Diet Plans, Duration, Start Date -->
      </div>
    </div>
  </div>

  <!-- Payment Process Card -->
  <div class="card mb-2">
    <div class="card-header">
      <h3 class="card-title mb-0">Payment Details</h3>
    </div>
    <div class="card-body">
      <!-- Pricing: Base Price, Selling Price with discount -->
      <!-- Payment: Amount, Method -->
    </div>
  </div>

  <button type="submit" id="submitBtn" class="btn btn-primary">
    Submit <span class="htmx-indicator spinner-border spinner-border-sm"
       role="status"
       aria-hidden="true"></span>
  </button>
</form>
```

**Purpose:** The actual form that submits via HTMX. Contains:
- Lead selection (search via HTMX)
- Membership plan selection (search via HTMX)
- Customization section (PT sessions, diet plans, duration, start date)
- Payment section (amount, method)
- Submit button with HTMX indicator

---

### 3. `accounting/partials/payment_receipt.html` - Success Response

**File:** `crown_crm/templates/accounting/partials/payment_receipt.html`

Rendered on successful sale creation to display the created receipt.

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         URL: <slug>/accounting/sales/create/                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  views.sale_create_view (GET)                                                │
│  - Renders: accounting/forms/membership_sale_form.html                       │
│  - Uses: MembershipSaleForm (empty)                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Template: accounting/partials/membership_sale_form.html                    │
│  - Form submits via HTMX to: hx-create-membership-sale                       │
│  - JavaScript handles: lead/plan search, payment calculations               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  views.hx_create_membership_sale (POST)                                      │
│  - Uses: MembershipSaleCreateForm                                            │
│  - Calls: form.save_and_create_receipt()                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌───────────────────┐           ┌───────────────────┐
        │ MembershipSale   │           │ PaymentReceipt    │
        │ (Core Model)      │◄──────────│ (First Payment)   │
        └───────────────────┘           └───────────────────┘
                    │                               │
                    ▼                               ▼
        ┌───────────────────┐           ┌───────────────────┐
        │ LeadMaster        │           │ MembershipPlan    │
        │ (Customer)        │           │ (Plan Sold)       │
        └───────────────────┘           └───────────────────┘
```

---

## Detailed Step-by-Step Flow

### Step 1: User Visits the Page

**URL:** `<organization_slug>/accounting/sales/create/`

1. Django matches URL via `config/urls.py` → `organizations/urls.py` → `accounting/urls.py`
2. `sale_create_view` is called
3. Creates empty `MembershipSaleForm(organization=request.organization)`
4. Renders `accounting/forms/membership_sale_form.html`

### Step 2: User Selects a Lead

1. User types in lead search input (`#leadSearch`)
2. HTMX triggers `keyup changed delay:550ms`
3. Calls `search-lead` endpoint with query
4. Results appear in `#leadSearchResults`
5. User clicks a lead card
6. JavaScript `selectLead()` updates:
   - Hidden input `#lead` with lead UUID
   - `#leadSelection` div with lead summary card

### Step 3: User Selects a Membership Plan

1. User types in plan search input (`#membershipPlanSearch`)
2. HTMX triggers search to `search-membership-plan` endpoint
3. Results appear in `#membershipPlanSearchResults`
4. User clicks a plan card
5. JavaScript `selectMembershipPlan()` updates:
   - Hidden input `#plan` with plan UUID
   - `#membershipPlanSelection` div with plan summary
   - Initializes customization section with plan defaults
   - Sets payment amount to plan price

### Step 4: User Customizes the Sale

1. User can modify:
   - `custom_pt_sessions`: Override PT sessions
   - `custom_diet_plans`: Override diet plans
   - `duration`: Select different duration
   - `membership_start_date`: Set start date

### Step 5: User Enters Payment Details

1. `decidedAmount`: Shows base price from plan (read-only)
2. `customPrice`: User can modify selling price
   - If less than decided amount, discount is calculated
3. `payment_amount`: Initial payment amount
   - Must be ≤ custom price
   - Balance is calculated: `custom_price - payment_amount`
4. `payment_method`: Select from cash/card/upi/bank/other

### Step 6: Form Submission

1. User clicks "Submit" button
2. HTMX POST to `hx-create-membership-sale`
3. Form data sent:
   - `lead`: UUID
   - `plan`: UUID
   - `custom_pt_sessions`: int
   - `custom_diet_plans`: int
   - `duration`: string
   - `membership_start_date`: date
   - `custom_price`: decimal
   - `payment_amount`: decimal
   - `payment_method`: string
   - `notes`: text (optional)

### Step 7: Server Processing

1. `hx_create_membership_sale` receives POST
2. Creates `MembershipSaleCreateForm(request.POST, organization=...)`
3. Calls `form.is_valid()` - runs all validations
4. If valid:
   - Calls `form.save_and_create_receipt(request.organization)`
   - **Inside transaction:**
     - Creates `MembershipSale` instance
     - Sets `sale.organization = request.organization`
     - Saves sale to DB
     - If `payment_amount > 0`: Creates `PaymentReceipt`
5. Renders success template
6. Triggers `membership_sale_create_success` event

### Step 8: Response Handling

1. HTMX receives response
2. Swaps innerHTML of form target
3. JavaScript catches `membership_sale_create_success` event
4. Can redirect or show success message

---

## Data Fields Summary

| Field Name | Model | Type | Required | Description |
|------------|-------|------|----------|-------------|
| `lead` | MembershipSale | FK to LeadMaster | Yes | The customer |
| `plan` | MembershipSale | FK to MembershipPlan | Yes | The plan being sold |
| `custom_pt_sessions` | MembershipSale | Integer | No | Override PT sessions |
| `custom_diet_plans` | MembershipSale | Integer | No | Override diet plans |
| `duration` | MembershipSale | String (choice) | Yes | Selected duration |
| `membership_start_date` | MembershipSale | Date | Yes | Membership start |
| `custom_price` | MembershipSale | Decimal | No | Selling price |
| `payment_amount` | PaymentReceipt | Decimal | No | Initial payment |
| `payment_method` | PaymentReceipt | String (choice) | No* | Payment method |
| `notes` | MembershipSale | Text | No | Additional notes |

*Required if payment_amount > 0

---

## Error Handling

1. **Form Validation Errors:**
   - Payment amount > custom price
   - Missing payment method when amount > 0
   - Negative custom price

2. **HTMX Error Response:**
   - Re-renders `accounting/partials/membership_sale_form.html`
   - Preserves selected lead and plan
   - Shows validation errors inline

---

## Related Views and Endpoints

| Endpoint | View | Purpose |
|----------|------|---------|
| `search-lead` | Search leads for selection |
| `search-membership-plan` | Search plans for selection |
| `hx-quick-create-lead` | Create new lead via modal |
| `hx-create-membership-plan` | Create new plan via modal |
| `sales` | `sales_view` | List all sales |
| `sale-detail` | `sale_detail_view` | View sale details |