from django.db.models import Prefetch, Q
from django.forms import inlineformset_factory, model_to_dict
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render

from django.template.loader import render_to_string
from django_htmx.http import trigger_client_event
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from typing import Any, cast

from crown_crm.utils.decorators import organization_slug_required
from crown_crm.utils.types import OrgHttpRequest

from .forms import (
    LeadAddressForm,
    LeadCreateForm,
    LeadMobileNumberForm,
    LeadEmailForm,
    LeadMobileNumberTableForm,
    LeadEmailAddressTableForm,
)
from .models import (
    LeadMaster,
    LeadMobileNumberMaster,
    LeadEmailAddressMaster,
)

# Create your views here.


@login_required
@require_http_methods(["GET"])
@organization_slug_required
def search_results_view(request: OrgHttpRequest) -> HttpResponse:
    """Search for leads based on the provided query string.

    Searches across:
    - First, middle, and last names
    - Mobile numbers
    - Email addresses
    - Address fields
    - Source information

    Args:
        request: The HTTP request containing the search query parameter.

    Returns:
        HttpResponse: Rendered template with search results.
    """
    query = request.GET.get("lead", "").strip()

    if query == "":
        return render(request, "leads/partials/search_results.html")

    # Base queryset for the current organization
    leads = LeadMaster.objects.filter(organization=request.organization)

    if query:
        # Create a Q object to combine multiple search conditions
        search_conditions = Q()

        # Search in name fields
        name_conditions = (
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(middle_name__icontains=query)
        )

        # Search in mobile numbers (through related model)
        mobile_condition = Q(mobile_numbers__mobile_number__icontains=query)

        # Search in email addresses (through related model)
        email_condition = Q(emails__email__icontains=query)

        # Combine all conditions with OR
        search_conditions = name_conditions | mobile_condition | email_condition

        # Apply the search conditions and remove duplicates
        leads = leads.filter(search_conditions).distinct()

    # Prefetch related data to avoid N+1 queries
    leads = leads.prefetch_related(
        "mobile_numbers",
        "emails",
    ).order_by("first_name", "last_name")

    context = {
        "leads": leads,
        "count": leads.count(),
    }
    return render(request, "leads/partials/search_results.html", context)


MobileNumberFormSet = inlineformset_factory(
    LeadMaster,
    LeadMobileNumberMaster,
    form=LeadMobileNumberForm,
    extra=1,
    can_delete=True,
)
EmailFormSet = inlineformset_factory(
    LeadMaster, LeadEmailAddressMaster, form=LeadEmailForm, extra=1, can_delete=True
)


@login_required
@organization_slug_required
def all_leads_view(request: OrgHttpRequest) -> HttpResponse:
    """
    Displaying all leads.
    """

    leads = (
        LeadMaster.objects.filter(organization=request.organization)
        .prefetch_related("mobile_numbers", "emails")
        .order_by("-created_at")
    )

    print(leads)

    context = {"leads": leads}

    return render(request, "leads/all_leads.html", context=context)


@login_required
@organization_slug_required
def lead_detail_view(request: OrgHttpRequest, pk: str):
    lead = get_object_or_404(LeadMaster, pk=pk)

    context = {"lead": lead}

    return render(request, "leads/lead_detail.html", context=context)


@login_required
@organization_slug_required
def hx_lead_delete_view(request: OrgHttpRequest, pk: int):
    lead_obj = LeadMaster.objects.filter(pk=pk)

    if not lead_obj.exists():
        res = HttpResponse()
        res = trigger_client_event(
            res,
            "message",
            {"level": "error", "message": "Cannot find the lead number."},
        )
        return res

    lead_obj = lead_obj.first()
    lead_obj.delete()  # type: ignore

    context = {"leads": LeadMaster.objects.filter(organization=request.organization)}

    res = render(request, "leads/tables/leads.html", context)
    res = trigger_client_event(
        res, "message", {"level": "success", "message": "Deleted Lead Successfully!"}
    )

    return res


@login_required
@organization_slug_required
def hx_create_lead_frm_membership(request: OrgHttpRequest) -> HttpResponse:
    """
    Handles the creation of new lead, along with associated mobile numbers,
    and email addresses using formsets. Displays the form and saves data if
    valid.
    """

    if request.method == "POST":
        # Binding the submitted data to the form.
        lead_form = LeadCreateForm(request.POST)
        mobile_formset = MobileNumberFormSet(request.POST, prefix="mobile")
        email_formset = EmailFormSet(request.POST, prefix="email")
        address_form = LeadAddressForm(request.POST)

        if (
            lead_form.is_valid()
            and mobile_formset.is_valid()
            and email_formset.is_valid()
            and address_form.is_valid()
        ):
            lead = lead_form.save()

            # Assigning the lead to the formset instances.
            mobile_formset.instance = lead
            email_formset.instance = lead
            address_form.instance = lead

            mobile_formset.save()
            email_formset.save()
            address_form.save()

            res = render(request, "leads/forms/lead_create.html")
            res = trigger_client_event(
                res,
                "message",
                {"level": "success", "message": "Lead Created Successfully!"},
            )
            res = trigger_client_event(
                res,
                "lead_create_success",
                model_to_dict(lead),
            )
            return res
        else:
            # The invalid response with error messages is returned.
            context = {
                "lead_form": lead_form,
                "mobile_formset": mobile_formset,
                "email_formset": email_formset,
                "address_form": address_form,
            }

            res = render(request, "leads/forms/lead_create.html", context)
            res = trigger_client_event(
                res,
                "message",
                {"level": "error", "message": "Error adding mobile number."},
            )

            return res

    # The get request is performed.
    lead_form = LeadCreateForm()
    mobile_formset = MobileNumberFormSet(prefix="mobile")
    email_formset = EmailFormSet(prefix="email")
    address_form = LeadAddressForm()

    context = {
        "lead_form": lead_form,
        "mobile_formset": mobile_formset,
        "email_formset": email_formset,
        "address_form": address_form,
    }
    return render(request, "leads/forms/lead_create.html", context)


@login_required
@organization_slug_required
def hx_create_lead(request: OrgHttpRequest) -> HttpResponse:
    """
    Handles the creation of new lead, along with associated mobile numbers,
    and email addresses using formsets. Displays the form and saves data if
    valid.
    """

    if request.method == "POST":
        # Binding the submitted data to the form.
        lead_form = LeadCreateForm(request.POST)
        mobile_formset = MobileNumberFormSet(request.POST, prefix="mobile")
        email_formset = EmailFormSet(request.POST, prefix="email")
        address_form = LeadAddressForm(request.POST)

        if (
            lead_form.is_valid()
            and mobile_formset.is_valid()
            and email_formset.is_valid()
            and address_form.is_valid()
        ):
            lead = lead_form.save()

            # Assigning the lead to the formset instances.
            mobile_formset.instance = lead
            email_formset.instance = lead
            address_form.instance = lead

            mobile_formset.save()
            email_formset.save()
            address_form.save()

            res = render(request, "leads/forms/lead_create.html")
            res = trigger_client_event(
                res,
                "message",
                {"level": "success", "message": "Lead Created Successfully!"},
            )
            res = trigger_client_event(
                res,
                "lead_create_success",
            )
            return res
        else:
            # The invalid response with error messages is returned.
            context = {
                "lead_form": lead_form,
                "mobile_formset": mobile_formset,
                "email_formset": email_formset,
                "address_form": address_form,
            }

            res = render(request, "leads/forms/lead_create.html", context)
            res = trigger_client_event(
                res,
                "message",
                {"level": "error", "message": "Error adding mobile number."},
            )

            return res

    # The get request is performed.
    lead_form = LeadCreateForm()
    mobile_formset = MobileNumberFormSet(prefix="mobile")
    email_formset = EmailFormSet(prefix="email")
    address_form = LeadAddressForm()

    context = {
        "lead_form": lead_form,
        "mobile_formset": mobile_formset,
        "email_formset": email_formset,
        "address_form": address_form,
    }
    return render(request, "leads/forms/lead_create.html", context)


@login_required  # type: ignore
@organization_slug_required
def hx_edit_lead(request: OrgHttpRequest, pk: int):
    """
    Edit an existing lead. If not found, return an HTMX response
    with an error message.
    """

    lead_qs = LeadMaster.objects.filter(pk=pk)

    if not lead_qs.exists():
        # Handling the case with custom error message.
        res = render(request, "", status=404)
        return trigger_client_event(res, "message", {"message": "Lead doesn't exist!"})

    lead = lead_qs.first()

    if request.method == "POST":
        # Binding the submitted data to the form.
        lead_form = LeadCreateForm(request.POST, instance=lead)
        mobile_formset = MobileNumberFormSet(request.POST, instance=lead)
        email_formset = EmailFormSet(request.POST, instance=lead)
        address_form = LeadAddressForm(request.POST, instance=lead)

        if (
            lead_form.is_valid()
            and mobile_formset.is_valid()
            and email_formset.is_valid()
            and address_form.is_valid()
        ):
            lead = lead_form.save()
            mobile_formset.save()
            email_formset.save()
            address_form.save()

            return render(request, "")
        else:
            # The invalid response with error messages is returned.
            context = {
                "lead_form": lead_form,
                "mobile_formset": mobile_formset,
                "email_formset": email_formset,
            }

            return render(request, "", context)


@login_required
@organization_slug_required
def hx_leads_table(request: OrgHttpRequest) -> HttpResponse:
    """
    Returns Partial table html containing leads.
    """

    leads = (
        LeadMaster.objects.filter(organization=request.organization)
        .prefetch_related(
            Prefetch(
                "mobile_numbers",
                queryset=LeadMobileNumberMaster.objects.order_by("uuid")[:1],
                to_attr="first_mobile",
            ),
            Prefetch(
                "emails",
                queryset=LeadEmailAddressMaster.objects.order_by("uuid")[:1],
                to_attr="first_email",
            ),
        )
        .order_by("-created_at")
    )
    context = {"leads": leads}

    return render(request, "leads/tables/leads.html", context=context)


@login_required
@organization_slug_required
def hx_lead_mobile_table(request: OrgHttpRequest, lead_id: int) -> HttpResponse:
    """
    A lead Mobile table.
    """

    mobile_numbers = LeadMobileNumberMaster.objects.filter(lead=lead_id)
    lead_id = mobile_numbers.first().lead.uuid

    context = {"mobile_numbers": mobile_numbers, "lead_id": lead_id}

    return render(request, "leads/tables/mobile_numbers.html", context)


@login_required
@organization_slug_required
@require_http_methods(["DELETE", "POST"])
def hx_lead_mobile_delete(request: OrgHttpRequest, pk: int) -> HttpResponse:
    """
    Deleting the mobile number
    """
    try:
        mobile_obj = LeadMobileNumberMaster.objects.get(pk=pk)
        lead_id = mobile_obj.lead.uuid
        mobile_obj.delete()
    except LeadMobileNumberMaster.DoesNotExist:
        res = HttpResponse()
        return trigger_client_event(
            res,
            "message",
            {"level": "error", "message": "Cannot find the mobile number."},
        )

    context = {
        "lead_id": lead_id.uuid,
        "mobile_numbers": LeadMobileNumberMaster.objects.filter(lead=lead_id.uuid),
    }

    res = render(request, "leads/tables/mobile_numbers.html", context)
    res = trigger_client_event(
        res,
        "message",
        {"level": "success", "message": "Deleted Mobile Number Successfully!"},
    )
    res = trigger_client_event(res, "lead_mobile_added")

    return res


@login_required
@organization_slug_required
def hx_mobile_table_form(request: OrgHttpRequest) -> HttpResponse:
    """
    Enables us to create mobile number on table dynamically.
    """

    form = LeadMobileNumberTableForm()

    if request.method == "POST":
        lead_id = request.POST.get("lead")
        print(lead_id)
        lead_obj = LeadMaster.objects.get(uuid=lead_id)
        form = LeadMobileNumberTableForm(request.POST)

        if form.is_valid():
            mob_obj = form.save(commit=False)

            mob_obj.lead = lead_obj
            mob_obj.save()

            res = HttpResponse()
            res = trigger_client_event(
                res,
                "message",
                {"level": "success", "message": "Lead Created Successfully!"},
            )
            res = trigger_client_event(res, "lead_mobile_added")

            return res
        else:
            context = {"form": form}

            res = render(
                request, "leads/forms/mobile_number_table.html", context=context
            )
            res = trigger_client_event(
                res,
                "message",
                {"level": "error", "message": "Error adding mobile number."},
            )

            return res

    context = {"form": form}

    return render(request, "leads/forms/mobile_number_table.html", context=context)


@login_required
@organization_slug_required
def hx_email_table_form(request: OrgHttpRequest) -> HttpResponse:
    """
    Enables us to create email addresses dynamically on the table.
    """

    form = LeadEmailAddressTableForm()

    if request.method == "POST":
        lead_id = request.POST.get("lead")
        lead_obj = LeadMaster.objects.get(uuid=lead_id)
        form = LeadEmailAddressTableForm(request.POST)

        if form.is_valid():
            email_obj = form.save(commit=False)

            email_obj.lead = lead_obj
            email_obj.save()

            res = HttpResponse()
            res = trigger_client_event(
                res,
                "message",
                {"level": "success", "message": "Email Added Successfully!"},
            )
            res = trigger_client_event(res, "lead_email_added")

            return res
        else:
            context = {"form": form}

            res = render(
                request, "leads/forms/email_address_table.html", context=context
            )
            res = trigger_client_event(
                res,
                "message",
                {"level": "error", "message": "Error adding email address."},
            )

            return res

    context = {"form": form}

    return render(request, "leads/forms/email_address_table.html", context=context)


@login_required
@organization_slug_required
def hx_lead_email_table(request: OrgHttpRequest, lead_id: str) -> HttpResponse:
    """
    A lead Email Address table.
    """

    email_addresses = LeadEmailAddressMaster.objects.filter(lead=lead_id)
    lead_id = email_addresses.first().lead.uuid if email_addresses else lead_id

    context = {"email_addresses": email_addresses, "lead_id": str(lead_id)}

    return render(request, "leads/tables/emails.html", context)


@require_http_methods(["DELETE", "POST"])
@login_required
@organization_slug_required
def hx_lead_email_delete(request: OrgHttpRequest, pk: int) -> HttpResponse:
    """
    Deleting the email address
    """
    try:
        email_obj = LeadEmailAddressMaster.objects.get(pk=pk)
        lead_id = email_obj.lead.uuid
        email_obj.delete()
    except LeadEmailAddressMaster.DoesNotExist:
        res = HttpResponse()
        return trigger_client_event(
            res,
            "message",
            {"level": "error", "message": "Email Address doesn't exist!"},
        )

    context = {
        "lead_id": lead_id,
        "email_addresses": LeadEmailAddressMaster.objects.filter(lead=lead_id),
    }

    res = render(request, "leads/tables/emails.html", context)
    res = trigger_client_event(
        res,
        "message",
        {"level": "success", "message": "Deleted Email Address Successfully!"},
    )
    res = trigger_client_event(res, "lead_email_deleted")

    return res


@login_required
@organization_slug_required
@require_http_methods(["GET", "POST"])
def hx_quick_create_lead(request: OrgHttpRequest) -> HttpResponse:
    """Quickly create a Lead via a lightweight HTMX modal.

    Mimics `hx_create_product` behaviour in logistics app.
    Accepts first/middle/last names and source only (using `LeadCreateForm`).
    Returns 204 on success with client events, otherwise re-renders the form with errors.
    """
    if request.method == "POST":
        # Binding the submitted data to the form.
        lead_form = LeadCreateForm(request.POST)
        mobile_formset = MobileNumberFormSet(request.POST, prefix="mobile")
        email_formset = EmailFormSet(request.POST, prefix="email")
        address_form = LeadAddressForm(request.POST)

        if (
            lead_form.is_valid()
            and mobile_formset.is_valid()
            and email_formset.is_valid()
            and address_form.is_valid()
        ):
            lead = lead_form.save()

            # Assigning the lead to the formset instances.
            mobile_formset.instance = lead
            email_formset.instance = lead
            address_form.instance = lead

            mobile_formset.save()
            email_formset.save()
            address_form.save()

            res = HttpResponse(status=204)
            res = trigger_client_event(
                res,
                "message",
                {"level": "success", "message": "Lead Created Successfully!"},
            )
            res = trigger_client_event(
                res,
                "lead_create_success",
                model_to_dict(lead),
            )
            return res
        else:
            # The invalid response with error messages is returned.
            context = {
                "lead_form": lead_form,
                "mobile_formset": mobile_formset,
                "email_formset": email_formset,
                "address_form": address_form,
            }

            res = render(request, "leads/forms/lead_form.html", context)
            res = trigger_client_event(
                res,
                "message",
                {"level": "error", "message": "Error adding mobile number."},
            )

            return res

    # The get request is performed.
    lead_form = LeadCreateForm()
    mobile_formset = MobileNumberFormSet(prefix="mobile")
    email_formset = EmailFormSet(prefix="email")
    address_form = LeadAddressForm()

    context = {
        "lead_form": lead_form,
        "mobile_formset": mobile_formset,
        "email_formset": email_formset,
        "address_form": address_form,
    }
    return render(request, "leads/forms/lead_form.html", context)

    # GET request – render blank form
    form = LeadCreateForm(initial={"organization": request.organization.pk})
    return render(request, "leads/forms/lead_form.html", {"form": form})


@login_required
@organization_slug_required
def hx_add_mobile_formset_input(request: OrgHttpRequest):
    form_id = int(request.GET.get("mobile-TOTAL_FORMS", 0))
    form = LeadMobileNumberForm(prefix=f"mobile-{form_id}")
    html = render_to_string(
        "leads/forms/mobile_form_row.html", {"form": form, "form_id": form_id}
    )
    return HttpResponse(html)


@login_required
@organization_slug_required
def hx_add_email_formset_input(request: OrgHttpRequest):
    form_id = int(request.GET.get("email-TOTAL_FORMS", 0))
    form = LeadEmailForm(prefix=f"email-{form_id}")
    html = render_to_string(
        "leads/forms/email_form_row.html", {"form": form, "form_id": form_id}
    )
    return HttpResponse(html)
