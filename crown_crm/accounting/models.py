from django.db import models
from utils.models import BaseModel

# Create your models here.


class Bill(BaseModel):
    organization = models.ForeignKey(
        "organizations.OrganizationMaster",
        on_delete=models.CASCADE,
        related_name="bills",
    )
    sale = models.OneToOneField(
        "logistics.Order", on_delete=models.CASCADE, related_name="bill"
    )
    bill_date = models.DateTimeField(auto_now_add=True)
    bill_number = models.CharField(max_length=100, unique=True)
    total_amount_due = models.DecimalField(
        max_digits=12, decimal_places=2, default=0.00
    )
    payment_status = models.CharField(
        max_length=50, default="Pending"
    )  # e.g., 'Pending', 'Paid', 'Overdue'

    def __str__(self):
        return f"Bill #{self.bill_number} for Sale #{self.sale.id}"

    class Meta:
        verbose_name = "Bill"
        verbose_name_plural = "Bills"


class AccountLedger(BaseModel):
    organization = models.ForeignKey(
        "organizations.OrganizationMaster",
        on_delete=models.CASCADE,
        related_name="account_ledgers",
    )
    account_name = models.CharField(max_length=255, unique=True)
    account_type = models.CharField(
        max_length=50
    )  # e.g., 'Asset', 'Liability', 'Revenue', 'Expense'
    description = models.TextField(blank=True, null=True)
    current_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)

    def __str__(self):
        return self.account_name

    class Meta:
        verbose_name = "Account Ledger"
        verbose_name_plural = "Account Ledgers"


class Transaction(BaseModel):
    organization = models.ForeignKey(
        "organizations.OrganizationMaster",
        on_delete=models.CASCADE,
        related_name="org_transactions",
    )
    bill = models.ForeignKey(
        Bill,
        on_delete=models.SET_NULL,
        related_name="bill_transactions",
        null=True,
        blank=True,
    )
    transaction_date = models.DateTimeField(auto_now_add=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    transaction_type = models.CharField(
        max_length=50
    )  # e.g., 'Income', 'Expense', 'Payment'
    account = models.ForeignKey(
        AccountLedger, on_delete=models.CASCADE, related_name="acc_transactions"
    )

    def __str__(self):
        return f"Transaction #{self.id} of {self.amount} on {self.transaction_date}"

    class Meta:
        verbose_name = "Transaction"
        verbose_name_plural = "Transactions"
