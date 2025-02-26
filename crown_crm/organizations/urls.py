from django.urls import include, path

from crown_crm.organizations.views import (
    hx_organization_create_view, organization_dashboard_view,
    organization_settings_view, organizations_list_view, organizations_navbar_list_view,
)


urlpatterns = [
    path("", organizations_list_view, name="organizations-list"),
    path("<slug:slug>/dashboard/",
         organization_dashboard_view,
         name="organizations-dashboard"),
    path("<slug:slug>/settings/",
         organization_settings_view,
         name="organizations-settings"),
    path("<slug:slug>/leads/", include("crown_crm.leads.urls")),
    path("<slug:slug>/clients/", include("crown_crm.clients.urls")),

    # HTMX VIEWS #
    path("hx/nav-list/", organizations_navbar_list_view, name="hx-nav-organizations-list"),
    path("hx/create/", hx_organization_create_view, name="organizations-hx-create"),
]
