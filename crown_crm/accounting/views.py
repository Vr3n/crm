import logging
import os
from datetime import timedelta
from uuid import UUID
from django.db import transaction
from django.db import models
from django.utils import timezone
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, render, redirect
from django.contrib import messages
from django.views.decorators.http import require_POST, require_http_methods
from django.views import View
from django.utils.decorators import method_decorator
from django_htmx.http import trigger_client_event
from django.contrib.auth.decorators import login_required
from django_tables2 import RequestConfig
from django.template.loader import get_template
from django.template.response import TemplateResponse

from weasyprint import HTML

from crown_crm.core.mixins import HtmxFormMixin, HtmxDeleteMixin
from crown_crm.leads.models import LeadMaster
from crown_crm.utils.decorators import organization_slug_required
from crown_crm.utils.types import OrgHttpRequest

from .forms import (
    CreatePaymentReceiptForm,
    MembershipSaleCreateForm,
    PaymentReceiptForm,
)

from .models import MembershipSale, PaymentReceipt
from .tables import MembershipSaleTable, PaymentReceiptTable, MembershipExpirationTable


# -----------------------------------------------------------------------------
# Membership Sale Views (List, Detail, HTMX CRUD)
# -----------------------------------------------------------------------------
@login_required
@organization_slug_required
def sales_view(request: OrgHttpRequest) -> HttpResponse:
    """Display the membership sales list page."""
    sales = (
        MembershipSale.objects.filter(organization=request.organization)
        .select_related("lead", "organization")
        .order_by("-created_at")
    )
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
            "lead", "organization"
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
            "membership-sale-created",
            {
                "message": "Membership sale recorded successfully!",
            },
        )

    # Invalid – render the form partial with errors and preserve selections
    lead_id = request.POST.get("lead")
    selected_lead = None
    if lead_id:
        selected_lead = LeadMaster.objects.filter(
            pk=lead_id, organization=request.organization
        ).first()

    return render(
        request,
        "accounting/partials/membership_sale_form.html",
        {"form": form, "selected_lead": selected_lead},
    )


# --------------------------- HTMX PARTIALS ------------------------------------


@login_required
@organization_slug_required
def hx_sales_table(request: OrgHttpRequest) -> HttpResponse:
    """
    HTMX endpoint: returns paginated sales table.
    """
    VALID_PER_PAGE = {5, 10, 25, 50, 100}

    per_page = int(request.GET.get("per_page", 5))
    if per_page not in VALID_PER_PAGE:
        per_page = 5

    sales = (
        MembershipSale.objects.filter(organization=request.organization)
        .select_related("lead", "organization")
        .prefetch_related("receipts")
        .order_by("-created_at")
    )

    table = MembershipSaleTable(sales, request=request)
    RequestConfig(request, paginate={"per_page": per_page}).configure(table)

    context = {
        "table": table,
        "htmx_url": request.path,
        "htmx_target": "#sales-table",
        "per_page_options": [5, 10, 25, 50, 100],
        "per_page": per_page,
    }

    return render(request, "tables/hx-bootstrap4.html", context)


MEMBERSHIP_EXPIRATION_DAYS = 60


@login_required
@organization_slug_required
def hx_membership_expirations_table(request: OrgHttpRequest) -> HttpResponse:
    """
    HTMX endpoint: returns paginated upcoming membership expirations table.
    """
    VALID_PER_PAGE = {5, 10}

    per_page = int(request.GET.get("per_page", 5))
    if per_page not in VALID_PER_PAGE:
        per_page = 5

    cutoff_date = timezone.now().date() + timedelta(days=MEMBERSHIP_EXPIRATION_DAYS)

    memberships = (
        MembershipSale.objects.filter(
            organization=request.organization,
            membership_end_date__gte=timezone.now().date(),
            membership_end_date__lte=cutoff_date,
        )
        .select_related("lead")
        .order_by("membership_end_date")
    )

    table = MembershipExpirationTable(memberships, request=request)
    RequestConfig(request, paginate={"per_page": per_page}).configure(table)

    context = {
        "table": table,
        "per_page_options": [5, 10],
        "per_page": per_page,
        "hx_target": "#membership-expirations-table",
    }

    return render(request, "tables/hx-bootstrap4.html", context)


@login_required
@organization_slug_required
def hx_recent_membership_sales_table(request: OrgHttpRequest) -> HttpResponse:
    """
    HTMX endpoint: returns paginated recent membership sales table.
    """
    VALID_PER_PAGE = {5, 10}

    per_page = int(request.GET.get("per_page", 5))
    if per_page not in VALID_PER_PAGE:
        per_page = 5

    sales = (
        MembershipSale.objects.filter(organization=request.organization)
        .select_related("lead")
        .order_by("-created_at")
    )

    from .tables import RecentMembershipSalesTable
    table = RecentMembershipSalesTable(sales, request=request)
    RequestConfig(request, paginate={"per_page": per_page}).configure(table)

    context = {
        "table": table,
        "per_page_options": [5, 10],
        "per_page": per_page,
        "hx_target": "#recent-membership-sales-table",
    }

    return render(request, "tables/hx-bootstrap4.html", context)


@login_required
@organization_slug_required
def hx_outstanding_payments_table(request: OrgHttpRequest) -> HttpResponse:
    """
    HTMX endpoint: returns paginated outstanding payments table.
    Sorted by membership start date (ascending).
    """
    from django.db.models import Sum, F, Value, DecimalField, OuterRef
    from django.db.models.functions import Coalesce, Cast

    VALID_PER_PAGE = {5, 10}

    per_page = int(request.GET.get("per_page", 5))
    if per_page not in VALID_PER_PAGE:
        per_page = 5

    total_paid_subquery = PaymentReceipt.objects.filter(
        sale_id=OuterRef('pk')
    ).values('sale_id').annotate(
        total=Sum('amount')
    ).values('total')

    memberships = (
        MembershipSale.objects.filter(
            organization=request.organization,
            price__isnull=False,
        )
        .select_related("lead")
        .annotate(
            total_paid=Coalesce(
                Cast(total_paid_subquery, DecimalField(max_digits=10, decimal_places=2)),
                Value(0, output_field=DecimalField(max_digits=10, decimal_places=2))
            ),
            balance=F('price') - Coalesce(
                Cast(total_paid_subquery, DecimalField(max_digits=10, decimal_places=2)),
                Value(0, output_field=DecimalField(max_digits=10, decimal_places=2))
            )
        )
        .exclude(balance=0)
        .order_by("membership_start_date")
    )

    from .tables import OutstandingPaymentsTable
    table = OutstandingPaymentsTable(memberships, request=request)
    RequestConfig(request, paginate={"per_page": per_page}).configure(table)

    context = {
        "table": table,
        "per_page_options": [5, 10],
        "per_page": per_page,
        "hx_target": "#outstanding-payments-table",
    }

    return render(request, "tables/hx-bootstrap4.html", context)


@login_required
@organization_slug_required
def hx_membership_detail_drawer(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    HTMX endpoint: returns membership detail for drawer/offcanvas.
    """
    membership = get_object_or_404(
        MembershipSale.objects.select_related("lead").prefetch_related("lead__mobile_numbers", "lead__emails", "receipts"),
        uuid=uuid,
        organization=request.organization,
    )

    return render(request, "accounting/partials/membership_detail_drawer.html", {"membership": membership})


@login_required
@organization_slug_required
def receipt_list(request: OrgHttpRequest) -> HttpResponse:
    """List all payment receipts for the current organization."""
    receipts = (
        PaymentReceipt.objects.filter(organization=request.organization)
        .select_related("sale")
        .order_by("-date")
    )

    return render(request, "accounting/receipts.html", {"receipts": receipts})


@login_required
@organization_slug_required
def hx_receipt_table(request: OrgHttpRequest) -> HttpResponse:
    """
    HTMX endpoint: returns paginated receipts table.
    """
    VALID_PER_PAGE = {5, 10, 25, 50, 100}

    per_page = int(request.GET.get("per_page", 5))
    if per_page not in VALID_PER_PAGE:
        per_page = 5

    receipts = (
        PaymentReceipt.objects.filter(organization=request.organization)
        .select_related("sale", "sale__lead")
        .order_by("-date")
    )

    table = PaymentReceiptTable(receipts, request=request)
    RequestConfig(request, paginate={"per_page": per_page}).configure(table)

    context = {
        "table": table,
        "htmx_url": request.path,
        "htmx_target": "#receipts-table",
        "per_page_options": [5, 10, 25, 50, 100],
        "per_page": per_page,
    }

    return render(request, "tables/hx-bootstrap4.html", context)


@login_required
@organization_slug_required
def receipt_detail(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """Display details of a specific receipt."""
    receipt = get_object_or_404(
        PaymentReceipt, uuid=uuid, organization=request.organization
    )
    return render(request, "accounting/receipt_detail.html", {"receipt": receipt})


@login_required
@organization_slug_required
def hx_create_payment_receipt(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Pay the balance amount remaining for the sale.
    """

    receipt = get_object_or_404(
        PaymentReceipt, uuid=uuid, organization=request.organization
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
                "receipt-created",
            )
            return response
        else:
            response = render(
                request,
                "accounting/forms/receipt_form.html",
                {
                    "form": form,
                    "sale": sale,
                },
            )
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
            "balance_amount": sale_balance_amount,
            "amount": receipt.closing_balance,
        }
    )
    return render(
        request,
        "accounting/forms/receipt_form.html",
        {
            "form": form,
            "sale": sale,
        },
    )


@require_http_methods(["DELETE"])
@login_required
@organization_slug_required
def hx_delete_receipt(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """HTMX endpoint to delete a receipt."""
    receipt = get_object_or_404(
        PaymentReceipt, uuid=uuid, organization=request.organization
    )

    try:
        receipt.delete()
        response = HttpResponse(status=204)
        response = trigger_client_event(response, "receipt-deleted")
        return trigger_client_event(
            response,
            "message",
            {"level": "success", "message": "Receipt deleted successfully!"},
        )
    except Exception as e:
        logger.error(f"Error deleting receipt {uuid}: {str(e)}")
        response = HttpResponse(status=500)
        return trigger_client_event(
            response,
            "message",
            {"level": "error", "message": "Error deleting receipt."},
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
    """Render the full-page membership sale creation form."""
    form = MembershipSaleCreateForm(organization=request.organization)
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
            response = trigger_client_event(response, "sale-updated")
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
        response = trigger_client_event(response, "sale-deleted")
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
def hx_edit_receipt(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Handle editing a payment receipt via HTMX.
    """
    receipt = get_object_or_404(
        PaymentReceipt, uuid=uuid, organization=request.organization
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
                    "message": _("Payment receipt updated successfully!"),
                },
            )
            response = trigger_client_event(response, "receipt-updated")
            return response
        else:
            response = render(
                request, "accounting/forms/receipt_form.html", {"form": form}
            )
            response = trigger_client_event(
                response,
                "message",
                {
                    "level": "error",
                    "message": _(
                        "Failed to update payment receipt. Please check the form for errors."
                    ),
                },
            )
            return response

    form = PaymentReceiptForm(instance=receipt)
    return render(request, "accounting/forms/receipt_form.html", {"form": form})


@login_required
@organization_slug_required
def receipt_pdf(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    receipt = get_object_or_404(
        PaymentReceipt, uuid=uuid, organization=request.organization
    )
    terms_list = [
        "NO Refund / Membership Cancellation",
        "Please read, understand and comply with these rules",
        "Right of enrollment and entry is reserved by management",
        "Transfer fees of 1000/- will be charged under conditions",
        "Clients may not participate in workout independently or under personal trainer unless authorized",
        "Clients are required to carry and change their footwear outside in shoe closet.",
    ]

    organization = request.organization
    sale = receipt.sale
    lead = receipt.sale.lead

    context = {
        "terms_list": terms_list,
        "organization": organization,
        "receipt": receipt,
        "sale": sale,
        "lead": lead,
        "logo_url": organization.logo.url if organization.logo else None,
    }

    file_name = f"receipt-{lead.full_name}-{receipt.receipt_number}"

    template = get_template("pdfs/receipt.html")
    html = template.render(context)
    pdf = HTML(string=html, base_url=request.build_absolute_uri()).write_pdf()
    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment;filename="{file_name}.pdf"'
    response["Access-Control-Expose-Headers"] = "Content-Disposition"
    return response


# =============================================================================
# Class-Based HTMX Views (using mixins)
# =============================================================================


logger = logging.getLogger(__name__)


@method_decorator(login_required, name='dispatch')
@method_decorator(organization_slug_required, name='dispatch')
class HxCreateMembershipSaleView(HtmxFormMixin, View):
    """Create membership sale with custom save logic."""

    template_name = "accounting/partials/membership_sale_form.html"
    form_class = MembershipSaleCreateForm
    success_event = "membership-sale-created"
    success_status = 200
    context_object_name = "form"

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['organization'] = self.request.organization
        return kwargs

    def get(self, request, *args, **kwargs):
        logger.debug("[HxCreateMembershipSaleView] GET called")
        form = self.get_form()
        return self.render_form(form)

    def post(self, request, *args, **kwargs):
        logger.debug("[HxCreateMembershipSaleView] POST called")
        form = self.get_form()
        if form.is_valid():
            return self.form_valid(form)
        else:
            return self.form_invalid(form)

    def form_valid(self, form):
        sale = form.save_and_create_receipt(self.request.organization)
        self._object = sale
        return self.htmx_success()

    def htmx_success(self, context=None, template_name=None):
        if self.success_status == 200:
            first_receipt = self._object.receipts.order_by("date").first()
            return TemplateResponse(
                request=self.request,
                template="accounting/partials/payment_receipt.html",
                context={"sale": self._object, "receipt": first_receipt},
                status=200
            )
        return super().htmx_success(context, template_name)


@method_decorator(login_required, name='dispatch')
@method_decorator(organization_slug_required, name='dispatch')
class HxDeleteSaleView(HtmxDeleteMixin, View):
    """Delete membership sale using HtmxDeleteMixin."""

    model = MembershipSale
    success_event = "sale-deleted"
    event_id_key = "sale_id"
    permission_required = "accounting.delete_membershipsale"

