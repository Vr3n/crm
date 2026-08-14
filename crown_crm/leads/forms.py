import re

from django import forms
from django.core.validators import RegexValidator
from django.utils.translation import gettext_lazy as _

from .models import (
    LeadAddressMaster,
    LeadEmailAddressMaster,
    LeadMaster,
    LeadMobileNumberMaster,
)


class LeadCreateForm(forms.ModelForm):
    source = forms.CharField(
        label=_("Source"),
        required=False,
        widget=forms.TextInput(attrs={"class": "form-control"}),
    )

    class Meta:
        model = LeadMaster
        fields = [
            "organization",
            "first_name",
            "middle_name",
            "last_name",
            "source",
        ]
        widgets = {
            "organization": forms.HiddenInput(),
            "first_name": forms.TextInput(attrs={"class": "form-control"}),
            "middle_name": forms.TextInput(attrs={"class": "form-control"}),
            "last_name": forms.TextInput(attrs={"class": "form-control"}),
            "source": forms.TextInput(attrs={"class": "form-control"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["first_name"].required = True
        self.fields["last_name"].required = True


class LeadMobileNumberForm(forms.ModelForm):
    mobile_number = forms.CharField(
        label=_("Mobile Number"),
        max_length=10,
        min_length=10,
        required=False,
        validators=[
            RegexValidator(
                regex=r'^\d{10}$',
                message="Enter a valid 10-digit mobile number (digits only)",
            )
        ],
        widget=forms.TextInput(
            attrs={
                "class": "form-control",
                "inputmode": "numeric",
                "maxlength": "10",
                "pattern": r"\d{10}",
                "placeholder": "10-digit mobile number",
            }
        ),
    )

    class Meta:
        model = LeadMobileNumberMaster
        fields = ["mobile_number"]


class LeadEmailForm(forms.ModelForm):
    email = forms.EmailField(
        label=_("Email Address"),
        required=False,
        widget=forms.EmailInput(
            attrs={
                "class": "form-control",
                "placeholder": "email@example.com",
            }
        ),
    )

    class Meta:
        model = LeadEmailAddressMaster
        fields = ["email"]


class LeadAddressForm(forms.ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields:
            self.fields[field].required = False
            self.fields[field].widget.attrs.update(
                {
                    "class": "form-control",
                }
            )

    class Meta:
        model = LeadAddressMaster
        fields = [
            "flat_building",
            "area",
            "landmark",
            "street",
            "state",
            "city",
            "pincode",
        ]
        widgets = {
            "flat_building": forms.TextInput(attrs={"class": "form-control"}),
            "landmark": forms.TextInput(attrs={"class": "form-control"}),
            "street": forms.TextInput(attrs={"class": "form-control"}),
            "area": forms.TextInput(attrs={"class": "form-control"}),
            "state": forms.TextInput(attrs={"class": "form-control"}),
            "city": forms.TextInput(attrs={"class": "form-control"}),
            "pincode": forms.TextInput(attrs={"class": "form-control"}),
        }


class LeadMobileNumberTableForm(forms.ModelForm):
    mobile_number = forms.CharField(
        label=_("Mobile Number"),
        max_length=10,
        min_length=10,
        validators=[
            RegexValidator(
                regex=r'^\d{10}$',
                message="Enter a valid 10-digit mobile number (digits only)",
            )
        ],
        widget=forms.TextInput(
            attrs={
                "class": "form-control",
                "inputmode": "numeric",
                "maxlength": "10",
                "pattern": r"\d{10}",
                "placeholder": "10-digit mobile number",
            }
        ),
    )

    class Meta:
        model = LeadMobileNumberMaster
        fields = ["mobile_number"]


class LeadEmailAddressTableForm(forms.ModelForm):
    email = forms.EmailField(
        label=_("Email Address"),
        widget=forms.EmailInput(
            attrs={
                "class": "form-control",
                "placeholder": "email@example.com",
            }
        ),
    )

    class Meta:
        model = LeadEmailAddressMaster
        fields = ["email"]
