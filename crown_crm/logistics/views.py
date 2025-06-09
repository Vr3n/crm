from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from .forms import ProductForm, ServiceForm, OrderForm, OrderLineItemForm

from django_htmx.http import trigger_client_event

from crown_crm.utils.decorators import organization_slug_required

# Create your views here.

@login_required
@organization_slug_required
def hx_create_product(request):
    form_template = "inventory/forms/product_form.html"

    if request.method == "POST":
        form = ProductForm(request.POST)
        if form.is_valid():
            form.save()
            response = render(request, form_template)
            response = trigger_client_event(response, "message", {
                'level': 'success',
                'message': 'Product saved successfully!'
            })
            response = trigger_client_event(response, "product_create_success")
            return response
        else:
            response = render(request, form_template, {"form": form})
            return trigger_client_event(response, "message", {
                'level': 'error',
                'message': 'Error saving product.'
            })
    else:
        form = ProductForm()
        return render(request, form_template, {"form": form})


@login_required
@organization_slug_required
def hx_create_service(request):
    form_template = "inventory/forms/service_form.html"

    if request.method == "POST":
        form = ServiceForm(request.POST)
        if form.is_valid():
            form.save()
            response = render(request, form_template)
            response = trigger_client_event(response, "message", {
                'level': 'success',
                'message': 'Service saved successfully!'
            })
            response = trigger_client_event(response, "service_create_success")
            return response
        else:
            response = render(request, form_template, {"form": form})
            return trigger_client_event(response, "message", {
                'level': 'error',
                'message': 'Error saving service.'
            })
    else:
        form = ServiceForm()
        return render(request, form_template, {"form": form})



@login_required
@organization_slug_required
def hx_create_order(request):
    form_template = "orders/forms/order_form.html"

    if request.method == "POST":
        form = OrderForm(request.POST)
        if form.is_valid():
            form.save()
            response = render(request, form_template)
            response = trigger_client_event(response, "message", {
                'level': 'success',
                'message': 'Order saved successfully!'
            })
            response = trigger_client_event(response, "order_create_success")
            return response
        else:
            response = render(request, form_template, {"form": form})
            return trigger_client_event(response, "message", {
                'level': 'error',
                'message': 'Error saving order.'
            })
    else:
        form = OrderForm()
        return render(request, form_template, {"form": form})