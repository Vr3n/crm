import logging

from django.db.models import Prefetch, Q
from django.forms import inlineformset_factory, model_to_dict
from django.http import HttpResponse, JsonResponse
from django.db.models.functions import TruncDate
from django.db.models import Count
from datetime import timedelta
from django.utils import timezone
from django.shortcuts import get_object_or_404, render
from django.template.loader import render_to_string
from django.template.response import TemplateResponse
from django_htmx.http import trigger_client_event
from django.contrib.auth.decorators import login_required
from django.views import View
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator
from typing import Any, cast

from crown_crm.core.mixins import HtmxFormMixin, HtmxDeleteMixin, HtmxFormsetMixin
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

logger = logging.getLogger(__name__)

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
    from django.core.paginator import Paginator

    query = request.GET.get("q", "").strip()

    leads = LeadMaster.objects.filter(organization=request.organization)

    if query:
        search_conditions = (
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(middle_name__icontains=query)
            | Q(mobile_numbers__mobile_number__icontains=query)
            | Q(emails__email__icontains=query)
        )
        leads = leads.filter(search_conditions).distinct()

    leads = leads.prefetch_related(
        "mobile_numbers",
        "emails",
    ).order_by("first_name", "last_name")

    per_page = 5
    paginator = Paginator(leads, per_page)
    page_obj = paginator.get_page(request.GET.get("page", 1))

    context = {
        "leads": page_obj.object_list,
        "page_obj": page_obj,
        "paginator": paginator,
        "query": query,
    }
    return render(request, "leads/partials/search_results_table.html", context)


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
        .prefetch_related("mobile_numbers", "emails", "memberships")
        .order_by("-created_at")
    )

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
                "lead-created",
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
                "lead-created",
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
def hx_lead_chart_data(request: OrgHttpRequest) -> JsonResponse:
    """Returns lead chart data as JSON for HTMX chart updates."""
    today = timezone.now().date()
    dates = [(today - timedelta(days=i)).strftime("%b %d") for i in range(6, -1, -1)]
    
    leads_by_day = (
        LeadMaster.objects.filter(organization=request.organization)
        .annotate(day=TruncDate('created_at'))
        .values('day')
        .annotate(count=Count('uuid'))
        .order_by('day')
    )
    
    trend = []
    for i in range(6, -1, -1):
        target = today - timedelta(days=i)
        count = next((l['count'] for l in leads_by_day if l['day'] == target), 0)
        trend.append(count)
    
    lead_count = LeadMaster.objects.filter(organization=request.organization).count()
    
    return JsonResponse({'lead_trend': trend, 'sales_dates': dates, 'lead_count': lead_count})


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
                "lead-created",
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


# =============================================================================
# Class-Based HTMX Views (using mixins)
# =============================================================================


@method_decorator(login_required, name='dispatch')
@method_decorator(organization_slug_required, name='dispatch')
class HxCreateLeadView(HtmxFormsetMixin, View):
    """Create lead with mobile/email formsets using HtmxFormsetMixin."""

    template_name = "leads/forms/lead_create.html"
    form_class = LeadCreateForm
    formset_classes = {
        'mobile': MobileNumberFormSet,
        'email': EmailFormSet,
    }
    success_event = "lead-created"
    context_object_name = "lead_form"
    permission_required = "leads.add_leadmaster"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['address_form'] = kwargs.get('address_form') or LeadAddressForm(
            self.request.POST or None
        )
        return context

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['initial'] = {'organization': self.request.organization}
        return kwargs

    def form_valid(self, form):
        logger.debug(f"[HxCreateLeadView] form_valid called")
        lead = form.save()

        for name, fs in self.formsets.items():
            fs.instance = lead
            fs.save()

        address_form = LeadAddressForm(self.request.POST)
        logger.debug(f"[HxCreateLeadView] address_form.is_valid: {address_form.is_valid()}")
        if not address_form.is_valid():
            logger.debug(f"[HxCreateLeadView] address_form errors: {address_form.errors}")

        if address_form.is_valid():
            address_form.instance = lead
            address_form.save()

        self._object = lead
        return self.htmx_success()


@method_decorator(login_required, name='dispatch')
@method_decorator(organization_slug_required, name='dispatch')
class HxEditLeadView(HtmxFormsetMixin, View):
    """Edit lead with mobile/email formsets using HtmxFormsetMixin."""

    template_name = "leads/forms/lead_form.html"
    form_class = LeadCreateForm
    formset_classes = {
        'mobile': MobileNumberFormSet,
        'email': EmailFormSet,
    }
    success_event = "lead-updated"
    context_object_name = "lead_form"
    permission_required = "leads.change_leadmaster"

    def get_object(self):
        return get_object_or_404(
            LeadMaster,
            pk=self.kwargs['pk'],
            organization=self.request.organization
        )

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['instance'] = self.get_object()
        return kwargs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['address_form'] = kwargs.get('address_form') or LeadAddressForm(
            self.request.POST or None,
            instance=getattr(context.get('lead_form'), 'instance', None)
        )
        return context

    def form_valid(self, form):
        lead = form.save()

        for name, fs in self.formsets.items():
            fs.instance = lead
            fs.save()

        address_form = LeadAddressForm(self.request.POST, instance=lead)
        if address_form.is_valid():
            address_form.save()

        self._object = lead
        return self.htmx_success()


@method_decorator(login_required, name='dispatch')
@method_decorator(organization_slug_required, name='dispatch')
class HxDeleteLeadView(HtmxDeleteMixin, View):
    """Delete lead using HtmxDeleteMixin."""

    model = LeadMaster
    success_event = "lead-deleted"
    event_id_key = "lead_id"
    permission_required = "leads.delete_leadmaster"
    pk_url_kwarg = 'pk'

    def get_object(self):
        return get_object_or_404(
            self.model,
            pk=self.kwargs[self.pk_url_kwarg],
            organization=self.request.organization
        )


@method_decorator(login_required, name='dispatch')
@method_decorator(organization_slug_required, name='dispatch')
class HxQuickCreateLeadView(HtmxFormMixin, View):
    """Quick create lead using HtmxFormMixin."""

    template_name = "leads/forms/lead_create.html"
    form_class = LeadCreateForm
    success_event = "lead-created"
    context_object_name = "lead_form"
    permission_required = "leads.add_leadmaster"

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['initial'] = {'organization': self.request.organization}
        return kwargs

    def get_success_event_params(self):
        return {"lead_id": self._object.id, "quick": True}
