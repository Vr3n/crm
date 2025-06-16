from django import forms
from django.utils.translation import gettext_lazy as _
from django.core.exceptions import ValidationError

from .models import Service, Product, Order, OrderLineItem, CategorySP

class ServiceCreateForm(forms.ModelForm):
    """Form for creating new services."""
    
    class Meta:
        model = Service
        fields = [
            'name',
            'code',
            'description',
            'price',
            'category'
        ]
        widgets = {
            'organization': forms.HiddenInput(),
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'code': forms.TextInput(attrs={'class': 'form-control'}),
            'description': forms.Textarea(attrs={'class': 'form-control', 'rows': 3}),
            'price': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01'}),
            'category': forms.SelectMultiple(attrs={'class': 'form-control select2'})
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['code'].required = False
        self.fields['description'].required = False
        self.fields['category'].required = False

    def clean_price(self):
        """Validate that price is positive."""
        price = self.cleaned_data.get('price')
        if price and price <= 0:
            raise ValidationError("Price must be greater than zero.")
        return price

    def clean_code(self):
        """Validate that code is unique within the organization."""
        code = self.cleaned_data.get('code')
        if code and Service.objects.filter(
            organization=self.cleaned_data.get('organization'),
            code=code
        ).exists():
            raise ValidationError("A service with this code already exists in your organization.")
        return code

class ServiceUpdateForm(ServiceCreateForm):
    """Form for updating existing services."""
    
    class Meta(ServiceCreateForm.Meta):
        fields = ServiceCreateForm.Meta.fields + ['organization']
        widgets = {
            **ServiceCreateForm.Meta.widgets,
            'organization': forms.HiddenInput()
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['code'].required = False
        self.fields['description'].required = False
        self.fields['category'].required = False

class ProductBaseForm(forms.ModelForm):
    """Base form for product operations."""
    
    class Meta:
        model = Product
        fields = [
            'name',
            'description',
            'price',
            'sku',
            'hsn',
            'category'
        ]
        widgets = {
            'organization': forms.HiddenInput(),
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'description': forms.Textarea(attrs={'class': 'form-control', 'rows': 3}),
            'price': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01'}),
            'sku': forms.TextInput(attrs={'class': 'form-control'}),
            'hsn': forms.TextInput(attrs={'class': 'form-control'}),
            'category': forms.SelectMultiple(attrs={'class': 'form-control select2'})
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['description'].required = False
        self.fields['hsn'].required = False
        self.fields['category'].required = False

    def clean_price(self):
        """Validate that price is positive."""
        price = self.cleaned_data.get('price')
        if price and price <= 0:
            raise ValidationError("Price must be greater than zero.")
        return price

    # def clean_sku(self):
    #     """Validate that SKU is unique within the organization."""
    #     sku = self.cleaned_data.get('sku')
    #     if sku and Product.objects.filter(
    #         organization=self.instance.organization if self.instance.organization else self.initial.get('organization'),
    #         sku=sku
    #     ).exclude(pk=self.instance.pk if self.instance else None).exists():
    #         raise ValidationError("A product with this SKU already exists in your organization.")
    #     return sku


class ProductCreateForm(ProductBaseForm):
    """Form for creating new products."""
    ...


class ProductUpdateForm(ProductBaseForm):
    """Form for updating existing products."""
    ...

class OrderForm(forms.ModelForm):
    """Form for creating orders."""
    
    class Meta:
        model = Order
        fields = ['organization', 'lead', 'status']
        widgets = {
            'lead': forms.Select(attrs={'class': 'form-control'})
        }

class OrderLineItemForm(forms.ModelForm):
    """Form for creating order line items."""
    
    class Meta:
        model = OrderLineItem
        fields = ['order', 'product', 'service', 'quantity', 'price']
        widgets = {
            'organization': forms.HiddenInput(),
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'description': forms.Textarea(attrs={'class': 'form-control', 'rows': 2}),
            'price': forms.NumberInput(attrs={'class': 'form-control'}),
            'category': forms.SelectMultiple(attrs={'class': 'form-control'}),
            'code': forms.TextInput(attrs={'class': 'form-control'}),
        }