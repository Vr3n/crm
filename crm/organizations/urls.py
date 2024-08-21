from django.urls import path

from crm.organizations.views import (
    hx_organization_create_view, organization_dashboard_view,
    organization_settings_view, organizations_list_view,
)


urlpatterns = [
    path("", organizations_list_view, name="list"),
    path("<slug:slug>/dashboard/",
         organization_dashboard_view,
         name="dashboard"),
    path("<slug:slug>/settings/",
         organization_settings_view,
         name="settings"),

    # HTMX VIEWS #
    path("hx/create/", hx_organization_create_view, name="hx-create"),
]
