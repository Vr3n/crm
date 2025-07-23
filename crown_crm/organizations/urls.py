from django.urls import include, path

from crown_crm.organizations.views import (
    organization_dashboard_view,
    organization_settings_view,
    organization_settings_update_view,
)


urlpatterns = [
    path("dashboard/",
         organization_dashboard_view,
         name="organizations-dashboard"),
    path("settings/",
         organization_settings_view,
         name="organizations-settings"),
    path("settings/<uuid:uuid>/",
         organization_settings_update_view,
         name="organizations-settings-update"),
    path("leads/", include("crown_crm.leads.urls")),
    path("clients/", include("crown_crm.clients.urls")),
    path("logistics/", include("crown_crm.logistics.urls")),
    path("accounting/", include("crown_crm.accounting.urls")),
]
