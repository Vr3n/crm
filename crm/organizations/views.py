from django.contrib.auth.decorators import login_required
from django.forms.models import modelformset_factory
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render

from crm.organizations.forms import OrganizationCreateForm, OrganizationEmailForm, OrganizationMobileForm
from crm.organizations.models import OrganizationEmailMaster, OrganizationMaster, OrganizationMobileNumberMaster

# Create your views here.


@login_required
def organizations_list_view(request: HttpRequest) -> HttpResponse:
    orgs = OrganizationMaster.objects.filter()

    context = {
        "organizations": orgs
    }

    if request.htmx:
        return render(request, "organizations/partials/list.html", context)

    return render(request, "organizations/list.html", context)


@login_required
def hx_organization_create_view(request: HttpRequest) -> HttpResponse:
    if request.method == "POST":
        org_form = OrganizationCreateForm(
            request.POST, request.FILES)

        if org_form.is_valid():
            org = org_form.save(commit=False)
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
                'HX-Trigger': 'organizationsListChanged'
            })
    else:
        org_form = OrganizationCreateForm()

    context = {
        "org_form": org_form,
    }

    return render(request,
                  'organizations/forms/create-organization.html',
                  context=context)
