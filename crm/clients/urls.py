from django.urls import path
from . import views

urlpatterns = [
    path("", views.client_list_view, name="client-list"),
    path('<int:pk>/', views.client_detail_view, name="client-detail"),

    # Hx views.
    path('hx/all-clients/table/',
         views.hx_clients_table, name="hx-clients-table"),

    path("hx/create/", views.hx_create_client, name="hx-create-client"),
    path('hx/delete/<int:pk>/', views.hx_delete_client_view,
         name="hx-delete-client"),

    # HX Mobile views.
    path('hx/mobile-numbers/table/<int:client_id>/',
         views.hx_client_mobile_table,
         name="hx-client-mobile-number-table"),
    path('hx/mobile-numbers/table/create/',
         views.hx_client_mobile_table_form,
         name="hx-clients-mobile-numbers"),
    path('hx/mobile-numners/table/delete/<int:pk>',
         views.hx_client_mobile_delete,
         name="hx-clients-mobile-table-delete"),

    # HX Email views.
    path('hx/email-addresses/table/<int:client_id>/',
         views.hx_client_email_table,
         name="hx-client-email-address-table"),
    path('hx/email-addresses/table/create/',
         views.hx_client_email_table_form,
         name="hx-clients-email-addresses"),
    path('hx/email-addresses/table/delete/<int:pk>/',
         views.hx_client_email_delete,
         name="hx-clients-email-table-delete"),
]
