from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal
from django.utils import timezone


class Bill(models.Model):
    """
    Represents a master bill/invoice containing multiple products/services.

    Attributes:
        organization (FK): The organization issuing the bill.
        lead (FK): Optional reference to a CRM lead.
        status (str): Lifecycle status of the bill (draft, confirmed, paid, cancelled).
        bill_number (str): Auto-generated unique identifier.
        bill_date (datetime): Date the bill was created.
        subtotal (decimal): Pre-tax total of all items.
        tax_percent (decimal): Applied tax percentage.
        tax_amount (decimal): Calculated tax value.
        total (decimal): Final total (subtotal + tax).
        remarks (text): Optional notes.
        created_by (FK): User who created the bill.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        CONFIRMED = "confirmed", "Confirmed"
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"

    organization = models.ForeignKey("organizations.OrganizationMaster", on_delete=models.CASCADE)
    lead = models.ForeignKey("leads.LeadMaster", on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    bill_number = models.CharField(max_length=50, unique=True, blank=True)
    bill_date = models.DateTimeField(default=timezone.now)

    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))

    remarks = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey("users.User", on_delete=models.SET_NULL, null=True, related_name="bills_created")

    class Meta:
        ordering = ["-bill_date"]

    def __str__(self):
        return f"Bill {self.bill_number or 'Unnumbered'}"

    def save(self, *args, **kwargs):
        """
        Saves the Bill instance and assigns a unique bill number if missing.
        """
        if not self.bill_number:
            self.bill_number = self.generate_bill_number()
        super().save(*args, **kwargs)

    def generate_bill_number(self):
        """
        Generates a unique sequential bill number for the current year.

        Returns:
            str: Unique bill number like 'BILL-2025-0001'.
        """
        prefix = f"BILL-{timezone.now().year}-"
        last = Bill.objects.filter(bill_number__startswith=prefix).order_by("bill_number").last()
        if last and last.bill_number:
            last_num = int(last.bill_number.split("-")[-1])
            return f"{prefix}{last_num + 1:04d}"
        return f"{prefix}0001"

    def recalculate_totals(self):
        """
        Recomputes subtotal, tax, and total based on related BillItems.
        """
        line_items = self.items.all()
        self.subtotal = sum(item.line_total for item in line_items)
        self.tax_amount = self.subtotal * (self.tax_percent / 100)
        self.total = self.subtotal + self.tax_amount
        self.save(update_fields=["subtotal", "tax_amount", "total"])


class BillItem(models.Model):
    """
    Represents an individual item on a bill, linked to either a product or service.

    Attributes:
        bill (FK): The parent bill.
        item_type (str): Either 'product' or 'service'.
        product (FK): Optional reference to a product.
        service (FK): Optional reference to a service.
        name (str): Name at time of billing.
        quantity (int): Number of units billed.
        original_unit_price (decimal): Price from master record.
        final_unit_price (decimal): Actual billed price.
        line_total (decimal): Calculated as quantity * final_unit_price.
        service_start_date (date): Optional date if service billing applies.
    """

    class ItemType(models.TextChoices):
        PRODUCT = "product", "Product"
        SERVICE = "service", "Service"

    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name="items")
    item_type = models.CharField(max_length=10, choices=ItemType.choices, default=ItemType.SERVICE)
    product = models.ForeignKey("logistics.Product", on_delete=models.SET_NULL, null=True, blank=True)
    service = models.ForeignKey("logistics.Service", on_delete=models.SET_NULL, null=True, blank=True)

    name = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    original_unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    final_unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=original_unit_price)
    line_total = models.DecimalField(max_digits=10, decimal_places=2)
    service_start_date = models.DateField(blank=True, null=True)

    class Meta:
        verbose_name = "Bill Item"
        verbose_name_plural = "Bill Items"

    def __str__(self):
        return f"{self.name} (x{self.quantity})"

    def save(self, *args, **kwargs):
        """
        Saves the item and updates its line total and parent bill totals.
        """
        if self.item_type == self.ItemType.PRODUCT and self.product:
            self.name = self.name or self.product.name
            self.original_unit_price = self.original_unit_price or self.product.price
        elif self.item_type == self.ItemType.SERVICE and self.service:
            self.name = self.name or self.service.name
            self.original_unit_price = self.original_unit_price or self.service.price

        self.final_unit_price = self.final_unit_price or self.original_unit_price
        self.line_total = self.final_unit_price * self.quantity
        super().save(*args, **kwargs)
        self.bill.recalculate_totals()

    def clean(self):
        """
        Validates mutual exclusivity and correctness of product/service fields.
        """
        from django.core.exceptions import ValidationError

        if not self.product and not self.service:
            raise ValidationError("Either product or service must be selected.")
        if self.product and self.service:
            raise ValidationError("Select either product or service, not both.")
        if self.item_type == self.ItemType.PRODUCT and not self.product:
            raise ValidationError("Product must be set for product type.")
        if self.item_type == self.ItemType.SERVICE and not self.service:
            raise ValidationError("Service must be set for service type.")


class PaymentReceipt(models.Model):
    """
    Records payments made against a bill. Supports partial and multi-method payments.

    Attributes:
        bill (FK): The related bill.
        date (datetime): Timestamp of payment.
        amount (decimal): Amount paid.
        method (str): Payment method (cash, card, UPI, etc.).
        reference (str): Optional reference number (e.g., transaction ID).
        notes (text): Optional comments.
    """

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        UPI = "upi", "UPI"
        BANK = "bank", "Bank Transfer"
        OTHER = "other", "Other"

    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name="payments")
    date = models.DateTimeField(default=timezone.now)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=20, choices=Method.choices, default=Method.CASH)
    reference = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"Receipt ₹{self.amount} on {self.date.strftime('%Y-%m-%d')}"

    def save(self, *args, **kwargs):
        """
        Saves the receipt and updates the status of the related bill.
        """
        super().save(*args, **kwargs)
        self.update_bill_payment_status()

    def update_bill_payment_status(self):
        """
        Updates the bill's status to PAID if fully paid, otherwise CONFIRMED.
        """
        paid_total = self.bill.payments.aggregate(
            total=models.Sum("amount")
        )["total"] or Decimal("0.00")

        if paid_total >= self.bill.total:
            self.bill.status = Bill.Status.PAID
        else:
            self.bill.status = Bill.Status.CONFIRMED
        self.bill.save(update_fields=["status"])
