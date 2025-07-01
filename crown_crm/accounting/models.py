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
        is_customized (bool): Whether any plan details were customized.
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
        effective_pt_sessions (int): PT sessions after applying customizations.
        effective_diet_plans (int): Diet plans after applying customizations.
        effective_duration (str): Duration after applying customizations.
        effective_price (Decimal): Price after applying customizations.
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
    def total_paid(self) -> Decimal:
        """
        Calculate total amount paid across all receipts.

        Returns:
            Decimal: Total amount paid so far.
        """
        return self.receipts.aggregate(  # type: ignore[attr-defined]
            total=Sum("amount")
        )["total"] or Decimal("0")

    def clean(self) -> None:
        """
        Validate the membership sale and calculate discount percentage.

        Raises:
            ValidationError: If any validation fails.
        """
        super().clean()

        # Check if any custom fields are set
        has_custom_values = any(
            [
                self.custom_pt_sessions is not None,
                self.custom_diet_plans is not None,
                self.custom_duration is not None,
                self.custom_price is not None,
            ]
        )

        # If custom values exist but is_customized is False, set it to True
        if has_custom_values and not self.is_customized:
            self.is_customized = True

        # If no custom values but is_customized is True, reset it
        if not has_custom_values and self.is_customized:
            self.is_customized = False

        # Validate custom values if this is a customized sale
        if self.is_customized:
            self._validate_custom_values()
            self._calculate_discount_percentage()

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

    def _calculate_discount_percentage(self) -> None:
        """
        Calculate and set the discount percentage based on standard vs custom price.

        The discount is calculated based on the standard price for the selected duration.
        """
        if not self.is_customized or self.custom_price is None:
            self.discount_percentage = Decimal("0")
            return

        # Calculate standard price for the selected duration
        standard_price = self._get_standard_price_for_duration()

        if standard_price == 0:
            self.discount_percentage = Decimal("0")
        else:
            discount = ((standard_price - self.custom_price) / standard_price) * 100
            self.discount_percentage = max(
                Decimal("0"), min(Decimal("100"), discount.quantize(Decimal("0.01")))
            )

    def _get_standard_price_for_duration(self) -> Decimal:
        """
        Calculate the standard price for the selected duration.

        Returns:
            Decimal: Standard price for the selected duration.
        """
        duration = self.custom_duration if self.is_customized else self.duration

        # Get the standard price for the selected duration
        # This is a simplified calculation - adjust based on your pricing model
        standard_price = self.plan.price

        # Example: If the plan is yearly and custom duration is monthly
        if (
            duration == self.Duration.MONTHLY
            and self.plan.duration == self.Duration.YEARLY
        ):
            return standard_price / 12

        # Add more duration conversion logic as needed

        return standard_price

    @property
    def balance(self) -> Decimal:
        """Calculate remaining balance."""
        return self.custom_price - self.total_paid

    def update_balance_snapshots(self) -> None:
        """
        Recompute all balance snapshots for related payment receipts.
        This is useful when historical data needs to be corrected.
        """
        with transaction.atomic():
            # Get all receipts ordered by date
            receipts = self.receipts.order_by("date", "id")  # type: ignore[attr-defined]
            running_balance = self.custom_price

            # Update each receipt's balances in order
            for receipt in receipts:
                receipt.opening_balance = running_balance
                receipt.closing_balance = running_balance - receipt.amount
                receipt.save(update_fields=["opening_balance", "closing_balance"])
                running_balance = receipt.closing_balance

    def __str__(self) -> str:
        """Return a string representation of the membership sale."""
        return (
            f"Sale: {self.lead.get_full_name()} - {self.plan.name} - {self.created_at}"
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
    """

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
            if self.amount > self.sale.balance:
                raise ValidationError(
                    {
                        "amount": f"Payment amount (${self.amount}) exceeds the remaining balance (${self.sale.balance})."
                    }
                )

    @transaction.atomic
    def save(self, *args, **kwargs) -> None:
        """
        Save the payment receipt with balance calculations.

        Args:
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments

        This method is atomic and ensures:
            1. Validation is performed before saving
            2. Opening balance is calculated from the sale's current balance
            3. Closing balance is calculated by subtracting the payment amount
            4. All operations are performed in a single transaction
        """
        # Full clean to trigger validation
        self.full_clean()

        is_new = self._state.adding

        if is_new:
            # For new receipts, calculate balances based on current state
            self.opening_balance = self.sale.balance
            self.closing_balance = self.opening_balance - self.amount
        else:
            # For updates, we need to handle potential amount changes
            # More explanation in docs\membership_balance_snapshots.md
            old_instance = type(self).objects.get(pk=self.pk)
            if old_instance.amount != self.amount:
                # If amount changed, we need to update all subsequent receipts
                super().save(*args, **kwargs)
                self.sale.update_balance_snapshots()
                return
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        """Return a string representation of the payment receipt."""
        return f"Receipt: {self.sale.lead.get_full_name()} - {self.amount} - {self.date.date()}"


# class ReceiptBenefit(BaseModel):
#     """
#     Tracks which services/products were assigned to a lead as part of their sale.

#     Attributes:
#         sale: The membership sale this benefit is associated with
#         service: The service assigned (optional)
#         product: The product assigned (optional)
#         quantity: Number of units assigned
#         notes: Additional notes about the benefit
#     """

#     sale = models.ForeignKey(
#         MembershipSale,
#         on_delete=models.CASCADE,
#         related_name="benefits",
#         db_constraint=True,
#     )
#     service = models.ForeignKey(
#         Service,
#         on_delete=models.SET_NULL,
#         null=True,
#         blank=True,
#         related_name="benefits",
#         db_constraint=True,
#     )
#     product = models.ForeignKey(
#         Product,
#         on_delete=models.SET_NULL,
#         null=True,
#         blank=True,
#         related_name="benefits",
#         db_constraint=True,
#     )
#     quantity = models.PositiveIntegerField(default=1)
#     notes = models.CharField(max_length=255, blank=True)

#     def clean(self) -> None:
#         """
#         Validate that either a service or product is assigned, but not both.

#         Raises:
#             ValidationError: If neither service nor product is specified
#         """
#         if not self.service and not self.product:
#             raise ValidationError("Either service or product must be selected.")

#     def __str__(self) -> str:
#         """Return a string representation of the receipt benefit."""
#         if self.service:
#             return f"{self.sale.lead.get_full_name()} - {self.service.name} x {self.quantity}"
#         if self.product:
#             return f"{self.sale.lead.get_full_name()} - {self.product.name} x {self.quantity}"
#         return ""
