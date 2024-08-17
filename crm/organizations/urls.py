from django.urls import path

from crm.organizations.views import (
    hx_organization_create_view, organizations_list_view)


urlpatterns = [
    path("", organizations_list_view, name="list"),
    path("hx/create/", hx_organization_create_view, name="hx-create"),
]
