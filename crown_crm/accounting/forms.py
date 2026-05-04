from decimal import Decimal

from django import forms
from django.utils import timezone

from .models import (
    MembershipSale,
    PaymentReceipt,
)


# Stub classes for backward compatibility - to be removed after full migration
# These forms are no longer used in the create flow but referenced elsewhere
class MemberTypeForm(forms.ModelForm):
    """Deprecated: Stub for backward compatibility."""
    pass


class MembershipPlanForm(forms.ModelForm):
    """Deprecated: Stub for backward compatibility."""
    pass


class PaymentReceiptForm(forms.ModelForm):
    """Form for editing PaymentReceipt instances."""

    class Meta:
        model = PaymentReceipt
        fields = ["amount", "method", "reference", "notes"]
        widgets = {
            "amount": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.01", "min": "0.01"}
            ),
            "method": forms.Select(attrs={"class": "form-select"}),
            "reference": forms.TextInput(attrs={"class": "form-control"}),
            "notes": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
        }


class CreatePaymentReceiptForm(forms.ModelForm):
    """Form for paying Balance amount."""

    balance_amount = forms.DecimalField(
        label="Balance Amount",
        required=False,
        widget=forms.NumberInput(
            attrs={
                "class": "form-control",
                "step": "0.01",
                "min": "0.01",
                "disabled": True,
                "readonly": True,
            }
        ),
    )

    class Meta:
        model = PaymentReceipt
        fields = [
            "sale",
            "amount",
            "method",
            "notes",
            "balance_amount",
            "closing_balance",
            "opening_balance",
        ]

        widgets = {
            "sale": forms.HiddenInput(),
            "amount": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.01", "min": "0.01"}
            ),
            "method": forms.Select(attrs={"class": "form-select"}),
            "notes": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)


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
            "lead": forms.HiddenInput(),
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

        if payment_amount > price:
            self.add_error("payment_amount", "Payment cannot exceed the selling price.")

        if payment_amount > 0 and not payment_method:
            self.add_error("payment_method", "Select a payment method when amount is provided.")

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
                PaymentReceipt.objects.create(
                    sale=sale,
                    organization=organization,
                    amount=payment_amount,
                    method=payment_method,
                )

        return sale