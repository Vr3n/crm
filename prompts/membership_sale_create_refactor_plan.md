# Membership Sale Create Flow — Implementation Action Plan (Senior Review Adapted)

## Overview

This plan adapts the implementation based on the senior review feedback and aligns with the current codebase state. Key changes:

- Convert `membership_end_date` from computed property to field
- Remove `DURATION_MAP` (JavaScript handles duration-to-date calculations)
- Simplify `days_left` to use the new field
- Handle `Duration.CUSTOM` for manual date entry

> **Reference**: Django best practices from `django-expert`, `django-patterns`, `django-tdd`, `django-security`, `rest-api-django`

---

## Current Model State (Already Cleaned)

| Field/Property                                                               | Status                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `plan` FK                                                                    | ✅ Already removed from model (docstring needs cleanup) |
| `custom_price`, `custom_pt_sessions`, `custom_diet_plans`, `custom_duration` | ✅ Already removed                                      |
| `base_price`, `price`, `discount_percentage`                                 | ✅ Present                                              |
| `Duration.CUSTOM`                                                            | ✅ Already in choices                                   |
| `@property membership_end_date`                                              | ⚠️ Computed from duration - needs to become field       |
| `DURATION_MAP`                                                               | ⚠️ Used by property - to be removed                     |

---

## PART 1 — Model Changes (`crown_crm/accounting/models.py`)

### 1.1 Add `membership_end_date` Field

**Add after `membership_start_date` (line ~110):**

```python
membership_end_date = models.DateField(
    blank=True,
    null=True,
    help_text="Membership expiration date. For preset durations, auto-computed via JS. For 'Custom' duration, enter manually.",
)
```

> **Django Best Practice** (`django-expert`): Use proper field types with appropriate null/blank settings.

### 1.2 Remove `@property membership_end_date`

**Current code (lines 122-127):**

```python
@property
def membership_end_date(self) -> date:
    delta = DURATION_MAP.get(self.duration)
    if delta is None:
        raise ValueError(f"Invalid duration: {self.duration}")
    return self.membership_start_date + delta
```

**Action**: Delete this property entirely. It conflicts with the new field and doesn't work for `Duration.CUSTOM`.

### 1.3 Remove `DURATION_MAP`

**Current code (lines 15-20):**

```python
DURATION_MAP = {
    "monthly": relativedelta.relativedelta(months=1),
    "quarterly": relativedelta.relativedelta(months=3),
    "6months": relativedelta.relativedelta(months=6),
    "yearly": relativedelta.relativedelta(years=1),
}
```

**Action**: Delete. JavaScript will handle duration-to-date calculations with its own `DURATION_MONTHS` constant.

### 1.3.1 Remove `dateutil` Import

After removing `DURATION_MAP`, also remove:

```python
from dateutil import relativedelta
```

This import is no longer needed after removing `DURATION_MAP`.

### 1.4 Simplify `days_left` Property

**Current code (lines 134-152):**

```python
@property
def days_left(self) -> int:
    if not self.membership_start_date or not self.duration:
        return 0

    today = date.today()
    end_date = self.membership_end_date

    if not end_date:
        return 0

    delta = end_date - today
    return delta.days
```

**Updated code:**

```python
@property
def days_left(self) -> int:
    """Calculate days remaining until membership expiration."""
    if not self.membership_end_date:
        return 0
    return (self.membership_end_date - date.today()).days
```

### 1.5 Fix `balance_amount` Property

The field `price` is `null=True, blank=True`. Add a guard to prevent crashes:

**Current code (lines 129-132):**

```python
@property
def balance_amount(self) -> Decimal:
    return self.price - self.total_paid_amount  # crashes if price is None
```

**Updated code:**

```python
@property
def balance_amount(self) -> Decimal:
    """Calculate remaining balance."""
    if self.price is None:
        return Decimal("0")
    return self.price - self.total_paid_amount
```

### 1.6 Update Model Docstring

**Lines 24-48** - Remove references to `plan`, `pt_sessions`, `diet_plans`, `custom_duration`:

```python
"""
Represents a membership sale to a lead.

Attributes:
    lead (LeadMaster): The lead who purchased the membership.
    organization (OrganizationMaster): The organization tenant this sale belongs to.
    duration (str): Selected duration from Duration.choices.
    base_price (Decimal, optional): Base/list price of the plan.
    price (Decimal, optional): Price charged to the customer.
    discount_percentage (Decimal, optional): Calculated discount percentage.
    membership_start_date (date): Membership start date.
    membership_end_date (date): Membership expiration date.
    notes (str, optional): Additional notes about the sale.

Properties:
    total_paid_amount (Decimal): Total amount paid across all receipts.
    balance_amount (Decimal): Remaining balance to be paid.
    days_left (int): Days remaining until membership expires.
"""
```

### 1.6 Run Migration

```bash
cd /home/vr3n/codes/crm
python manage.py makemigrations accounting --name add_membership_end_date_field
python manage.py migrate
```

> **Django Best Practice** (`django-expert`): Always verify schema after migrations.

---

## PART 2 — Form Changes (`crown_crm/accounting/forms.py`)

### 2.1 Base Form: `MembershipSaleForm`

```python
class MembershipSaleForm(forms.ModelForm):
    """Base form for MembershipSale."""

    class Meta:
        model = MembershipSale
        fields = [
            "lead",
            "membership_start_date",
            "membership_end_date",
            "base_price",
            "price",
            "notes",
        ]
        widgets = {
            "lead": forms.HiddenInput(),  # Template renders hidden input manually
            "membership_start_date": forms.DateInput(
                attrs={"class": "form-control", "type": "date"}, format="%Y-%m-%d"
            ),
            "membership_end_date": forms.DateInput(
                attrs={"class": "form-control", "type": "date"}, format="%Y-%m-%d"
            ),
            "base_price": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.01", "min": "0"}
            ),
            "price": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.01", "min": "0"}
            ),
            "notes": forms.Textarea(
                attrs={"class": "form-control", "rows": 3, "placeholder": "Optional notes"}
            ),
        }

    def __init__(self, *args, **kwargs):
        kwargs.pop("organization", None)
        super().__init__(*args, **kwargs)
        self.fields["membership_start_date"].initial = timezone.now().date()

    def clean_price(self):
        price = self.cleaned_data.get("price")
        if price is not None and price < 0:
            raise forms.ValidationError("Price cannot be negative.")
        return price

    def clean_base_price(self):
        base_price = self.cleaned_data.get("base_price")
        if base_price is not None and base_price < 0:
            raise forms.ValidationError("Base price cannot be negative.")
        return base_price

    def clean(self):
        cleaned_data = super().clean()
        start = cleaned_data.get("membership_start_date")
        end = cleaned_data.get("membership_end_date")
        if start and end and end <= start:
            self.add_error("membership_end_date", "End date must be after start date.")
        return cleaned_data
```

### 2.2 Create Form: `MembershipSaleCreateForm`

```python
class MembershipSaleCreateForm(MembershipSaleForm):
    """
    Extended form for initial sale creation.
    Adds duration_preset (UI helper), payment_amount, payment_method.
    """

    duration_preset = forms.ChoiceField(
        label="Duration",
        choices=[
            ("", "Custom / Manual"),
            ("monthly", "Monthly (1 month)"),
            ("quarterly", "Quarterly (3 months)"),
            ("6months", "6 Months"),
            ("yearly", "Yearly (12 months)"),
        ],
        required=False,
        widget=forms.Select(attrs={"class": "form-select", "id": "id_duration_preset"}),
    )

    payment_amount = forms.DecimalField(
        label="Payment Amount",
        min_value=Decimal("0"),
        max_digits=10,
        decimal_places=2,
        required=False,
        initial=Decimal("0"),
        widget=forms.NumberInput(
            attrs={"class": "form-control", "step": "0.01", "min": "0", "id": "id_payment_amount"}
        ),
    )

    payment_method = forms.ChoiceField(
        label="Payment Method",
        choices=[("", "--- Select Method ---"), *PaymentReceipt.Method.choices],
        required=False,
        widget=forms.Select(attrs={"class": "form-select", "id": "id_payment_method"}),
    )

    class Meta(MembershipSaleForm.Meta):
        fields = MembershipSaleForm.Meta.fields

    def clean(self):
        cleaned_data = super().clean()
        if cleaned_data is None:
            return cleaned_data

        payment_amount = cleaned_data.get("payment_amount") or Decimal("0")
        price = cleaned_data.get("price") or Decimal("0")
        payment_method = cleaned_data.get("payment_method")
        duration_preset = cleaned_data.get("duration_preset")

        # Payment cannot exceed selling price
        if payment_amount > price:
            self.add_error("payment_amount", "Payment cannot exceed the selling price.")

        # Method required when payment > 0
        if payment_amount > 0 and not payment_method:
            self.add_error("payment_method", "Select a payment method when amount is provided.")

        # Auto-compute discount_percentage
        base_price = cleaned_data.get("base_price")
        if base_price and base_price > 0 and price is not None:
            cleaned_data["computed_discount"] = (
                (base_price - price) / base_price * 100
            ).quantize(Decimal("0.01"))
        else:
            cleaned_data["computed_discount"] = Decimal("0")

        return cleaned_data

    def save_and_create_receipt(self, organization):
        """
        Save sale + optional first receipt in one atomic transaction.
        """
        from django.db import transaction

        payment_amount = self.cleaned_data.get("payment_amount") or Decimal("0")
        payment_method = self.cleaned_data.get("payment_method") or PaymentReceipt.Method.CASH
        duration_preset = self.cleaned_data.get("duration_preset") or "custom"
        discount = self.cleaned_data.get("computed_discount", Decimal("0"))

        with transaction.atomic():
            sale: MembershipSale = super().save(commit=False)
            sale.organization = organization
            sale.duration = duration_preset
            sale.discount_percentage = discount
            sale.save()

            if payment_amount > 0:
                # Note: opening_balance and closing_balance are auto-computed in PaymentReceipt.save()
                # Passing them explicitly would be silently overwritten, so we omit them here
                PaymentReceipt.objects.create(
                    sale=sale,
                    organization=organization,
                    amount=payment_amount,
                    method=payment_method,
                )

        return sale
```

> **Django Best Practice** (`django-patterns`): Use `transaction.atomic` for multi-model operations.
> **Security** (`django-security`): Validate all user inputs, including non-model fields.

---

## PART 3 — View Changes (`crown_crm/accounting/views.py`)

### 3.1 `sale_create_view` (Full Page GET)

```python
@login_required
@organization_slug_required
def sale_create_view(request: OrgHttpRequest) -> HttpResponse:
    """Render the full-page membership sale creation form."""
    form = MembershipSaleCreateForm(organization=request.organization)
    return render(request, "accounting/forms/membership_sale_form.html", {"form": form})
```

### 3.2 `hx_create_membership_sale` (HTMX POST)

**CRITICAL FIX**: On validation error, preserve lead selection to prevent silent data loss on HTMX re-render.

```python
@require_POST
@login_required
@organization_slug_required
def hx_create_membership_sale(request: OrgHttpRequest) -> HttpResponse:
    """Handle HTMX form submission for creating membership sales."""
    form = MembershipSaleCreateForm(request.POST, organization=request.organization)

    if form.is_valid():
        sale = form.save_and_create_receipt(request.organization)
        first_receipt = sale.receipts.order_by("date").first()

        response = render(
            request,
            "accounting/partials/payment_receipt.html",
            {"sale": sale, "receipt": first_receipt},
        )
        return trigger_client_event(
            response,
            "membership_sale_create_success",
            {"message": "Membership sale recorded successfully!"},
        )

    # On validation error: preserve lead selection context
    lead_id = request.POST.get("lead")
    selected_lead = None
    if lead_id:
        from crown_crm.leads.models import LeadMaster
        selected_lead = LeadMaster.objects.filter(
            pk=lead_id, organization=request.organization
        ).first()

    return render(
        request,
        "accounting/partials/membership_sale_form.html",
        {"form": form, "selected_lead": selected_lead},
    )
```

> **Security** (`django-security`): Ensure `@login_required` on all views.

---

## PART 4 — Template: Full Page (`accounting/forms/membership_sale_form.html`)

```html
{% extends "base.html" %} {% load static %} {% block title %}New Membership Sale
- {{ block.super }}{% endblock %} {% block content %}
<h4 class="mb-3">New Membership Sale</h4>
{% include "accounting/partials/membership_sale_form.html" %} {% endblock %} {%
block custom_js %}
<script>
  /* All JS is in the partial - see PART 6 */
</script>
{% endblock %}
```

---

## PART 5 — Template: HTMX Partial (`accounting/partials/membership_sale_form.html`)

```html
<form
  id="membershipSaleForm"
  hx-post="{% url 'hx-create-membership-sale' slug=request.organization.slug %}"
  hx-target="#membershipSaleForm"
  hx-swap="outerHTML"
  hx-indicator="#submitSpinner"
  novalidate
>
  {% csrf_token %} {# SECTION 1: LEAD SELECTION #}
  <div class="card mb-3">
    <div class="card-header"><h5 class="mb-0">1. Select Lead</h5></div>
    <div class="card-body">
      {# Hidden input - preserve value on HTMX re-render #}
      <input
        type="hidden"
        name="lead"
        id="id_lead"
        value="{{ selected_lead.pk|default:'' }}"
      />
      <div class="mb-2">
        <input
          type="text"
          id="leadSearch"
          class="form-control"
          placeholder="Search lead by name or phone..."
          hx-get="{% url 'search-lead' slug=request.organization.slug %}"
          hx-trigger="keyup changed delay:400ms"
          hx-target="#leadSearchResults"
          hx-include="[name='lead']"
          name="q"
          autocomplete="off"
        />
      </div>
      <div id="leadSearchResults"></div>
      <div id="leadSelection">
        {# Render lead card server-side on validation error re-render #} {#
        Note: LeadMaster has mobile_numbers and emails as related QuerySets, not
        direct fields #} {% if selected_lead %}
        <div class="card border-info mb-2">
          <div
            class="card-header bg-info text-white d-flex justify-content-between align-items-center py-2 px-3"
          >
            <h6 class="mb-0 text-white fw-normal">
              <i class="feather icon-user me-2"></i>{{ selected_lead.full_name
              }}
            </h6>
            <button
              type="button"
              class="btn btn-xs btn-outline-light border-0 p-1"
              onclick="removeSelectedLead()"
              title="Remove"
            >
              <i class="feather icon-x"></i>
            </button>
          </div>
          <div class="card-body p-3">
            <div class="row g-2 text-center">
              <div class="col-6">
                <div class="text-muted small">
                  <i class="feather icon-phone me-1"></i>Contact
                </div>
                <div class="fw-bold">
                  {{ selected_lead.mobile_numbers.first|default:"N/A" }}
                </div>
              </div>
              <div class="col-6">
                <div class="text-muted small">
                  <i class="feather icon-mail me-1"></i>Email
                </div>
                <div class="fw-bold text-truncate">
                  {{ selected_lead.emails.first|default:"N/A" }}
                </div>
              </div>
            </div>
          </div>
        </div>
        {% endif %}
      </div>

      {% if form.lead.errors %}
      <div class="text-danger small mt-1">{{ form.lead.errors.0 }}</div>
      {% endif %}
    </div>
  </div>

  {# SECTION 2: MEMBERSHIP DETAILS #}
  <div class="card mb-3">
    <div class="card-header"><h5 class="mb-0">2. Membership Details</h5></div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-md-4 col-sm-12">
          <label for="id_duration_preset" class="form-label">Duration</label>
          {{ form.duration_preset }}
          <div class="form-text text-muted">
            Preset auto-fills end date. Choose "Custom" for manual entry.
          </div>
        </div>

        <div class="col-md-4 col-sm-12">
          <label for="id_membership_start_date" class="form-label"
            >Start Date <span class="text-danger">*</span></label
          >
          {{ form.membership_start_date }} {% if
          form.membership_start_date.errors %}
          <div class="text-danger small">
            {{ form.membership_start_date.errors.0 }}
          </div>
          {% endif %}
        </div>

        <div class="col-md-4 col-sm-12">
          <label for="id_membership_end_date" class="form-label"
            >End Date <span class="text-danger">*</span></label
          >
          {{ form.membership_end_date }} {% if form.membership_end_date.errors
          %}
          <div class="text-danger small">
            {{ form.membership_end_date.errors.0 }}
          </div>
          {% endif %}
        </div>
      </div>
    </div>
  </div>

  {# SECTION 3: PRICING #}
  <div class="card mb-3">
    <div class="card-header"><h5 class="mb-0">3. Pricing</h5></div>
    <div class="card-body">
      <div class="row g-3 align-items-end">
        <div class="col-md-4 col-sm-12">
          <label for="{{ form.base_price.id_for_label }}" class="form-label">
            Base Price (₹)
            <span class="text-muted small fw-normal">— list price</span>
          </label>
          <div class="input-group">
            <span class="input-group-text">₹</span>
            {{ form.base_price }}
          </div>
          {% if form.base_price.errors %}
          <div class="text-danger small">{{ form.base_price.errors.0 }}</div>
          {% endif %}
        </div>

        <div class="col-md-4 col-sm-12">
          <label for="{{ form.price.id_for_label }}" class="form-label">
            Selling Price (₹)
            <span class="text-muted small fw-normal">— charged to member</span>
          </label>
          <div class="input-group">
            <span class="input-group-text">₹</span>
            {{ form.price }}
          </div>
          {% if form.price.errors %}
          <div class="text-danger small">{{ form.price.errors.0 }}</div>
          {% endif %}
        </div>

        <div class="col-md-4 col-sm-12">
          <label class="form-label">Discount</label>
          <div
            id="discountDisplay"
            class="form-control bg-light text-center fw-bold text-success"
            style="min-height: 38px; line-height: 1.8;"
          >
            — %
          </div>
        </div>
      </div>
    </div>
  </div>

  {# SECTION 4: PAYMENT #}
  <div class="card mb-3">
    <div class="card-header"><h5 class="mb-0">4. Initial Payment</h5></div>
    <div class="card-body">
      <div class="row g-3 align-items-end">
        <div class="col-md-4 col-sm-12">
          <label for="id_payment_amount" class="form-label"
            >Amount Paid Now (₹)</label
          >
          <div class="input-group">
            <span class="input-group-text">₹</span>
            {{ form.payment_amount }}
          </div>
          {% if form.payment_amount.errors %}
          <div class="text-danger small">
            {{ form.payment_amount.errors.0 }}
          </div>
          {% endif %}
          <div class="form-text text-muted">Leave 0 if no payment today.</div>
        </div>

        <div class="col-md-4 col-sm-12">
          <label for="id_payment_method" class="form-label"
            >Payment Method</label
          >
          {{ form.payment_method }} {% if form.payment_method.errors %}
          <div class="text-danger small">
            {{ form.payment_method.errors.0 }}
          </div>
          {% endif %}
        </div>

        <div class="col-md-4 col-sm-12">
          <label class="form-label">Balance Remaining (₹)</label>
          <div class="input-group">
            <span class="input-group-text">₹</span>
            <div
              id="balanceDisplay"
              class="form-control bg-light fw-bold"
              style="min-height: 38px; line-height: 1.8;"
            >
              0.00
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  {# SECTION 5: NOTES #}
  <div class="card mb-3">
    <div class="card-header"><h5 class="mb-0">5. Notes</h5></div>
    <div class="card-body">
      <label for="{{ form.notes.id_for_label }}" class="form-label"
        >Notes (optional)</label
      >
      {{ form.notes }}
    </div>
  </div>

  {# SUBMIT #}
  <div class="d-flex gap-2">
    <button type="submit" class="btn btn-primary" id="submitBtn">
      Save Membership
      <span
        id="submitSpinner"
        class="htmx-indicator spinner-border spinner-border-sm ms-1"
        role="status"
        aria-hidden="true"
      ></span>
    </button>
    <a
      href="{% url 'sales' slug=request.organization.slug %}"
      class="btn btn-outline-secondary"
    >
      Cancel
    </a>
  </div>
</form>
```

---

## PART 6 — JavaScript (`{% block custom_js %}`)

```javascript
/* ═══════════════════════════════════════════════════════════════
   MEMBERSHIP SALE CREATE — JS
   Pure functions, no globals except event listeners at bottom.
═══════════════════════════════════════════════════════════════ */

/* Duration → End Date calculation (moved from Python DURATION_MAP) */
const DURATION_MONTHS = {
  monthly: 1,
  quarterly: 3,
  "6months": 6,
  yearly: 12,
};

/**
 * Calculate end date from start date + duration key.
 * End date = start date + N months - 1 day (inclusive).
 */
function calcEndDate(startDate, durationKey) {
  const months = DURATION_MONTHS[durationKey];
  if (!months) return null;
  const end = new Date(startDate);
  end.setMonth(end.getMonth() + months);
  end.setDate(end.getDate() - 1); // inclusive end
  return end;
}

/** Format Date to YYYY-MM-DD */
function toDateInputValue(d) {
  return d.toISOString().split("T")[0];
}

/** Update end date when start date or duration changes */
function syncEndDate() {
  const startInput = document.getElementById("id_membership_start_date");
  const endInput = document.getElementById("id_membership_end_date");
  const durationSelect = document.getElementById("id_duration_preset");

  if (!startInput || !endInput || !durationSelect) return;

  const durationKey = durationSelect.value;
  const startVal = startInput.value;

  /* Only auto-fill for preset durations, NOT for custom/empty */
  if (
    durationKey &&
    startVal &&
    durationKey !== "custom" &&
    durationKey !== ""
  ) {
    const startDate = new Date(startVal);
    const endDate = calcEndDate(startDate, durationKey);
    if (endDate) {
      endInput.value = toDateInputValue(endDate);
    }
  }
  /* For custom/empty, leave end date editable for manual entry */
}

/** When end date is manually edited, reset duration to blank (Custom) */
function onEndDateManualEdit() {
  const durationSelect = document.getElementById("id_duration_preset");
  if (durationSelect) durationSelect.value = "";
}

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

/* Balance display — price minus payment */
function updateBalanceDisplay() {
  const priceInput = document.getElementById("id_price");
  const paymentInput = document.getElementById("id_payment_amount");
  const balanceDisplay = document.getElementById("balanceDisplay");
  if (!priceInput || !paymentInput || !balanceDisplay) return;

  const price = parseFloat(priceInput.value) || 0;
  const paid = parseFloat(paymentInput.value) || 0;
  const balance = Math.max(0, price - paid);

  balanceDisplay.textContent = balance.toFixed(2);

  if (paid > price) {
    paymentInput.classList.add("is-invalid");
  } else {
    paymentInput.classList.remove("is-invalid");
  }

  paymentInput.max = price;
}

/* Lead selection */
function selectedLeadCard(leadName, leadId, mobileNumbers, emails) {
  return `
  <div class="card border-info mb-2">
    <div class="card-header bg-info text-white d-flex justify-content-between align-items-center py-2 px-3">
      <h6 class="mb-0 text-white fw-normal">
        <i class="feather icon-user me-2"></i>${leadName}
      </h6>
      <button type="button" class="btn btn-xs btn-outline-light border-0 p-1"
              onclick="removeSelectedLead()" title="Remove">
        <i class="feather icon-x"></i>
      </button>
    </div>
    <div class="card-body p-3">
      <div class="row g-2 text-center">
        <div class="col-6">
          <div class="text-muted small"><i class="feather icon-phone me-1"></i>Contact</div>
          <div class="fw-bold">${mobileNumbers || "N/A"}</div>
        </div>
        <div class="col-6">
          <div class="text-muted small"><i class="feather icon-mail me-1"></i>Email</div>
          <div class="fw-bold text-truncate">${emails || "N/A"}</div>
        </div>
      </div>
    </div>
  </div>`;
}

function selectLead(card) {
  const leadId = card.dataset.leadId;
  const leadName = card.dataset.leadName;
  const mobileNumbers = JSON.parse(card.dataset.leadMobileNumbers || "[]");
  const emails = JSON.parse(card.dataset.leadEmails || "[]");

  document.getElementById("id_lead").value = leadId;
  document.getElementById("leadSelection").innerHTML = selectedLeadCard(
    leadName,
    leadId,
    mobileNumbers,
    emails,
  );

  const results = document.getElementById("leadSearchResults");
  if (results) results.innerHTML = "";
}

function removeSelectedLead() {
  document.getElementById("id_lead").value = "";
  const sel = document.getElementById("leadSelection");
  if (sel) sel.innerHTML = "";
}

/* Initialize form - called on DOM ready AND after HTMX swap */
function initForm() {
  const startInput = document.getElementById("id_membership_start_date");
  if (startInput && !startInput.value) {
    startInput.value = toDateInputValue(new Date());
  }

  // Re-attach all event listeners for new DOM nodes after HTMX swap
  const durationSelect = document.getElementById("id_duration_preset");
  if (durationSelect) {
    durationSelect.addEventListener("change", syncEndDate);
  }
  if (startInput) {
    startInput.addEventListener("change", syncEndDate);
  }

  const endInput = document.getElementById("id_membership_end_date");
  if (endInput) {
    endInput.addEventListener("input", onEndDateManualEdit);
  }

  const baseInput = document.getElementById("id_base_price");
  const priceInput = document.getElementById("id_price");
  const paymentInput = document.getElementById("id_payment_amount");

  if (baseInput) baseInput.addEventListener("input", updateDiscountDisplay);
  if (priceInput) priceInput.addEventListener("input", updateDiscountDisplay);
  if (paymentInput)
    paymentInput.addEventListener("input", updateBalanceDisplay);

  // Recalculate displays
  updateDiscountDisplay();
  updateBalanceDisplay();
}

/* Initialize on DOM ready */
document.addEventListener("DOMContentLoaded", initForm);

/* Re-attach listeners after HTMX swap - only if form exists */
document.body.addEventListener("htmx:afterSwap", function (evt) {
  if (document.getElementById("membershipSaleForm")) {
    initForm();
  }
});

/* Lead creation success event */
document.body.addEventListener("lead_create_success", function (evt) {
  const d = evt.detail;
  const leadName = [d.first_name, d.middle_name, d.last_name]
    .filter(Boolean)
    .join(" ");
  document.getElementById("leadSelection").innerHTML = selectedLeadCard(
    leadName,
    d.id,
    d.mobile_numbers || [],
    d.emails || [],
  );
  document.getElementById("id_lead").value = d.id;
  const el = document.getElementById("leadSearch");
  if (el) el.value = "";
  const res = document.getElementById("leadSearchResults");
  if (res) res.innerHTML = "";
  $("#modal-container").modal("hide");
});
```

---

## PART 7 — Validation Strategy

> **Note**: The form uses `novalidate`, which disables browser validation including `required` on hidden inputs. Server-side validation is the source of truth.

| Field                   | HTML Attribute                             | Django Validation                     |
| ----------------------- | ------------------------------------------ | ------------------------------------- |
| `lead` (hidden)         | — (novalidate disables browser validation) | Form validation via Django            |
| `membership_start_date` | `type="date"`                              | `clean()` — required                  |
| `membership_end_date`   | `type="date"`                              | `clean()` — end > start               |
| `base_price`            | `type="number"`, `min="0"`                 | `clean_base_price()`                  |
| `price`                 | `type="number"`, `min="0"`, `required`     | `clean_price()`                       |
| `payment_amount`        | `type="number"`, `min="0"`                 | `clean()` — cannot exceed price       |
| `payment_method`        | —                                          | `clean()` — required when payment > 0 |

> **Security** (`django-security`): Use both client-side and server-side validation.

---

## PART 8 — Cleanup Checklist

| File         | What to Remove                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `models.py`  | Delete `@property membership_end_date` (replaced by field)                                                           |
| `models.py`  | Delete `DURATION_MAP` dict                                                                                           |
| `models.py`  | Remove `from dateutil import relativedelta` import (no longer needed)                                                |
| `models.py`  | Update docstring — remove `plan`, `pt_sessions`, `diet_plans` references                                             |
| Templates JS | Remove old functions: `selectMembershipPlan()`, `removeSelectedMembershipPlan()`, `selected_membership_card()`, etc. |

---

## PART 9 — Data Flow on Submit

> **CRITICAL**: All form fields ARE submitted via POST, including `duration_preset`, `payment_amount`, and `payment_method`. They are not model fields but are read from `cleaned_data` in the form. **Do NOT use `disabled` attribute** on these fields — disabled inputs don't submit.

```
Browser POST (all fields submitted)
├── lead (hidden)
├── membership_start_date
├── membership_end_date
├── duration_preset (NOT a model field — consumed in save_and_create_receipt())
├── base_price
├── price
├── payment_amount (NOT a model field — consumed in save_and_create_receipt())
├── payment_method (NOT a model field — consumed in save_and_create_receipt())
└── notes

↓

MembershipSaleCreateForm.clean()
├── validates end > start
├── validates payment ≤ price
├── validates method required when payment > 0
└── computes discount %

↓

save_and_create_receipt(organization)
├── sale.duration = duration_preset (display label)
├── sale.discount_percentage = computed_discount
├── saves MembershipSale
└── if payment > 0: creates PaymentReceipt (atomic)

↓

trigger_client_event("membership_sale_create_success")
↓

renders payment_receipt.html partial
```

---

## PART 10 — Testing Considerations

> **TDD Best Practice** (`django-tdd`):

```python
# Model tests
class TestMembershipSaleModel:
    def test_days_left_positive(self):
        sale = MembershipSale(membership_end_date=date.today() + timedelta(days=30))
        assert sale.days_left == 30

    def test_days_left_negative(self):
        sale = MembershipSale(membership_end_date=date.today() - timedelta(days=5))
        assert sale.days_left == -5

    def test_days_left_no_end_date(self):
        sale = MembershipSale(membership_end_date=None)
        assert sale.days_left == 0

# Form tests
class TestMembershipSaleForm:
    def test_end_date_before_start_validation(self):
        form = MembershipSaleCreateForm(data={
            'membership_start_date': '2025-01-15',
            'membership_end_date': '2025-01-10',
            ...
        })
        assert not form.is_valid()
        assert 'membership_end_date' in form.errors
```

---

## Implementation Order

1. **Model**: Add field, remove property, remove DURATION_MAP, simplify days_left, fix balance_amount, remove dateutil import, update docstring
2. **Migration**: Run `makemigrations` + `migrate`
3. **Forms**: Rewrite both forms
4. **Views**: Update views with lead preservation on error
5. **Templates**: Update full-page and partial templates with selected_lead handling
6. **JS**: Replace old JS with initForm() function
7. **Cleanup**: Remove dead code
8. **Manual Test**: **CRITICAL** — Test HTMX re-render cycle:
   - Select a lead
   - Fill in other fields but intentionally leave one required field empty
   - Submit the form
   - Verify: lead card re-renders, event listeners work, discount display recalculates
   - This is the most likely place for subtle bugs

---

## Key Adaptations from Senior Review

| Aspect                | Senior Review               | Our Implementation                                 |
| --------------------- | --------------------------- | -------------------------------------------------- |
| `membership_end_date` | Replace property with field | ✅ Same                                            |
| `DURATION_MAP`        | Delete (no longer needed)   | ✅ Delete, JS handles calculations                 |
| `Duration.CUSTOM`     | Handle in form/JS           | ✅ JS doesn't auto-fill for custom                 |
| Validation            | Server-side for key fields  | ✅ Both client + server                            |
| Cleanup               | Remove dead code            | ✅ Remove property, DURATION_MAP, update docstring |

---

## Notes for Senior Developer Review

1. **Breaking Change**: `membership_end_date` changes from computed to stored field. Existing computed behavior replaced by JS for presets.

2. **Atomic Transactions**: `save_and_create_receipt()` uses `transaction.atomic` for data consistency.

3. **HTMX**: Form uses HTMX for partial updates. On validation errors, form re-renders with errors.

4. **Validation Coverage**: Server-side validation handles edge cases (e.g., direct API calls bypassing form).

5. **URL Requirements**:
   - `hx-create-membership-sale` — POST handler
   - `search-lead` — HTMX lead search
   - `sales` — sales list page

---

> **End of Senior-Adapted Implementation Plan**
