from django import forms
from django.utils.translation import gettext_lazy as _
from django.core.validators import RegexValidator
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Column, Layout, Row

from crm.organizations.models import (
    OrganizationEmailMaster, OrganizationMaster,
    OrganizationMobileNumberMaster
)


class OrganizationCreateForm(forms.ModelForm):
    logo = forms.ImageField(
        label=_("Logo"),
        required=False,
        widget=forms.FileInput
    )
    mobile_number = forms.CharField(
        min_length=10,
        validators=[
            RegexValidator(
                r'((\+*)((0[ -]*)*|((91 )*))((\d{12})+|(\d{10})+))|\d{5}([- ]*)\d{6}',
                message="Please enter correct mobile number!",
            )
        ],
        required=False
    )
    email = forms.EmailField(required=False)

    class Meta:
        model = OrganizationMaster
        fields = ('name', 'logo', 'description', 'mobile_number', 'email')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.helper = FormHelper()
        self.helper.form_tag = False
        self.helper.layout = Layout(
            Row(
                Column("name", css_class="form-group col-sm-6 mb-0"),
                Column("logo", css_class="form-group col-sm-6 mb-0"),
            ),
            Row(
                Column("description", css_class="col-md-12 mb-0")
            ),
            Row(
                Column("mobile_number", css_class="form-group col-sm-6 mb-0"),
                Column("email", css_class="form-group col-sm-6 mb-0"),
            ),
        )
        self.fields['name'].required = True


class OrganizationMobileForm(forms.ModelForm):
    mobile_number = forms.CharField(
        min_length=10,
        validators=[
            RegexValidator(
                r'((\+*)((0[ -]*)*|((91 )*))((\d{12})+|(\d{10})+))|\d{5}([- ]*)\d{6}',
                message="Please enter correct mobile number!",
            )
        ]
    )

    class Meta:
        model = OrganizationMobileNumberMaster
        fields = ("mobile_number",)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.helper = FormHelper()
        self.helper.layout = Layout(
            Row(
                Column("mobile_number", css_class="form-group col-sm-6 mb-0"),
            )
        )
        self.fields['mobile_number'].required = True


class OrganizationEmailForm(forms.ModelForm):
    class Meta:
        model = OrganizationEmailMaster
        fields = ("email",)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.helper = FormHelper()
        self.helper.layout = Layout(
            Row(
                Column("email", css_class="form-group col-sm-6 mb-0"),
            )
        )
        self.fields['email'].required = False
