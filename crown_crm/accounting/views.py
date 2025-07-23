import logging
import os
from uuid import UUID
from django.db import transaction
from django.db import models
from django.db.models import Q
from django.forms import model_to_dict
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render, redirect
from django.contrib import messages
from django.core.paginator import Paginator
from django.views.decorators.http import require_POST, require_http_methods
from django_htmx.http import trigger_client_event
from django.contrib.auth.decorators import login_required
from django.template.loader import get_template

from weasyprint import HTML

from crown_crm.leads.models import LeadMaster
from crown_crm.utils.decorators import organization_slug_required
from crown_crm.utils.types import OrgHttpRequest

from .forms import (
    CreatePaymentReceiptForm,
    MemberTypeForm, 
    MembershipPlanForm, 
    MembershipSaleCreateForm,
    PaymentReceiptForm,
)
from .models import MemberType, MembershipPlan
from .forms import MembershipSaleForm
from .models import MembershipSale, PaymentReceipt

# Set up logging


@login_required
@organization_slug_required
def search_plan(request: OrgHttpRequest) -> JsonResponse:
    """Return paginated MembershipPlan results for Select2 remote search."""
    query: str = (request.GET.get("q") or "").strip()
    page: int = int(request.GET.get("page", 1))
    per_page: int = 20

    qs = MembershipPlan.objects.filter(
        organization=request.organization, is_active=True
    )
    if query:
        qs = qs.filter(Q(name__icontains=query))

    paginator = Paginator(qs.order_by("name"), per_page)
    page_obj = paginator.get_page(page)

    results = [
        {"id": str(obj.uuid), "text": obj.name}  # type: ignore[attr-defined]
        for obj in page_obj.object_list
    ]

    return JsonResponse({"results": results, "more": page_obj.has_next()})


@login_required
@organization_slug_required
def get_plan_details(request: OrgHttpRequest, uuid: UUID) -> JsonResponse:
    """
    API endpoint to get detailed information about a membership plan.

    Args:
        request: The HTTP request object
        uuid: UUID of the membership plan

    Returns:
        JsonResponse: Plan details in JSON format including:
            - id: Plan UUID
            - name: Plan name
            - price: Plan price
            - pt_sessions: Number of PT sessions
            - diet_plans: Number of diet plans included
            - perks: Additional perks included with the plan
    """
    try:
        plan = get_object_or_404(
            MembershipPlan, uuid=uuid, organization=request.organization, is_active=True
        )

        return JsonResponse(
            {
                "id": str(plan.uuid),
                "name": plan.name,
                "price": str(plan.price),
                "pt_sessions": plan.pt_sessions,
                "diet_plans": plan.diet_plans,
                "perks": plan.perks,
            }
        )
    except Exception as e:
        logger.error(f"Error fetching plan details: {str(e)}")
        return JsonResponse({"error": "Failed to fetch plan details"}, status=404)


# Set up logging
logger = logging.getLogger(__name__)


@login_required
@organization_slug_required
def search_membership_plan_results_view(request: OrgHttpRequest) -> HttpResponse:
    """Search membership plans by name or perks and return results list partial.

    Accepts query param ``membership_plan`` similar to lead search input. Uses
    case-insensitive contains lookup on plan name. Only active plans
    of the current organization are considered.
    """
    query: str = (request.GET.get("membership_query") or "").strip()

    if query == "" or query is None:
        return render(
            request,
            "accounting/partials/membership_plan_search_results.html",
        )

    plans_qs = MembershipPlan.objects.filter(
        organization=request.organization, is_active=True
    )

    plans_qs = plans_qs.filter(Q(name__icontains=query))

    plans = plans_qs.order_by("name")

    context = {"plans": plans}
    return render(
        request,
        "accounting/partials/membership_plan_search_results.html",
        context,
    )


@login_required
@organization_slug_required
def member_types_view(request: OrgHttpRequest) -> HttpResponse:
    """Display the member types list view."""
    member_types = MemberType.objects.filter(organization=request.organization)
    return render(
        request, "accounting/member_types.html", {"member_types": member_types}
    )


@login_required
@organization_slug_required
def membership_plans_view(request: OrgHttpRequest) -> HttpResponse:
    """
    Display the membership plans list view.

    Args:
        request: The HTTP request object

    Returns:
        HttpResponse: Rendered template with membership plans
    """
    try:
        plans = MembershipPlan.objects.filter(
            organization=request.organization, is_active=True
        ).order_by("name")
        context = {"plans": plans, "active_tab": "membership-plans"}
        return render(request, "accounting/membership_plans.html", context)
    except Exception as e:
        logger.error(f"Error loading membership plans: {str(e)}")
        messages.error(request, "An error occurred while loading membership plans.")
        return render(request, "accounting/membership_plans.html", {"plans": []})


@login_required
@organization_slug_required
def membership_plan_detail_view(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Display membership plan details.

    Args:
        request: The HTTP request object
        uuid: UUID of the membership plan to display

    Returns:
        HttpResponse: Rendered template with membership plan details
    """
    plan = get_object_or_404(
        MembershipPlan, uuid=uuid, organization=request.organization
    )

    sales = MembershipSale.objects.filter(
        plan=plan, organization=request.organization
    ).order_by("-created_at")

    context = {"plan": plan, "sales": sales}

    return render(
        request, "accounting/membership_plan_detail.html", context
    )


@login_required
@organization_slug_required
def membership_plan_detail_edit_view(
    request: OrgHttpRequest, uuid: UUID
) -> HttpResponse:
    """
    Handle membership plan editing in the detail view.

    Args:
        request: The HTTP request object
        uuid: UUID of the membership plan to edit

    Returns:
        HttpResponse: Rendered form or redirect on success
    """
    plan = get_object_or_404(
        MembershipPlan, uuid=uuid, organization=request.organization
    )

    if request.method == "POST":
        form = MembershipPlanForm(
            request.POST, instance=plan, prefix=f"plan-{plan.uuid}"
        )

        if form.is_valid():
            try:
                with transaction.atomic():
                    form.save()

                response = render(
                    request,
                    "accounting/partials/membership_plan_detail.html",
                    {"plan": plan},
                )
                response = trigger_client_event(
                    response,
                    "message",
                    {
                        "level": "success",
                        "message": "Membership plan updated successfully!",
                    },
                )
                response = trigger_client_event(
                    response, "membershipplan_update_success"
                )
                return response

            except Exception as e:
                logger.error(f"Error updating membership plan {uuid}: {str(e)}")
                messages.error(
                    request, "An error occurred while updating the membership plan."
                )
    else:
        form = MembershipPlanForm(instance=plan, prefix=f"plan-{plan.uuid}")
    return render(
        request,
        "accounting/forms/membership_plan_form.html",
        {"form": form, "plan": plan},
    )


@login_required
@organization_slug_required
def hx_create_membership_plan(request: OrgHttpRequest) -> HttpResponse:
    """
    Create a new MembershipPlan instance via HTMX.

    Args:
        request: The HTTP request object

    Returns:
        HttpResponse: HTMX response with form or success status
    """
    if request.method == "POST":
        form = MembershipPlanForm(request.POST, prefix="create-plan")

        if form.is_valid():
            try:
                with transaction.atomic():
                    plan = form.save(commit=False)
                    plan.organization = request.organization
                    plan.save()

                response = HttpResponse(status=204)
                response = trigger_client_event(
                    response,
                    "message",
                    {
                        "level": "success",
                        "message": "Membership plan created successfully!",
                    },
                )
                response = trigger_client_event(
                    response, "membershipplan_create_success", model_to_dict(plan)
                )
                return response

            except Exception as e:
                logger.error(f"Error creating membership plan: {str(e)}")
                response = render(
                    request,
                    "accounting/forms/membership_plan_form.html",
                    {"form": form},
                )
                response = trigger_client_event(
                    response,
                    "message",
                    {
                        "level": "error",
                        "message": "An error occurred while creating the membership plan.",
                    },
                )
                return response
        else:
            response = render(
                request,
                "accounting/forms/membership_plan_form.html",
                {"form": form},
            )
            response = trigger_client_event(
                response,
                "message",
                {"level": "error", "message": "Please correct the errors below."},
            )
            return response

    form = MembershipPlanForm(prefix="create-plan")
    return render(request, "accounting/forms/membership_plan_form.html", {"form": form})


@login_required
@organization_slug_required
def hx_edit_membership_plan(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Handle membership plan update via HTMX.

    Args:
        request: The HTTP request object
        uuid: UUID of the membership plan to edit

    Returns:
        HttpResponse: HTMX response with form or success status
    """
    plan = get_object_or_404(
        MembershipPlan, uuid=uuid, organization=request.organization
    )

    if request.method == "POST":
        form = MembershipPlanForm(
            request.POST, instance=plan, prefix=f"edit-{plan.uuid}"
        )

        if form.is_valid():
            try:
                with transaction.atomic():
                    form.save()

                response = HttpResponse(status=204)
                response = trigger_client_event(
                    response,
                    "message",
                    {
                        "level": "success",
                        "message": "Membership plan updated successfully!",
                    },
                )
                response = trigger_client_event(
                    response, "membershipplan_update_success"
                )
                return response

            except Exception as e:
                logger.error(f"Error updating membership plan {uuid}: {str(e)}")
                response = render(
                    request,
                    "accounting/forms/membership_plan_form.html",
                    {"form": form, "plan": plan},
                )
                response = trigger_client_event(
                    response,
                    "message",
                    {
                        "level": "error",
                        "message": "An error occurred while updating the membership plan.",
                    },
                )
                return response
        else:
            response = render(
                request,
                "accounting/forms/membership_plan_form.html",
                {"form": form, "plan": plan},
            )
            response = trigger_client_event(
                response,
                "message",
                {"level": "error", "message": "Please correct the errors below."},
            )
            return response

    form = MembershipPlanForm(instance=plan, prefix=f"edit-{plan.uuid}")

    return render(
        request,
        "accounting/forms/membership_plan_form.html",
        {"form": form, "plan": plan},
    )


@login_required
@organization_slug_required
def hx_delete_membership_plan(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Delete a MembershipPlan instance via HTMX.

    Args:
        request: The HTTP request object
        uuid: UUID of the membership plan to delete

    Returns:
        HttpResponse: Rendered updated membership plans list
    """
    plan = get_object_or_404(
        MembershipPlan, uuid=uuid, organization=request.organization
    )

    try:
        with transaction.atomic():
            if MembershipSale.objects.filter(plan=plan).exists():
                response = HttpResponse()
                response = trigger_client_event(
                    response,
                    "message",
                    {
                        "level": "error",
                        "message": "Cannot delete a plan with associated sales. Please deactivate it instead.",
                    },
                )
                return response

            plan_name = plan.name
            plan.delete()

            response = HttpResponse()
            response = trigger_client_event(
                response,
                "message",
                {
                    "level": "success",
                    "message": f"Membership plan '{plan_name}' deleted successfully!",
                },
            )
            response = trigger_client_event(response, "membershipplan_delete_success")
            return response

    except Exception as e:
        logger.error(f"Error deleting membership plan {uuid}: {str(e)}")
        response = HttpResponse()
        response = trigger_client_event(
            response,
            "message",
            {
                "level": "error",
                "message": "An error occurred while deleting the membership plan.",
            },
        )
        return response


@login_required
@organization_slug_required
def hx_membership_plans_table(request: OrgHttpRequest) -> HttpResponse:
    """
    Return partial table HTML containing membership plans.

    Args:
        request: The HTTP request object

    Returns:
        HttpResponse: Rendered table template with membership plans
    """
    try:
        # Get filter parameters from request
        active_only = request.GET.get("active_only", "false").lower() == "true"
        search = request.GET.get("search", "").strip()

        # Start with base queryset scoped to organization
        plans = MembershipPlan.objects.filter(
            organization=request.organization, is_active=True
        )

        # Apply filters
        if active_only:
            plans = plans.filter(is_active=True)

        if search:
            plans = plans.filter(
                Q(name__icontains=search)
                | Q(description__icontains=search)
                | Q(perks__icontains=search)
            )

        # Order the results
        plans = plans.order_by("name")

        context = {"plans": plans, "search_query": search, "active_only": active_only}

        return render(request, "accounting/tables/membership_plans_table.html", context)

    except Exception as e:
        logger.error(f"Error loading membership plans table: {str(e)}")
        return HttpResponse(
            "<tr><td colspan='7' class='text-center text-danger'>"
            "An error occurred while loading membership plans. Please try again."
            "</td></tr>"
        )


@login_required
@organization_slug_required
def member_type_detail_view(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Display member type details.

    Args:
        request: The HTTP request object
        uuid: UUID of the member type to display

    Returns:
        HttpResponse: Rendered member type detail template
    """
    member_type = get_object_or_404(
        MemberType, uuid=uuid, organization=request.organization
    )
    return render(
        request,
        "accounting/member_type_detail.html",
        {"member_type": member_type, "active_tab": "member-types"},
    )


@login_required
@organization_slug_required
def member_type_detail_edit_view(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Handle member type editing in the detail view.

    Args:
        request: The HTTP request object
        uuid: UUID of the member type to edit

    Returns:
        HttpResponse: Rendered form or redirect on success
    """
    member_type = get_object_or_404(MemberType, uuid=uuid)
    _ = member_type  # Use the variable to avoid unused variable warning

    if request.method == "POST":
        form = MemberTypeForm(request.POST, instance=member_type)
        if form.is_valid():
            form.save()
            response = render(
                request,
                "accounting/partials/member_type_detail.html",
                {"member_type": member_type},
            )
            response = trigger_client_event(
                response,
                "message",
                {"level": "success", "message": "Member type updated successfully!"},
            )
            response = trigger_client_event(response, "membertype_update_success")
            return response
        else:
            response = render(
                request,
                "accounting/forms/member_type_form.html",
                {"form": form, "member_type": member_type},
            )
            response = trigger_client_event(
                response,
                "message",
                {
                    "level": "error",
                    "message": "Failed to update member type. Please check the form for errors.",
                },
            )
            return response

    form = MemberTypeForm(instance=member_type)
    return render(
        request,
        "accounting/forms/member_type_form.html",
        {"form": form, "member_type": member_type},
    )


@login_required
@organization_slug_required
def hx_create_member_type(request: OrgHttpRequest) -> HttpResponse:
    """
    Handle creation of a new MemberType via HTMX.

    Args:
        request: The HTTP request object

    Returns:
        HttpResponse: HTMX response with form or success status
    """
    if request.method == "POST":
        form = MemberTypeForm(request.POST)
        if form.is_valid():
            try:
                form.save()
                response = HttpResponse(status=204)
                response = trigger_client_event(response, "membertype_create_success")
                response = trigger_client_event(
                    response,
                    "message",
                    {
                        "level": "success",
                        "message": "Member type created successfully!",
                    },
                )
                return response
            except Exception as e:
                response = render(
                    request,
                    "accounting/forms/member_type_form.html",
                    {"form": form},
                )
                response = trigger_client_event(
                    response,
                    "message",
                    {
                        "level": "error",
                        "message": f"Error creating member type: {str(e)}",
                    },
                )
                return response
        else:
            response = render(
                request,
                "accounting/forms/member_type_form.html",
                {"form": form},
            )
            response = trigger_client_event(
                response,
                "message",
                {"level": "error", "message": "Please correct the errors below."},
            )
            return response

    form = MemberTypeForm()
    return render(
        request,
        "accounting/forms/member_type_form.html",
        {"form": form},
    )


@login_required
@organization_slug_required
def hx_edit_member_type(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """Handle member type update via HTMX."""
    member_type = get_object_or_404(MemberType, uuid=uuid)

    if request.method == "POST":
        form = MemberTypeForm(request.POST, instance=member_type)
        if form.is_valid():
            form.save()
            response = HttpResponse(status=204)
            response = trigger_client_event(response, "membertype_update_success")
            response = trigger_client_event(
                response,
                "message",
                {"level": "success", "message": "Member type updated successfully!"},
            )
            return response
    else:
        form = MemberTypeForm(instance=member_type)

    return render(
        request,
        "accounting/forms/member_type_form.html",
        {"form": form, "member_type": member_type},
    )


@login_required
@organization_slug_required
def hx_delete_member_type(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Delete a MemberType instance via HTMX.

    Args:
        request: The HTTP request object
        uuid: UUID of the member type to delete

    Returns:
        HttpResponse: HTMX response with delete status
    """
    try:
        member_type = get_object_or_404(MemberType, uuid=uuid)
        member_type.delete()

        response = HttpResponse(status=204)
        response = trigger_client_event(
            response,
            "message",
            {"level": "success", "message": "Member type deleted successfully!"},
        )
        return trigger_client_event(response, "membertype_delete_success")

    except Exception as e:
        response = HttpResponse(status=500)
        return trigger_client_event(
            response,
            "message",
            {"level": "error", "message": f"Error deleting member type: {str(e)}"},
        )


@login_required
@organization_slug_required
def hx_member_types_table(request: OrgHttpRequest) -> HttpResponse:
    """Return partial table HTML containing member types."""
    member_types = MemberType.objects.filter(organization=request.organization)
    return render(
        request,
        "accounting/tables/member_types_table.html",
        {"member_types": member_types},
    )


# -----------------------------------------------------------------------------
# Membership Sale Views (List, Detail, HTMX CRUD)
# -----------------------------------------------------------------------------
@login_required
@organization_slug_required
def sales_view(request: OrgHttpRequest) -> HttpResponse:
    """Display the membership sales list page."""
    sales = MembershipSale.objects.filter(organization=request.organization).select_related("lead", "plan").order_by("-created_at")
    return render(request, "accounting/sales.html", {"sales": sales})


@login_required
@organization_slug_required
def sale_detail_view(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Display a single sale detail page with related payment receipts.

    Args:
        request: The HTTP request object
        uuid: UUID of the membership sale to display

    Returns:
        HttpResponse: Rendered template with sale and receipts data
    """
    # Get the sale with related data in an optimized way
    sale = get_object_or_404(
        MembershipSale.objects.select_related(
            "lead", "plan", "organization"
        ).prefetch_related("receipts"),
        uuid=uuid,
        organization=request.organization,
    )

    # Get related receipts ordered by date (newest first)
    receipts = sale.receipts.order_by("-date")

    context = {
        "sale": sale,
        "receipts": receipts,
    }

    return render(request, "accounting/sale_detail.html", context)


# -----------------------------------------------------------------------------
# HTMX PARTIALS for Membership Sale Form
# -----------------------------------------------------------------------------


@login_required
@organization_slug_required
def hx_fill_plan(request: OrgHttpRequest, uuid: str) -> HttpResponse:
    """Return the plan form partial, blank for new or pre-filled for existing."""
    is_new = not uuid or uuid == "0"

    if is_new:
        plan_form = MembershipPlanForm(prefix="plan")
        plan = None
    else:
        plan = get_object_or_404(
            MembershipPlan, uuid=uuid, organization=request.organization
        )
        plan_form = MembershipPlanForm(instance=plan, prefix=f"plan-{plan.uuid}")

    context = {"plan_form": plan_form, "plan": plan}
    return render(request, "accounting/partials/plan_form_fields.html", context)


@require_POST
@login_required
@organization_slug_required
def hx_create_membership_sale(request: OrgHttpRequest) -> HttpResponse:
    """Create a membership sale (with first payment) via HTMX.

    Expects a POST request carrying all sale & payment fields. On success the
    view emits a ``membership_sale_create_success`` client-side event which can
    be caught in JS to redirect or update the UI.
    """
    form = MembershipSaleCreateForm(request.POST, organization=request.organization)
    if form.is_valid():
        # Persist sale + first receipt
        sale: MembershipSale = form.save_and_create_receipt(request.organization)
        first_receipt = sale.receipts.order_by("date").first()

        response = render(
            request,
            "accounting/partials/payment_receipt.html",
            {"sale": sale, "receipt": first_receipt},
        )
        # Let client decide where to place; also trigger event
        return trigger_client_event(
            response,
            "membership_sale_create_success",
            {
                "message": "Membership sale recorded successfully!",
            },
        )

    # Invalid – render the form partial with errors and preserve selections
    lead_obj = None
    plan_obj = None
    try:
        lead_pk = request.POST.get("lead")
        if lead_pk:
            lead_obj = LeadMaster.objects.filter(pk=lead_pk).first()
        plan_pk = request.POST.get("plan")
        if plan_pk:
            plan_obj = MembershipPlan.objects.filter(pk=plan_pk).first()
    except Exception:
        pass

    context = {
        "form": form,
        "selected_lead": lead_obj,
        "selected_plan": plan_obj,
    }
    return render(request, "accounting/partials/membership_sale_form.html", context)


# --------------------------- HTMX PARTIALS ------------------------------------

@login_required
@organization_slug_required
def hx_sales_table(request: OrgHttpRequest) -> HttpResponse:
    """Return partial table rows for sales list."""
    sales = (
        MembershipSale.objects.filter(organization=request.organization)
        .select_related("lead", "plan")
        .order_by("-created_at")
    )
    return render(request, "accounting/tables/sales_table.html", {"sales": sales})


@login_required
@organization_slug_required
def receipt_list(request: OrgHttpRequest) -> HttpResponse:
    """List all payment receipts for the current organization."""
    receipts = PaymentReceipt.objects.filter(
        organization=request.organization
    ).select_related('sale').order_by('-date')
    
    return render(request, "accounting/receipts.html", {
        "receipts": receipts
    })


@login_required
@organization_slug_required
def hx_receipt_table(request: OrgHttpRequest) -> HttpResponse:
    """Return partial table rows for receipts list."""
    receipts = PaymentReceipt.objects.filter(
        organization=request.organization
    ).select_related('sale').order_by('-date', '-closing_balance')
    return render(request, "accounting/tables/receipts_table.html", {"receipts": receipts})


@login_required
@organization_slug_required
def receipt_detail(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """Display details of a specific receipt."""
    receipt = get_object_or_404(
        PaymentReceipt,
        uuid=uuid,
        organization=request.organization
    )
    return render(request, "accounting/receipt_detail.html", {
        "receipt": receipt
    })

@login_required
@organization_slug_required
def hx_create_payment_receipt(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Pay the balance amount remaining for the sale.
    """

    receipt = get_object_or_404(
        PaymentReceipt,
        uuid=uuid,
        organization=request.organization
    )

    sale = receipt.sale
    sale_balance_amount = sale.balance_amount

    if sale_balance_amount <= 0:
        response = HttpResponse(status=204)
        return trigger_client_event(
            response,
            "message",
            {
                "level": "warning",
                "message": "The membership sale is already fully paid.",
            },
        )

    if request.method == "POST":
        form = CreatePaymentReceiptForm(request.POST)
        if form.is_valid():
            receipt = form.save(commit=False)
            receipt.organization = request.organization
            receipt.save()
            response = HttpResponse(status=204)
            response = trigger_client_event(
                response,
                "message",
                {
                    "level": "success",
                    "message": "Payment processed successfully!",
                },
            )
            response = trigger_client_event(
                response,
                "payment_receipt_create_success",
            )
            return response
        else:
            response = render(request, "accounting/forms/receipt_form.html", {
                "form": form,
                "sale": sale,
            })
            response = trigger_client_event(
                response,
                "message",
                {
                    "level": "error",
                    "message": "The membership sale is already fully paid.",
                },
            )
            return response

    form = CreatePaymentReceiptForm(
        initial={
        "sale": sale, 
        'balance_amount': sale_balance_amount,
        'amount': receipt.closing_balance
    })
    return render(request, "accounting/forms/receipt_form.html", {
        "form": form,
        "sale": sale,
    })


@require_http_methods(["DELETE"])
@login_required
@organization_slug_required
def hx_delete_receipt(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """HTMX endpoint to delete a receipt."""
    receipt = get_object_or_404(
        PaymentReceipt,
        uuid=uuid,
        organization=request.organization
    )
    
    try:
        receipt.delete()
        response = HttpResponse(status=204)
        response = trigger_client_event(
            response, 
            "payment_receipt_delete_success"
        )
        return trigger_client_event(
            response,
            "message",
            {"level": "success", "message": "Receipt deleted successfully!"}
        )
    except Exception as e:
        logger.error(f"Error deleting receipt {uuid}: {str(e)}")
        response = HttpResponse(status=500)
        return trigger_client_event(
            response,
            "message",
            {"level": "error", "message": "Error deleting receipt."}
        )


@login_required
@organization_slug_required
def hx_sale_detail(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """Return partial detail card for a sale (used on main page and modal)."""
    sale = get_object_or_404(
        MembershipSale,
        uuid=uuid,
        organization=request.organization,
    )
    return render(request, "accounting/partials/sale_detail.html", {"sale": sale})


@login_required
@organization_slug_required
def sale_create_view(request: OrgHttpRequest) -> HttpResponse:
    """Create a new sale (full page)."""
    if request.method == "POST":
        form = MembershipSaleForm(request.POST, organization=request.organization)
        if form.is_valid():
            sale = form.save(commit=False)
            sale.organization = request.organization
            sale.save()
            messages.success(request, "Membership sale created successfully!")
            return redirect("sales", slug=request.organization.slug)
    else:
        form = MembershipSaleForm(organization=request.organization)

    return render(request, "accounting/forms/membership_sale_form.html", {"form": form})


@login_required
@organization_slug_required
def hx_sale_update(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """Update an existing sale via HTMX modal."""
    sale = get_object_or_404(
        MembershipSale,
        uuid=uuid,
        organization=request.organization,
    )

    if request.method == "POST":
        form = MembershipSaleForm(
            request.POST, instance=sale, organization=request.organization
        )
        if form.is_valid():
            form.save()
            response = HttpResponse(status=204)
            response = trigger_client_event(response, "sale_update_success")
            return trigger_client_event(
                response,
                "message",
                {"level": "success", "message": "Sale updated."},
            )
        response = render(
            request, "accounting/forms/sale_form.html", {"form": form, "sale": sale}
        )
        return trigger_client_event(
            response,
            "message",
            {"level": "error", "message": "Please correct the errors below."},
        )

    form = MembershipSaleForm(instance=sale, organization=request.organization)
    return render(
        request, "accounting/forms/sale_form.html", {"form": form, "sale": sale}
    )


@login_required
@organization_slug_required
def hx_sale_delete(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """Delete a sale via HTMX."""
    sale = get_object_or_404(
        MembershipSale,
        uuid=uuid,
        organization=request.organization,
    )
    if request.method == "POST":
        sale.delete()
        response = HttpResponse(status=204)
        response = trigger_client_event(response, "sale_delete_success")
        return trigger_client_event(
            response,
            "message",
            {"level": "success", "message": "Sale deleted."},
        )

    # Render simple confirmation (could be a bootstrap modal body)
    return render(
        request,
        "accounting/partials/confirm_delete.html",
        {
            "object": sale,
            "action_url": request.path,
            "title": "Delete Membership Sale",
        },
    )


@login_required
@organization_slug_required
@require_http_methods(["GET", "POST"])
def hx_edit_receipt(
    request: OrgHttpRequest, 
    uuid: UUID
) -> HttpResponse:
    """
    Handle editing a payment receipt via HTMX.
    """
    receipt = get_object_or_404(
        PaymentReceipt,
        uuid=uuid,
        organization=request.organization
    )

    if request.method == "POST":
        form = PaymentReceiptForm(request.POST, instance=receipt)
        if form.is_valid():
            form.save()
            response = HttpResponse(status=204)
            response = trigger_client_event(
                response,
                "message",
                {
                    "level": "success", 
                    "message": _("Payment receipt updated successfully!")
                },
            )
            response = trigger_client_event(
                response, 
                "payment_receipt_update_success"
            )
            return response
        else:
            response = render(
                request, 
                "accounting/forms/receipt_form.html", 
                {"form": form}
            )
            response = trigger_client_event(
                response,
                "message",
                {
                    "level": "error",
                    "message": _("Failed to update payment receipt. Please check the form for errors."),
                },
            )
            return response

    form = PaymentReceiptForm(instance=receipt)
    return render(
        request, 
        "accounting/forms/receipt_form.html", 
        {"form": form}
    )

@login_required
@organization_slug_required
def receipt_pdf(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    receipt = get_object_or_404(
        PaymentReceipt,
        uuid=uuid,
        organization=request.organization
    )
    terms_list = [
        "NO Refund / Membership Cancellation",
        "Please read, understand and comply with these rules",
        "Right of enrollment and entry is reserved by management",
        "Transfer fees of 1000/- will be charged under conditions",
        "Clients may not participate in workout independently or under personal trainer unless authorized",
        "Clients are required to carry and change their footwear outside in shoe closet."
    ]

    organization = request.organization
    sale = receipt.sale
    lead = receipt.sale.lead

    context = {
        'terms_list': terms_list,
        'organization': organization,
        'receipt': receipt,
        'sale': sale,
        'lead': lead,
        "logo_url": organization.logo.url
    }

    file_name = f"receipt-{lead.full_name}-{receipt.receipt_number}"

    template = get_template('pdfs/receipt.html')
    html = template.render(context)
    pdf = HTML(string=html, base_url=request.build_absolute_uri()).write_pdf()
    response = HttpResponse(pdf, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment;filename="{file_name}.pdf"'
    response["Access-Control-Expose-Headers"] = "Content-Disposition"
    return response