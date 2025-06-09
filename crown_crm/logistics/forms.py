from django import forms
from .models import Product, Service, Order, OrderLineItem

class ProductForm(forms.ModelForm):
    class Meta:
        model = Product
        fields = ['organization', 'name', 'description', 'price', 'sku', 'weight', 'dimensions']
        widgets = {
            'description': forms.Textarea(attrs={'rows': 2}),
        }

class ServiceForm(forms.ModelForm):
    class Meta:
        model = Service
        fields = ['organization', 'name', 'description', 'price', 'code', 'duration', 'category']

class OrderForm(forms.ModelForm):
    class Meta:
        model = Order
        fields = ['organization', 'lead', 'status']

class OrderLineItemForm(forms.ModelForm):
    class Meta:
        model = OrderLineItem
        fields = ['order', 'product', 'service', 'quantity', 'price_at_purchase']