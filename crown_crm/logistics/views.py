from uuid import UUID
from django.db.models import Prefetch
from django.http import HttpRequest, HttpResponse, HttpResponseBadRequest
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django_htmx.http import trigger_client_event
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.template.loader import render_to_string

from crown_crm.utils.decorators import organization_slug_required
from crown_crm.utils.types import OrgHttpRequest

from .forms import (
    ServiceCreateForm, ServiceUpdateForm,
    ProductCreateForm, ProductUpdateForm
)
from .models import Service, Product

# Create your views here.

@login_required
@organization_slug_required
def services_view(request: OrgHttpRequest) -> HttpResponse:
    """
    Display the main services view.
    """
    services = Service.objects.filter(organization=request.organization)
    return render(request, "logistics/services.html", {"services": services})

@login_required
@organization_slug_required
def service_detail_view(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Display service details.
    """
    service = get_object_or_404(Service, uuid=uuid, organization=request.organization)
    context = {"service": service}
    return render(request, "logistics/service_detail.html", context)

@login_required
@organization_slug_required
def hx_create_service(request: OrgHttpRequest) -> HttpResponse:
    """
    Create a new Service instance via HTMX.
    """
    if request.method == "POST":
        form = ServiceCreateForm(request.POST)
        if form.is_valid():
            service = form.save(commit=False)
            service.organization = request.organization
            service.save()
            response = render(request, "logistics/forms/service_create.html", {"form": form})
            response = trigger_client_event(
                response,
                "message",
                {"level": "success", "message": "Service created successfully!"}
            )
            response = trigger_client_event(response, "service_create_success")
            return response
        else:
            response = render(request, "logistics/forms/service_create.html", {"form": form})
            response = trigger_client_event(
                response,
                "message",
                {"level": "error", "message": "Failed to create service. Please check the form for errors."}
            )
            return response
    
    form = ServiceCreateForm(initial={"organization": request.organization})
    return render(request, "logistics/forms/service_create.html", {"form": form})

@login_required
@organization_slug_required
def hx_edit_service(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Handle service update via HTMX.
    """
    service = get_object_or_404(Service, uuid=uuid, organization=request.organization)
    
    if request.method == "POST":
        form = ServiceUpdateForm(request.POST, instance=service)
        if form.is_valid():
            form.save()
            response = render(request, "logistics/forms/service_update.html", {"form": form, "service": service})
            response = trigger_client_event(
                response,
                "message",
                {"level": "success", "message": "Service updated successfully!"}
            )
            response = trigger_client_event(response, "service_update_success")
            return response
        else:
            response = render(request, "logistics/forms/service_update.html", {"form": form, "service": service})
            response = trigger_client_event(
                response,
                "message",
                {"level": "error", "message": "Failed to update service. Please check the form for errors."}
            )
            return response
    
    form = ServiceUpdateForm(instance=service)
    return render(request, "logistics/forms/service_update.html", {"form": form, "service": service})

@login_required
@organization_slug_required
def hx_delete_service(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Delete a Service instance via HTMX.

    Args:
        request (OrgHttpRequest): The HTTP request object.
        uuid (UUID): UUID of the service.

    Returns:
        HttpResponse: Rendered updated service list.
    """
    service = get_object_or_404(Service, uuid=uuid, organization=request.organization)
    service.delete()
    response = render(request, "logistics/tables/services.html", {"services": Service.objects.filter(organization=request.organization)})
    response = trigger_client_event(
        response,
        "message",
        {"level": "success", "message": "Service deleted successfully!"}
    )
    return response

@login_required
@organization_slug_required
def hx_services_table(request: OrgHttpRequest) -> HttpResponse:
    """
    Return partial table HTML containing services.
    """
    services = Service.objects.filter(organization=request.organization)
    return render(request, "logistics/tables/services.html", {"services": services})

@login_required
@organization_slug_required
def products_view(request: OrgHttpRequest) -> HttpResponse:
    """
    Display the main products view.
    """
    products = Product.objects.filter(organization=request.organization)
    return render(request, "logistics/products.html", {"products": products})

@login_required
@organization_slug_required
def product_detail_view(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Display product details.
    """
    product = get_object_or_404(Product, uuid=uuid, organization=request.organization)
    context = {"product": product}
    return render(request, "logistics/product_detail.html", context)

@login_required
@organization_slug_required
def hx_create_product(request: OrgHttpRequest) -> HttpResponse:
    """
    Create a new Product instance via HTMX.
    """
    if request.method == "POST":
        form = ProductCreateForm(request.POST)
        if form.is_valid():
            product = form.save(commit=False)
            product.organization = request.organization
            product.save()
            form.save_m2m()  # Save many-to-many relationships
            response = HttpResponse(status=204)
            response = trigger_client_event(
                response,
                "message",
                {"level": "success", "message": "Product created successfully!"}
            )
            response = trigger_client_event(response, "product_create_success")
            return response
        else:
            response = render(request, "logistics/forms/product_form.html", {"form": form})
            response = trigger_client_event(
                response,
                "message",
                {"level": "error", "message": "Failed to create product. Please check the form for errors."}
            )
            return response
    
    form = ProductCreateForm()
    return render(request, "logistics/forms/product_form.html", {"form": form})

@login_required
@organization_slug_required
def hx_edit_product(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Edit an existing Product instance via HTMX.
    """
    product = get_object_or_404(Product, uuid=uuid, organization=request.organization)
    
    if request.method == "POST":
        form = ProductUpdateForm(request.POST, instance=product)
        if form.is_valid():
            form.save()
            response = HttpResponse(status=204)
            response = trigger_client_event(
                response,
                "message",
                {"level": "success", "message": "Product updated successfully!"}
            )
            response = trigger_client_event(response, "product_update_success")
            return response
        else:
            response = render(request, "logistics/forms/product_form.html", {"form": form })
            response = trigger_client_event(
                response,
                "message",
                {"level": "error", "message": "Failed to update product. Please check the form for errors."}
            )
            return response
    
    form = ProductUpdateForm(instance=product)
    return render(request, "logistics/forms/product_form.html", {"form": form })

@login_required
@organization_slug_required
def hx_delete_product(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Delete a Product instance via HTMX.

    Args:
        request (OrgHttpRequest): The HTTP request object.
        uuid (UUID): UUID of the product.

    Returns:
        HttpResponse: Rendered updated product list.
    """
    product = get_object_or_404(Product, uuid=uuid, organization=request.organization)
    product.delete()
    response = HttpResponse()
    response = trigger_client_event(
        response,
        "message",
        {"level": "success", "message": "Product deleted successfully!"}
    )
    return response

@login_required
@organization_slug_required
def hx_products_table(request: OrgHttpRequest) -> HttpResponse:
    """
    Return partial table HTML containing products.
    """
    products = Product.objects.filter(organization=request.organization)
    return render(request, "logistics/tables/products.html", {"products": products})
