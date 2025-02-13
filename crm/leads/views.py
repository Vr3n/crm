from django.db.models import Prefetch
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, render
from django_htmx.http import trigger_client_event
from django.forms import inlineformset_factory
from django.views.decorators.http import require_http_methods

from leads.forms import (
    LeadAddressForm, LeadComprehensiveForm,
    LeadMobileNumberForm, LeadEmailForm,
    LeadMobileNumberTableForm, LeadEmailAddressTableForm
)
from leads.models import (
    LeadMaster, LeadMobileNumberMaster,
    LeadEmailAddressMaster
)

# Create your views here.

MobileNumberFormSet = inlineformset_factory(
    LeadMaster, LeadMobileNumberMaster,
    form=LeadMobileNumberForm, extra=1, can_delete=True
)
EmailFormSet = inlineformset_factory(
    LeadMaster, LeadEmailAddressMaster,
    form=LeadEmailForm, extra=1, can_delete=True
)


def all_leads_view(request: HttpRequest) -> HttpResponse:
    """
    Displaying all leads.
    """

    leads = LeadMaster.objects.prefetch_related(
        'mobile_numbers', 'emails').order_by('-created_at')

    print(leads)

    context = {
        'leads': leads
    }

    return render(
        request, 'leads/all_leads.html',
        context=context
    )


def lead_detail_view(request: HttpRequest, pk: int):
    lead = get_object_or_404(LeadMaster, pk=pk)

    context = {
        'lead': lead
    }

    return render(request, 'leads/lead_detail.html', context=context)


def hx_lead_delete_view(request: HttpRequest, pk: int):
    lead_obj = LeadMaster.objects.filter(pk=pk)

    if not lead_obj.exists():
        res = HttpResponse()
        res = trigger_client_event(
            res, "message", {
                'level': 'error',
                'message': 'Cannot find the lead number.'
            })
        return res

    lead_obj = lead_obj.first()
    lead_obj.delete()

    context = {
        'leads': LeadMaster.objects.filter()
    }

    res = render(
        request,
        'leads/tables/leads.html',
        context
    )
    res = trigger_client_event(
        res, "message", {
            'level': 'success',
            'message': 'Deleted Lead Successfully!'
        })

    return res


def hx_create_lead(request: HttpRequest) -> HttpResponse:
    """
    Handles the creation of new lead, along with associated mobile numbers,
    and email addresses using formsets. Displays the form and saves data if
    valid.
    """

    if request.method == "POST":
        # Binding the submitted data to the form.
        lead_form = LeadComprehensiveForm(request.POST)
        mobile_formset = MobileNumberFormSet(request.POST, prefix='mobile')
        email_formset = EmailFormSet(request.POST, prefix='email')
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

            res = render(request, 'leads/forms/lead_create.html')
            res = trigger_client_event(
                res, "message", {
                    'level': 'success',
                    'message': 'Lead Created Successfully!'
                })
            res = trigger_client_event(
                res, "lead_create_success"
            )
            return res
        else:
            # The invalid response with error messages is returned.
            context = {
                'lead_form': lead_form,
                'mobile_formset': mobile_formset,
                'email_formset': email_formset,
                'address_form': address_form
            }

            res = render(request, 'leads/forms/lead_create.html', context)
            res = trigger_client_event(
                res, "message", {
                    'level': 'error',
                    'message': 'Error creating lead!'
                })

            return res

    # The get request is performed.
    lead_form = LeadComprehensiveForm()
    mobile_formset = MobileNumberFormSet(prefix='mobile')
    email_formset = EmailFormSet(prefix='email')
    address_form = LeadAddressForm()

    context = {
        'lead_form': lead_form,
        'mobile_formset': mobile_formset,
        'email_formset': email_formset,
        'address_form': address_form
    }

    return render(request, 'leads/forms/lead_create.html', context)


def hx_edit_lead(request: HttpRequest, pk: int):
    """
    Edit an existing lead. If not found, return an HTMX response
    with an error message.
    """

    lead_qs = LeadMaster.objects.filter(pk=pk)

    if not lead_qs.exists():
        # Handling the case with custom error message.
        res = render(request, '', status=404)

        return trigger_client_event(res, "message", 'Lead doesn\'t exist!')

    lead = lead_qs.first()

    if request.method == "POST":
        # Binding the submitted data to the form.
        lead_form = LeadComprehensiveForm(request.POST, instance=lead)
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

            return render(request, '')
        else:
            # The invalid response with error messages is returned.
            context = {
                'lead_form': lead_form,
                'mobile_formset': mobile_formset,
                'email_formset': email_formset
            }

            return render(request, '', context)


def hx_leads_table(request: HttpRequest) -> HttpResponse:
    """
    Returns Partial table html containing leads.
    """

    leads = LeadMaster.objects.prefetch_related(
        Prefetch(
            'mobile_numbers',
            queryset=LeadMobileNumberMaster.objects.order_by('id')[:1],
            to_attr='first_mobile'
        ),
        Prefetch(
            'emails',
            queryset=LeadEmailAddressMaster.objects.order_by('id')[:1],
            to_attr='first_email'
        )
    ).order_by('-created_at')
    context = {
        'leads': leads
    }

    return render(
        request, 'leads/tables/leads.html',
        context=context
    )


def hx_lead_mobile_table(request: HttpRequest, lead_id: int) -> HttpResponse:
    """
    A lead Mobile table.
    """

    mobile_numbers = LeadMobileNumberMaster.objects.filter(lead=lead_id)
    lead_id = mobile_numbers.first().lead.id

    context = {
        'mobile_numbers': mobile_numbers,
        'lead_id': lead_id
    }

    return render(request,
                  'leads/tables/mobile_numbers.html',
                  context)


@require_http_methods(['DELETE', 'POST'])
def hx_lead_mobile_delete(request: HttpRequest, pk: int) -> HttpResponse:
    """
    Deleteing the mobile number
    """

    mobile_obj = LeadMobileNumberMaster.objects.filter(pk=pk)

    if not mobile_obj.exists():
        res = HttpResponse()
        res = trigger_client_event(
            res, "message", {
                'level': 'error',
                'message': 'Cannot find the mobile number.'
            })
        return res

    mobile_obj = mobile_obj.first()
    lead_id = mobile_obj.lead
    mobile_obj.delete()

    context = {
        'lead_id': lead_id.id,
        'mobile_numbers': LeadMobileNumberMaster.objects.filter(
            lead=lead_id.id)
    }

    res = render(
        request,
        'leads/tables/mobile_numbers.html',
        context
    )
    res = trigger_client_event(
        res, "message", {
            'level': 'success',
            'message': 'Deleted Mobile Number Successfully!'
        })
    res = trigger_client_event(
        res, 'lead_mobile_added'
    )

    return res


def hx_mobile_table_form(request: HttpRequest) -> HttpResponse:
    """
    Enables us to create mobile number on table dynamically.
    """

    form = LeadMobileNumberTableForm()

    if request.method == "POST":
        lead_id = request.POST.get('lead')[0]
        lead_obj = LeadMaster.objects.get(id=lead_id)
        form = LeadMobileNumberTableForm(request.POST)

        if form.is_valid():
            mob_obj = form.save(commit=False)

            mob_obj.lead = lead_obj
            mob_obj.save()

            res = HttpResponse()
            res = trigger_client_event(
                res, "message", {
                    'level': 'success',
                    'message': 'Lead Created Successfully!'
                })
            res = trigger_client_event(
                res, 'lead_mobile_added'
            )

            return res
        else:
            context = {
                'form': form
            }

            res = render(
                request,
                'leads/forms/mobile_number_table.html', context=context
            )
            res = trigger_client_event(
                res, "message", "Error adding mobile number.")

            return res

    context = {
        'form': form
    }

    return render(
        request, 'leads/forms/mobile_number_table.html', context=context)


def hx_email_table_form(request: HttpRequest) -> HttpResponse:
    """
    Enables us to create email addresses dynamically on the table.
    """

    form = LeadEmailAddressTableForm()

    if request.method == "POST":
        lead_id = request.POST.get('lead')[0]
        lead_obj = LeadMaster.objects.get(id=lead_id)
        form = LeadEmailAddressTableForm(request.POST)

        if form.is_valid():
            email_obj = form.save(commit=False)

            email_obj.lead = lead_obj
            email_obj.save()

            res = HttpResponse()
            res = trigger_client_event(
                res, "message", {
                    'level': 'success',
                    'message': 'Email Added Successfully!'
                })
            res = trigger_client_event(
                res, 'lead_email_added'
            )

            return res
        else:
            context = {
                'form': form
            }

            res = render(
                request,
                'leads/forms/email_address_table.html', context=context
            )
            res = trigger_client_event(
                res, "message", "Error adding email address.")

            return res

    context = {
        'form': form
    }

    return render(
        request, 'leads/forms/email_address_table.html', context=context)


def hx_lead_email_table(request: HttpRequest, lead_id: int) -> HttpResponse:
    """
    A lead Email Address table.
    """

    email_addresses = LeadEmailAddressMaster.objects.filter(lead=lead_id)
    lead_id = email_addresses.first().lead.id if email_addresses else lead_id

    context = {
        'email_addresses': email_addresses,
        'lead_id': lead_id
    }

    return render(request,
                  'leads/tables/emails.html',
                  context)


@require_http_methods(['DELETE', 'POST'])
def hx_lead_email_delete(request: HttpRequest, pk: int) -> HttpResponse:
    """
    Deleting an email address.
    """

    email_obj = LeadEmailAddressMaster.objects.filter(pk=pk)

    if not email_obj.exists():
        res = HttpResponse()
        res = trigger_client_event(
            res, "message", {
                'level': 'error',
                'message': 'Cannot find the email address.'
            })
        return res

    email_obj = email_obj.first()
    lead_id = email_obj.lead
    email_obj.delete()

    context = {
        'lead_id': lead_id.id,
        'email_addresses': LeadEmailAddressMaster.objects.filter(lead=lead_id.id)
    }

    res = render(
        request,
        'leads/tables/emails.html',
        context
    )
    res = trigger_client_event(
        res, "message", {
            'level': 'success',
            'message': 'Deleted Email Address Successfully!'
        })
    res = trigger_client_event(
        res, 'lead_email_deleted'
    )

    return res
