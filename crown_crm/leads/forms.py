from django import forms
from django.utils.translation import gettext_lazy as _

# from crispy_forms.helper import FormHelper
# from crispy_forms.layout import Layout, Row, Column


from .models import (LeadAddressMaster, LeadEmailAddressMaster,
                     LeadMaster, LeadMobileNumberMaster,)


class LeadCreateForm(forms.ModelForm):

    source = forms.CharField(
        label=_("Source"),
        required=False,
        widget=forms.TextInput(attrs={'class': 'form-control'})
    )

    class Meta:
        model = LeadMaster
        fields = ['organization', 'first_name',
                  'middle_name', 'last_name', 'source',]
        widgets = {
            'organization': forms.HiddenInput(),
            'first_name': forms.TextInput(attrs={'class': 'form-control'}),
            'middle_name': forms.TextInput(attrs={'class': 'form-control'}),
            'last_name': forms.TextInput(attrs={'class': 'form-control'}),
            'source': forms.TextInput(attrs={ 'class': 'form-control' }),
        }

    # def __init__(self, *args, **kwargs):
    #     super().__init__(*args, **kwargs)

    #     self.helper = FormHelper()
    #     self.helper.form_tag = False

    #     self.helper.layout = Layout(
    #         Row(
    #             Column('first_name', css_class='form-group col-xs-12 col-sm-4 mb-0'),
    #             Column('middle_name',
    #                    css_class='form-group col-xs-12 col-sm-4 mb-0'),
    #             Column('last_name', css_class='form-group col-xs-12 col-sm-4 mb-0'),
    #         ),
    #         Row(
    #             Column("source", css_class="form-group col-sm-12 mb-0")
    #         )
    #     )
    #     self.fields['first_name'].required = True
    #     self.fields['last_name'].required = True


class LeadMobileNumberForm(forms.ModelForm):
    class Meta:
        model = LeadMobileNumberMaster
        fields = ['mobile_number']
        widgets = {
            'mobile_number': forms.TextInput(attrs={
                'class': 'form-control',
            })
        }


class LeadEmailForm(forms.ModelForm):
    class Meta:
        model = LeadEmailAddressMaster
        fields = ['email']
        widgets = {
            'email': forms.EmailInput(attrs={
                'class': 'form-control',
                'placeholder': 'Email Address'
            })
        }


class LeadAddressForm(forms.ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields:
            self.fields[field].required = False
            self.fields[field].widget.attrs.update({
                'class': 'form-control',
            })

    class Meta:
        model = LeadAddressMaster
        fields = [
            'flat_building', 'area', 'landmark', 'street',
            'state', 'city', 'pincode'
        ]
        widgets = {
            'flat_building': forms.TextInput(
                attrs={'class': 'form-control'}),
            'landmark': forms.TextInput(
                attrs={'class': 'form-control'}),
            'street': forms.TextInput(
                attrs={'class': 'form-control'}),
            'area': forms.TextInput(
                attrs={'class': 'form-control'}),
            'state': forms.TextInput(
                attrs={'class': 'form-control'}),
            'city': forms.TextInput(
                attrs={'class': 'form-control'}),
            'pincode': forms.TextInput(
                attrs={'class': 'form-control'}),
        }


class LeadMobileNumberTableForm(forms.ModelForm):
    class Meta:
        model = LeadMobileNumberMaster
        fields = [
            'mobile_number'
        ]
        widgets = {
            'mobile_number': forms.TextInput(
                attrs={'class': 'form-control',
                       'placeholder': 'your 10 digit mobile number.'}
            )
        }


class LeadEmailAddressTableForm(forms.ModelForm):
    class Meta:
        model = LeadEmailAddressMaster
        fields = [
            'email'
        ]
        widgets = {
            'email': forms.EmailInput(
                attrs={'class': 'form-control',
                       'placeholder': 'Your email address.'}
            )
        }
