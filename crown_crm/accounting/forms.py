from decimal import Decimal

from django import forms
from django.utils import timezone

from .models import (
    MemberType,
    MembershipPlan,
    MembershipSale,
    PaymentReceipt,
)


class MemberTypeForm(forms.ModelForm):
    """Form for creating and updating MemberType instances."""

    class Meta:
        model = MemberType
        fields = ["code", "name", "description"]
        widgets = {
            "code": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "Enter unique code (e.g. 01)",
                    "required": True,
                }
            ),
            "name": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "Enter member type name",
                    "required": True,
                }
            ),
            "description": forms.Textarea(
                attrs={
                    "class": "form-control",
                    "rows": 3,
                    "placeholder": "Enter description (optional)",
                    "required": False,
                }
            ),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["code"].label = "Code"

        # Make code field required
        self.fields["code"].required = True


class MembershipPlanForm(forms.ModelForm):
    """
    Form for creating and updating MembershipPlan instances.

    This form handles validation and rendering of membership plan data,
    including custom validation for price, PT sessions, and diet plans.
    """

    class Meta:
        model = MembershipPlan
        fields = [
            "name",
            "price",
            "pt_sessions",
            "diet_plans",
            "perks",
            "description",
            "is_active",
        ]
        widgets = {
            "name": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "Enter plan name",
                    "required": True,
                    "autofocus": True,
                }
            ),
            "price": forms.NumberInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "Enter price",
                    "step": "0.01",
                    "min": "0",
                    "required": True,
                }
            ),
            "pt_sessions": forms.NumberInput(
                attrs={"class": "form-control", "min": "0", "required": True}
            ),
            "diet_plans": forms.NumberInput(
                attrs={"class": "form-control", "min": "0", "required": True}
            ),
            "perks": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "Enter perks (comma separated)",
                    "required": False,
                    "data-role": "tagsinput",
                }
            ),
            "description": forms.Textarea(
                attrs={
                    "class": "form-control",
                    "rows": 3,
                    "placeholder": "Enter description (optional)",
                    "required": False,
                }
            ),
            "is_active": forms.CheckboxInput(
                attrs={"class": "form-check-input", "checked": "checked"}
            ),
        }

    def __init__(self, *args, **kwargs):
        """Initialize the form with custom settings."""
        super().__init__(*args, **kwargs)
        self.fields["is_active"].label = "Active"

        # Set initial value for is_active to True for new instances
        if not self.instance.pk:
            self.fields["is_active"].initial = True

    def clean_price(self):
        """Validate that price is a positive number."""
        price = self.cleaned_data.get("price")
        if price and price < 0:
            raise forms.ValidationError("Price cannot be negative.")
        return price

    def clean_pt_sessions(self):
        """Validate that PT sessions is a non-negative integer."""
        pt_sessions = self.cleaned_data.get("pt_sessions")
        if pt_sessions is not None and pt_sessions < 0:
            raise forms.ValidationError("PT sessions cannot be negative.")
        return pt_sessions

    def clean_diet_plans(self):
        """Validate that diet plans is a non-negative integer."""
        diet_plans = self.cleaned_data.get("diet_plans")
        if diet_plans is not None and diet_plans < 0:
            raise forms.ValidationError("Diet plans cannot be negative.")
        return diet_plans

    def clean_name(self):
        """Ensure the name is unique."""
        name = self.cleaned_data.get("name")

        if not name:
            return name

        qs = MembershipPlan.objects.filter(name__iexact=name)

        if self.instance and self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.exists():
            raise forms.ValidationError(
                "A membership plan with this name already exists."
            )

        return name


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
    payment_method = forms.ChoiceField(
        choices=[("", "Select a payment method..."), *PaymentReceipt.Method.choices],
        required=True,
        widget=forms.Select(attrs={"class": "form-select"}),
        error_messages={
            "required": "Please select a payment method.",
            "invalid_choice": "Please select a valid payment method.",
        },
    )

    class Meta(MembershipSaleForm.Meta):
        # Re-use parent model fields; extra fields declared above
        fields = MembershipSaleForm.Meta.fields + [
            "custom_price",
            "custom_duration",
            "custom_pt_sessions",
            "custom_diet_plans",
            # extra non-model fields
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
