import json
from uuid import UUID
from django.contrib.auth.decorators import login_required
from django.db.models import QuerySet
from django.forms.models import modelformset_factory
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.contrib import messages
from django.utils.text import slugify
from django_htmx.http import trigger_client_event

from crown_crm.clients.models import ClientMaster
from crown_crm.leads.models import LeadMaster
from crown_crm.organizations.forms import OrganizationCreateForm, OrganizationEmailForm, OrganizationMobileForm
from crown_crm.organizations.models import OrganizationEmailMaster, OrganizationMaster, OrganizationMobileNumberMaster
from crown_crm.organizations.querysets import OrganizationQuerySet
from crown_crm.utils.decorators import organization_slug_required
from crown_crm.utils.types import OrgHttpRequest

# Create your views here.


@login_required
def organizations_list_view(request: OrgHttpRequest) -> HttpResponse:
    orgs = OrganizationMaster.objects.user_in(request.user)

    context = {
        "organizations": orgs
    }

    if request.htmx:
        return render(request, "organizations/partials/list.html", context)

    return render(request, "organizations/list.html", context)


@login_required
def organizations_navbar_list_view(request: OrgHttpRequest) -> HttpResponse:
    orgs = OrganizationMaster.objects.user_in(request.user)

    context = {
        "organizations": orgs
    }

    return render(request, "organizations/partials/navbar-list.html", context)


@login_required
def hx_organization_create_view(request: OrgHttpRequest) -> HttpResponse:
    if request.method == "POST":
        org_form = OrganizationCreateForm(
            request.POST, request.FILES)

        if org_form.is_valid():
            cleaned_data = org_form.cleaned_data
            name = cleaned_data.get('name')
            org = org_form.save(commit=False)

            # If name is not valid.
            if name is None:
                response = HttpResponse(status=400)
                response = trigger_client_event(response, 'message', {
                    'message': 'Organization Name is required!',
                    'level': 'error',
                })
                return response

            org.slug = slugify(name)
            org.owner = request.user
            org.save()

            mobile = request.POST.get('mobile_number')
            email = request.POST.get('email')

            if mobile is not None or mobile != '':
                mobile_form = OrganizationMobileForm({'mobile_number': mobile})
                if mobile_form.is_valid():
                    mobile_obj = mobile_form.save(commit=False)
                    mobile_obj.organization = org
                    mobile_obj.save()

            if email is not None or email != '':
                email_form = OrganizationEmailForm({'email': email})
                if email_form.is_valid():
                    email_obj = email_form.save(commit=False)
                    email_obj.organization = org
                    email_obj.save()

            return HttpResponse(status=204, headers={
                'HX-Trigger': json.dumps({
                    'organizationsListChanged': 'organizationChnages',
                    'message': {
                        'message': 'Organization Created Successfully!',
                        'level': 'success',
                    }
                })
            })
    else:
        org_form = OrganizationCreateForm()

    context = {
        "form": org_form,
    }

    return render(request,
                  'organizations/forms/create-organization.html',
                  context=context)


@login_required
@organization_slug_required
def organization_dashboard_view(request: OrgHttpRequest) -> HttpResponse:


    lead_count = LeadMaster.objects.filter(
        organization=request.organization).count()

    client_count = ClientMaster.objects.filter(
        organization=request.organization).count()

    recent_leads = LeadMaster.objects.filter(
        organization=request.organization).order_by('-created_at')[:5]

    recent_clients = ClientMaster.objects.filter(
        organization=request.organization).order_by('-created_at')[:5]

    context = {
        'lead_count': lead_count,
        'client_count': client_count,
        'recent_clients': recent_clients,
        'recent_leads': recent_leads,
    }

    return render(request, "organizations/dashboard.html", context=context)


@login_required
@organization_slug_required
def organization_settings_view(request: OrgHttpRequest) -> HttpResponse:
    org = request.organization
    return render(request, "organizations/settings.html", { "organization": org })


@login_required
@organization_slug_required
def organization_settings_update_view(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """
    Editing organization in the settings view.
    """
    org = get_object_or_404(OrganizationMaster, uuid=uuid)
    
    if request.method == "POST":
        form = OrganizationCreateForm(request.POST, request.FILES,instance=org)
        if form.is_valid():
            form.save()
            response = render(
                request,
                "organizations/partials/settings.html",
                { "organization": org }
            )
            response = trigger_client_event(
                response,
                "message",
                {"level": "success", "message": "Organization updated successfully!"},
            )
            response = trigger_client_event(response, "organization_update_success")
            return response
        else:
            response = render(
                request,
                "organizations/forms/create-organization.html",
                {"form": form},
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

    form = OrganizationCreateForm(instance=org)
    return render(
        request, 
        "organizations/forms/create-organization.html", 
        {"form": form}
    )
