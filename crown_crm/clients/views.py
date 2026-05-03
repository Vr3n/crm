from django.db.models import Prefetch
from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_http_methods
from django_htmx.http import trigger_client_event

from crown_crm.utils.decorators import organization_slug_required

from .forms import (
    ClientAddressForm, ClientComprehensiveForm, ClientEmailAddressTableForm,
    ClientEmailFormSet, ClientMobileNumberFormSet, ClientMobileNumberTableForm
)
from .models import (
    ClientEmailMaster, ClientMaster, ClientMobileNumberMaster)

# Create your views here.


@login_required
@organization_slug_required
def client_list_view(request):
    clients = ClientMaster.objects.filter(organization=request.organization).active() \
        .prefetch_related("mobile_numbers", "emails")
    context = {"clients": clients}
    return render(request, "clients/all_clients.html", context)


@login_required
@organization_slug_required
def client_detail_view(request: HttpRequest, pk: int):
    client = get_object_or_404(ClientMaster, pk=pk)

    context = {
        'client': client
    }

    return render(request, 'clients/client_detail.html', context=context)


@login_required
@organization_slug_required
def hx_clients_table(request: HttpRequest) -> HttpResponse:
    """
    Returns Partial table html containing clients.
    """

    clients = ClientMaster.objects.filter(organization=request.organization).prefetch_related(
        Prefetch(
            'mobile_numbers',
            queryset=ClientMobileNumberMaster.objects.order_by(
                '-created_at')[:1],
            to_attr='first_mobile'
        ),
        Prefetch(
            'emails',
            queryset=ClientEmailMaster.objects.order_by('-created_at')[:1],
            to_attr='first_email'
        )
    ).order_by('-created_at')
    context = {
        'clients': clients
    }

    return render(
        request, 'clients/tables/clients.html',
        context=context
    )


@login_required
@organization_slug_required
def hx_create_client(request: HttpRequest):
    """
    Handle HTMX request to create a new client.
    """

    form_template = "clients/forms/client_create.html"

    if request.method == "POST":
        client_form = ClientComprehensiveForm(request.POST)
        mobile_formset = ClientMobileNumberFormSet(request.POST)
        email_formset = ClientEmailFormSet(request.POST)
        address_form = ClientAddressForm(request.POST)

        if (
            client_form.is_valid()
            and mobile_formset.is_valid()
            and email_formset.is_valid()
            and address_form.is_valid()
        ):
            client = client_form.save()
            mobile_formset.instance = client
            mobile_formset.save()
            email_formset.instance = client
            email_formset.save()
            address_form.instance = client
            address_form.save()

            response = render(request, form_template)
            response = trigger_client_event(
                response, "message", {
                    'level': 'success',
                    'message': 'Client saved succesfully!'
                })
            response = trigger_client_event(
                response, "client-created"
            )

            return response

        else:
            context = {
                'client_form': client_form,
                'mobile_formset': mobile_formset,
                'email_formset': email_formset,
                'address_form': address_form,
            }
            res = render(request, form_template, context)
            return trigger_client_event(
                res, "message", {
                    'level': 'error',
                    'message': 'Error during saving the client!'
                })

    else:
        client_form = ClientComprehensiveForm()
        mobile_formset = ClientMobileNumberFormSet()
        email_formset = ClientEmailFormSet()
        address_form = ClientAddressForm()

        context = {
            'client_form': client_form,
            'mobile_formset': mobile_formset,
            'email_formset': email_formset,
            'address_form': address_form,
        }
        return render(request, form_template, context)


@require_http_methods(["DELETE"])
@login_required
@organization_slug_required
def hx_delete_client_view(request, pk):
    client_obj = ClientMaster.objects.filter(pk=pk)

    if not client_obj.exists():
        res = HttpResponse()
        res = trigger_client_event(
            res, "message", {
                'level': 'error',
                'message': 'Cannot find the client.'
            })
        return res

    client_obj = client_obj.first()
    client_obj.is_deleted = True
    client_obj.save()

    # Filter active clients (not deleted)
    context = {
        'clients': ClientMaster.objects.filter(organization=request.organization).active()
    }

    res = render(request, 'clients/tables/clients.html', context)

    # Send success message
    res = trigger_client_event(
        res, "message", {
            'level': 'success',
            'message': 'Deleted Client Successfully!'
        })

    # Refresh table via HTMX event
    res = trigger_client_event(
        res, 'client_deleted'
    )

    return res


@login_required
@organization_slug_required
def hx_client_mobile_table(
        request: HttpRequest, client_id: int) -> HttpResponse:
    """
    A Client Mobile table.
    """
    mobile_numbers = ClientMobileNumberMaster.objects.filter(client=client_id)
    client_id = mobile_numbers.first().client.uuid if mobile_numbers else client_id  # noqa

    context = {
        'mobile_numbers': mobile_numbers,
        'client_id': client_id
    }

    return render(request, 'clients/tables/mobile_numbers.html', context)


@require_http_methods(['DELETE', 'POST'])
@login_required
@organization_slug_required
def hx_client_mobile_delete(request: HttpRequest, pk: int) -> HttpResponse:
    """
    Deleting the mobile number for a client.
    """
    mobile_obj = ClientMobileNumberMaster.objects.filter(pk=pk)

    if not mobile_obj.exists():
        res = HttpResponse()
        res = trigger_client_event(
            res, "message", {
                'level': 'error',
                'message': 'Cannot find the mobile number.'
            })
        return res

    mobile_obj = mobile_obj.first()
    client_id = mobile_obj.client
    mobile_obj.delete()

    context = {
        'client_id': client_id.uuid,
        'mobile_numbers': ClientMobileNumberMaster.objects.filter(
            client=client_id.uuid)
    }

    res = render(request, 'clients/tables/mobile_numbers.html', context)
    res = trigger_client_event(
        res, "message", {
            'level': 'success',
            'message': 'Deleted Mobile Number Successfully!'
        })
    res = trigger_client_event(res, 'client_mobile_deleted')

    return res


@login_required
@organization_slug_required
def hx_client_mobile_table_form(request: HttpRequest) -> HttpResponse:
    """
    Enables adding client mobile numbers dynamically on the table.
    """
    form = ClientMobileNumberTableForm()

    if request.method == "POST":
        client_id = request.POST.get('client')[0]
        client_obj = ClientMaster.objects.get(uuid=client_id)
        form = ClientMobileNumberTableForm(request.POST)

        if form.is_valid():
            mob_obj = form.save(commit=False)
            mob_obj.client = client_obj
            mob_obj.save()

            res = HttpResponse()
            res = trigger_client_event(
                res, "message", {
                    'level': 'success',
                    'message': 'Mobile Number Added Successfully!'
                }
            )
            res = trigger_client_event(res, 'client_mobile_added')
            return res

        context = {'form': form}
        res = render(
            request, 'clients/forms/mobile_number_table.html', context)
        res = trigger_client_event(
            res, "message", "Error adding mobile number.")
        return res

    return render(
        request, 'clients/forms/mobile_number_table.html', {'form': form})


@login_required
@organization_slug_required
def hx_client_email_table(
        request: HttpRequest, client_id: int) -> HttpResponse:
    """
    A Client Email Address table.
    """
    email_addresses = ClientEmailMaster.objects.filter(client=client_id)
    client_id = email_addresses.first().client.uuid if email_addresses else client_id  # noqa

    context = {
        'email_addresses': email_addresses,
        'client_id': client_id
    }

    return render(request, 'clients/tables/emails.html', context)


@login_required
@organization_slug_required
@require_http_methods(['DELETE', 'POST'])
def hx_client_email_delete(request: HttpRequest, pk: int) -> HttpResponse:
    """
    Deleting an email address for a client.
    """
    email_obj = ClientEmailMaster.objects.filter(pk=pk)

    if not email_obj.exists():
        res = HttpResponse()
        res = trigger_client_event(
            res, "message", {'level': 'error', 'message': 'Cannot find the email address.'})
        return res

    email_obj = email_obj.first()
    client_id = email_obj.client
    email_obj.delete()

    context = {
        'client_id': client_id.uuid,
        'emails': ClientEmailMaster.objects.filter(client=client_id.uuid)
    }

    res = render(request, 'clients/tables/emails.html', context)
    res = trigger_client_event(res, "message", {
                               'level': 'success',
                               'message': 'Deleted Email Address Successfully!'
                               })
    res = trigger_client_event(res, 'client_email_deleted')

    return res


@login_required
@organization_slug_required
def hx_client_email_table_form(request: HttpRequest) -> HttpResponse:
    """
    Enables adding client email addresses dynamically on the table.
    """
    form = ClientEmailAddressTableForm()

    if request.method == "POST":
        client_id = request.POST.get('client')[0]
        client_obj = ClientMaster.objects.get(uuid=client_id)
        form = ClientEmailAddressTableForm(request.POST)

        if form.is_valid():
            email_obj = form.save(commit=False)
            email_obj.client = client_obj
            email_obj.save()

            res = HttpResponse()
            res = trigger_client_event(
                res, "message",
                {'level': 'success', 'message': 'Email Added Successfully!'})
            res = trigger_client_event(res, 'client_email_added')
            return res

        context = {'form': form}
        res = render(
            request, 'clients/forms/email_address_table.html', context)
        res = trigger_client_event(
            res,
            "message",
            {'level': 'error', 'message': 'Problem saving email.'})
        return res

    return render(
        request,
        'clients/forms/email_address_table.html',
        {'form': form})
