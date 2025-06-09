from django.urls import path

from . import views

urlpatterns = [
    path('', views.all_leads_view, name="all-leads"),
    path('<uuid:pk>/', views.lead_detail_view, name="lead-detail"),

    # HTMX VIEWS HERE.
    path('hx/create/', views.hx_create_lead, name="hx-create-lead"),
    path('hx/<uuid:pk>/delete/', views.hx_lead_delete_view,
         name="hx-delete-lead"),
    path('hx/all-leads/table/', views.hx_leads_table, name="hx-leads-table"),

    # HX Mobile views.
    path('hx/mobile-numbers/table/<uuid:lead_id>/', views.hx_lead_mobile_table,
         name="hx-lead-mobile-number-table"),
    path('hx/mobile-numbers/table/create/', views.hx_mobile_table_form,
         name="hx-leads-mobile-numbers"),
    path('hx/mobile-numners/table/delete/<uuid:pk>', views.hx_lead_mobile_delete,
         name="hx-leads-mobile-table-delete"),
    path("hx/add-mobile-form/", views.hx_add_mobile_form, name="hx-add-mobile-form"),

    # HX Email views.
    path('hx/email-addresses/table/<uuid:lead_id>/', views.hx_lead_email_table,
         name="hx-lead-email-address-table"),
    path('hx/email-addresses/table/create/', views.hx_email_table_form,
         name="hx-leads-email-addresses"),
    path('hx/email-addresses/table/delete/<uuid:pk>/', views.hx_lead_email_delete,
         name="hx-leads-email-table-delete"),

]