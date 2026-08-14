import json
from uuid import UUID

from datetime import datetime, timedelta
from django.db.models import Count, Sum
from django.utils import timezone

from django.contrib.auth.decorators import login_required
from django.db.models import QuerySet
from django.forms.models import modelformset_factory
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.contrib import messages
from django.urls import reverse
from django.utils.text import slugify
from django_htmx.http import trigger_client_event

from crown_crm.accounting.models import MembershipSale
from crown_crm.clients.models import ClientMaster
from crown_crm.leads.models import LeadMaster
from crown_crm.organizations.forms import (
    OrganizationCreateForm,
    OrganizationEmailForm,
    OrganizationMobileForm,
)
from crown_crm.organizations.models import (
    OrganizationEmailMaster,
    OrganizationMaster,
    OrganizationMobileNumberMaster,
)
from crown_crm.organizations.querysets import OrganizationQuerySet
from crown_crm.utils.decorators import organization_slug_required
from crown_crm.utils.types import OrgHttpRequest

# Create your views here.


@login_required
def organizations_list_view(request: OrgHttpRequest) -> HttpResponse:
    orgs = OrganizationMaster.objects.user_in(request.user)

    context = {"organizations": orgs}

    if request.htmx:
        return render(request, "organizations/partials/list.html", context)

    return render(request, "organizations/list.html", context)


@login_required
def organizations_navbar_list_view(request: OrgHttpRequest) -> HttpResponse:
    orgs = OrganizationMaster.objects.user_in(request.user)

    context = {"organizations": orgs}

    return render(request, "organizations/partials/navbar-list.html", context)


@login_required
def hx_organization_create_view(request: OrgHttpRequest) -> HttpResponse:
    if request.method == "POST":
        org_form = OrganizationCreateForm(request.POST, request.FILES)

        if not org_form.is_valid():
            context = {"form": org_form}
            res = render(request, "organizations/forms/create-organization.html", context)
            res = trigger_client_event(
                res,
                "message",
                {"level": "error", "message": "Please fix the form errors."},
            )
            return res

        cleaned_data = org_form.cleaned_data
        name = cleaned_data.get("name")
        org = org_form.save(commit=False)

        if name is None:
            response = HttpResponse(status=400)
            response = trigger_client_event(
                response,
                "message",
                {
                    "message": "Organization Name is required!",
                    "level": "error",
                },
            )
            return response

        org.slug = slugify(name)
        org.owner = request.user
        org.save()

        mobile = cleaned_data.get("mobile_number")
        email = cleaned_data.get("email")

        if mobile:
            existing_mobile = OrganizationMobileNumberMaster.objects.filter(
                organization=org
            ).first()
            if existing_mobile:
                existing_mobile.mobile_number = mobile
                existing_mobile.save()
            else:
                OrganizationMobileNumberMaster.objects.create(
                    organization=org,
                    mobile_number=mobile
                )

        if email:
            existing_email = OrganizationEmailMaster.objects.filter(
                organization=org
            ).first()
            if existing_email:
                existing_email.email = email
                existing_email.save()
            else:
                OrganizationEmailMaster.objects.create(
                    organization=org,
                    email=email
                )

        return HttpResponse(
            status=204,
            headers={
                "HX-Trigger": json.dumps(
                    {
                        "organizationsListChanged": "organizationChnages",
                        "organization-created": "",
                        "message": {
                            "message": "Organization Created Successfully!",
                            "level": "success",
                        },
                    }
                )
            },
        )
    else:
        org_form = OrganizationCreateForm()

    context = {
        "form": org_form,
    }

    return render(
        request, "organizations/forms/create-organization.html", context=context
    )


@login_required
@organization_slug_required
def organization_dashboard_view(request: OrgHttpRequest) -> HttpResponse:

    # Basic counts
    lead_count = LeadMaster.objects.filter(organization=request.organization).count()

    # Get leads created in the last 30 days
    thirty_days_ago = timezone.now() - timedelta(days=30)
    recent_lead_count = LeadMaster.objects.filter(
        organization=request.organization, created_at__gte=thirty_days_ago
    ).count()

    # Get membership sales data for the chart
    sales_data = (
        MembershipSale.objects.filter(
            organization=request.organization,
            created_at__gte=timezone.now() - timedelta(days=30),
        )
        .values("created_at__date")
        .annotate(count=Count("uuid"))
        .order_by("created_at__date")
    )

    # Prepare chart data
    sales_dates = []
    sales_counts = []

    # Initialize last 7 days data with zeros (oldest to newest)
    for i in range(6, -1, -1):
        date = (timezone.now() - timedelta(days=i)).date()
        sales_dates.append(date.strftime("%b %d"))
        sales_counts.append(0)

    # Fill in actual sales data
    for sale in sales_data:
        date_str = sale["created_at__date"].strftime("%b %d")
        if date_str in sales_dates:
            idx = sales_dates.index(date_str)
            sales_counts[idx] = sale["count"]

    # Prepare chart data for template (ascending order: oldest to newest)
    chart_data = {
        "sales_dates": list(reversed(sales_dates)),
        "sales_trend": list(reversed(sales_counts)),
        "lead_trend": [max(0, min(5, i)) for i in range(7)],
    }

    context = {
        "lead_count": lead_count,
        "recent_lead_count": recent_lead_count,
        "chart_data": chart_data,
        "htmx_url": request.path,
        "per_page_options": [5, 10, 25, 50, 100],
    }

    return render(request, "organizations/dashboard.html", context=context)


@login_required
@organization_slug_required
def organization_settings_view(request: OrgHttpRequest) -> HttpResponse:
    org = request.organization
    return render(request, "organizations/settings.html", {"organization": org})


@login_required
@organization_slug_required
def organization_settings_update_view(
    request: OrgHttpRequest, uuid: UUID
) -> HttpResponse:
    """
    Editing organization in the settings view.
    """
    org = get_object_or_404(OrganizationMaster, uuid=uuid)

    if request.method == "POST":
        form = OrganizationCreateForm(request.POST, request.FILES, instance=org)
        if form.is_valid():
            form.save()

            cleaned_data = form.cleaned_data
            mobile = cleaned_data.get("mobile_number")
            email = cleaned_data.get("email")

            if mobile:
                existing_mobile = OrganizationMobileNumberMaster.objects.filter(
                    organization=org
                ).first()
                if existing_mobile:
                    existing_mobile.mobile_number = mobile
                    existing_mobile.save()
                else:
                    OrganizationMobileNumberMaster.objects.create(
                        organization=org,
                        mobile_number=mobile
                    )

            if email:
                existing_email = OrganizationEmailMaster.objects.filter(
                    organization=org
                ).first()
                if existing_email:
                    existing_email.email = email
                    existing_email.save()
                else:
                    OrganizationEmailMaster.objects.create(
                        organization=org,
                        email=email
                    )

            response = HttpResponse(status=204)
            response = trigger_client_event(
                response,
                "message",
                {"level": "success", "message": "Organization updated successfully!"},
            )
            response = trigger_client_event(response, "organization-updated")
            return response
            return response
        else:
            response = render(
                request,
                "organizations/forms/create-organization.html",
                {
                    "form": form,
                    "action_url": reverse(
                        "organizations-settings-update",
                        kwargs={"slug": request.organization.slug, "uuid": uuid},
                    ),
                },
            )
            response = trigger_client_event(
                response,
                "message",
                {
                    "level": "error",
                    "message": "Failed to update organization. Please check the form for errors.",
                },
            )
            return response

    existing_mobile = OrganizationMobileNumberMaster.objects.filter(
        organization=org
    ).first()
    existing_email = OrganizationEmailMaster.objects.filter(organization=org).first()

    initial_data = {}
    if existing_mobile:
        initial_data["mobile_number"] = existing_mobile.mobile_number
    if existing_email:
        initial_data["email"] = existing_email.email

    form = OrganizationCreateForm(instance=org, initial=initial_data)
    action_url = reverse(
        "organizations-settings-update",
        kwargs={"slug": request.organization.slug, "uuid": uuid},
    )
    return render(
        request,
        "organizations/forms/create-organization.html",
        {"form": form, "action_url": action_url},
    )
