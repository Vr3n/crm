from datetime import date
from dateutil import relativedelta
from decimal import Decimal

from django.db import models
from django.db.models import Sum
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db import transaction

from crown_crm.utils.models import BaseModel
from crown_crm.leads.models import LeadMaster


class MemberType(BaseModel):
    """
    Represents different types of gym members.

    Attributes:
        name: The name of the member type
        description: Detailed description of the member type
    """

    organization = models.ForeignKey(
        "organizations.OrganizationMaster", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    code = models.CharField(max_length=255, unique=True, null=True, blank=True)

    def __str__(self) -> str:
        """Return a string representation of the member type."""
        return self.name


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


DURATION_MAP = {
    'monthly': relativedelta.relativedelta(months=1),
    'quarterly': relativedelta.relativedelta(months=3),
    '6months': relativedelta.relativedelta(months=6),
    'yearly': relativedelta.relativedelta(years=1),
}


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
        help_text="Calculated discount percentage from standard price",
    )

    notes = models.TextField(
        blank=True,
        null=True,
        help_text="Additional notes about the sale",
    )

    membership_start_date = models.DateField(
        blank=True,
        null=True,
        help_text="Date when the membership of the lead starts, Helps track membership validity.",
    )

    @property
    def total_paid_amount(self) -> Decimal:
        """
        Calculate total amount paid across all receipts.

        Returns:
            Decimal: Total amount paid so far.
        """
        return self.receipts.aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0")

    @property
    def membership_end_date(self) -> date:
        delta = DURATION_MAP.get(self.duration)
        if delta is None:
            raise ValueError(f"Invalid duration: {self.duration}")
        return self.membership_start_date + delta

    @property
    def balance_amount(self) -> Decimal:
        """Calculate remaining balance."""
        return self.custom_price - self.total_paid_amount
        
    @property
    def days_left(self) -> int:
        """
        Calculate the number of days remaining until membership expiration.
        
        Returns:
            int: Number of days remaining. Negative if membership has already expired.
        """
        if not self.membership_start_date or not self.duration:
            return 0
            
        today = date.today()
        end_date = self.membership_end_date
        
        if not end_date:
            return 0
            
        delta = end_date - today
        return delta.days


    def _validate_custom_values(self) -> None:
        """
        Validate custom values for a customized membership sale.

        Raises:
            ValidationError: If any custom value is invalid.
        """
        if self.custom_pt_sessions is not None and self.custom_pt_sessions < 0:
            raise ValidationError(
                {"custom_pt_sessions": "PT sessions cannot be negative."}
            )

        if self.custom_diet_plans is not None and self.custom_diet_plans < 0:
            raise ValidationError(
                {"custom_diet_plans": "Diet plans cannot be negative."}
            )

        if self.custom_price is not None and self.custom_price < 0:
            raise ValidationError({"custom_price": "Price cannot be negative."})

        if self.custom_duration is not None and self.custom_duration not in dict(
            self.Duration.choices
        ):
            raise ValidationError({"custom_duration": "Invalid duration value."})

    def update_balance_snapshots(self) -> None:
        """
        Recompute all balance snapshots for related payment receipts.
        This is useful when historical data needs to be corrected.
        """
        with transaction.atomic():
            # Get all receipts ordered by date
            receipts = self.receipts.order_by("date")  # type: ignore[attr-defined]
            running_balance = self.custom_price

            # Update each receipt's balances in order
            for receipt in receipts:
                receipt.opening_balance = running_balance
                receipt.closing_balance = running_balance - receipt.amount
                receipt.save(update_fields=["opening_balance", "closing_balance"])
                running_balance = receipt.closing_balance

    # Type checking shenanigans.
    receipts: models.QuerySet["PaymentReceipt"]

    def __str__(self) -> str:
        """Return a string representation of the membership sale."""
        return (
            f"Sale: {self.lead.full_name} - {self.plan.name} - {self.created_at}"
        )


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
        'monthly': '01',
        'quarterly': '03',
        '6months': '06',
        'yearly': '12'
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
    receipt_number = models.CharField(
        max_length=20, null=True, blank=True
    )
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

    def clean(self) -> None:
        """Validate the payment receipt."""
        super().clean()

        # Skip validation for existing instances during bulk operations
        if self._state.adding or getattr(self._state, "adding_fields", False):
            # Check for overpayment
            if self.amount > self.sale.balance_amount:
                raise ValidationError(
                    {
                        "amount": f"Payment amount (${self.amount}) exceeds the remaining balance (${self.sale.balance_amount})."
                    }
                )

    def _generate_receipt_number(self) -> str:
        """Generate a unique receipt number for the payment.
        
        The format is: YY/MM/DD/duration_code/count
        - YY/MM/DD: Current date
        - duration_code: 2-digit code based on membership duration
        - count: 4-digit sequential number within the organization
        
        Returns:
            str: Generated receipt number
        """
        from django.db import transaction
        
        with transaction.atomic():
            # Get current date in YY/MM/DD format
            date_part = timezone.now().strftime('%y/%m/%d')
            
            # Get duration code from related sale
            duration_code = self.DURATION_CODES.get(self.sale.duration, '00')
            
            # Get the latest receipt number for this organization
            receipt_count = PaymentReceipt.objects.filter(
                organization=self.organization,
            ).count() + 1
            
            return f"{date_part}-{duration_code}-{receipt_count:04d}"

    @transaction.atomic
    def save(self, *args, **kwargs) -> None:
        """
        Save the payment receipt with balance calculations and receipt number generation.

        Args:
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments

        This method is atomic and ensures:
            1. Validation is performed before saving
            2. Opening balance is calculated from the sale's current balance
            3. Closing balance is calculated by subtracting the payment amount
            4. Unique receipt number is generated for new records
            5. All operations are performed in a single transaction
        """
        # Full clean to trigger validation
        self.full_clean()

        is_new = self._state.adding

        if is_new:
            # Generate receipt number for new records
            if not self.receipt_number:
                self.receipt_number = self._generate_receipt_number()
                
            # For new receipts, calculate balances based on current state
            self.opening_balance = self.sale.balance_amount
            self.closing_balance = self.opening_balance - self.amount
        else:
            # For updates, we need to handle potential amount changes
            # More explanation in docs\\membership_balance_snapshots.md
            old_instance = type(self).objects.get(pk=self.pk)
            if old_instance.amount != self.amount:
                # If amount changed, we need to update all subsequent receipts
                super().save(*args, **kwargs)
                self.sale.update_balance_snapshots()
                return
                
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        """Return a string representation of the payment receipt."""
        return f"Receipt: {self.sale.lead.full_name} - {self.amount} - {self.date.date()}"