from django import forms
from django.forms import inlineformset_factory
from .models import (ClientMaster, ClientMobileNumberMaster,
                     ClientEmailMaster, ClientAddressMaster)


class ClientComprehensiveForm(forms.ModelForm):
    class Meta:
        model = ClientMaster
        fields = ['first_name', 'middle_name', 'last_name', 'gender']
        widgets = {
            'first_name': forms.TextInput(attrs={'class': 'form-control'}),
            'middle_name': forms.TextInput(attrs={'class': 'form-control'}),
            'last_name': forms.TextInput(attrs={'class': 'form-control'}),
            'gender': forms.Select(attrs={'class': 'form-control'}),
        }


class ClientMobileNumberForm(forms.ModelForm):
    class Meta:
        model = ClientMobileNumberMaster
        fields = ['mobile_number']
        widgets = {
            'mobile_number': forms.TextInput(attrs={'class': 'form-control'}),
        }


class ClientEmailForm(forms.ModelForm):
    class Meta:
        model = ClientEmailMaster
        fields = ['email']
        widgets = {
            'email': forms.EmailInput(attrs={'class': 'form-control'}),
        }


class ClientAddressForm(forms.ModelForm):
    class Meta:
        model = ClientAddressMaster
        fields = ['flat_building', 'landmark', 'area',
                  'street', 'city', 'state', 'pincode']
        widgets = {
            'flat_building': forms.TextInput(attrs={'class': 'form-control'}),
            'landmark': forms.TextInput(attrs={'class': 'form-control'}),
            'area': forms.TextInput(attrs={'class': 'form-control'}),
            'street': forms.TextInput(attrs={'class': 'form-control'}),
            'city': forms.TextInput(attrs={'class': 'form-control'}),
            'state': forms.TextInput(attrs={'class': 'form-control'}),
            'pincode': forms.TextInput(attrs={'class': 'form-control'}),
        }


# Create formsets for mobile numbers and emails
ClientMobileNumberFormSet = inlineformset_factory(
    ClientMaster,
    ClientMobileNumberMaster,
    form=ClientMobileNumberForm,
    extra=1, can_delete=True
)

ClientEmailFormSet = inlineformset_factory(
    ClientMaster,
    ClientEmailMaster, form=ClientEmailForm, extra=1, can_delete=True
)


class ClientMobileNumberTableForm(forms.ModelForm):
    class Meta:
        model = ClientMobileNumberMaster
        fields = ['client', 'mobile_number']
        widgets = {
            'client': forms.HiddenInput(),
            'mobile_number': forms.TextInput(
                attrs={'class': 'form-control',
                       'placeholder': 'Enter mobile number'})
        }


class ClientEmailAddressTableForm(forms.ModelForm):
    class Meta:
        model = ClientEmailMaster
        fields = ['client', 'email']
        widgets = {
            'client': forms.HiddenInput(),
            'email': forms.EmailInput(
                attrs={'class': 'form-control',
                       'placeholder': 'Enter email address'})
        }
