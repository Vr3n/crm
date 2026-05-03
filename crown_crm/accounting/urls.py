from django.urls import path

from . import views

urlpatterns = [
    # Membership Sales URLs
    path(
        "hx/create-membership-sale/",
        views.HxCreateMembershipSaleView.as_view(),
        name="hx-create-membership-sale",
    ),
    # Membership Sales URLs
    path("sales/", views.sales_view, name="sales"),
    path("sales/create/", views.sale_create_view, name="sale-create"),
    path("sales/<uuid:uuid>/", views.sale_detail_view, name="sale-detail"),
    # HTMX endpoints
    path("hx/sales/table/", views.hx_sales_table, name="hx-sales-table"),
    path("hx/sales/<uuid:uuid>/delete/", views.hx_sale_delete, name="hx-sale-delete"),
    path(
        "hx/sales/<uuid:uuid>/create-receipt/",
        views.hx_create_payment_receipt,
        name="hx-create-payment-receipt",
    ),
    path("hx/sales/table/", views.hx_sales_table, name="hx-sales-table"),
    path("hx/sales/<uuid:uuid>/", views.hx_sale_detail, name="hx-sale-detail"),
    # Payment Receipt URLs
    path("receipts/", views.receipt_list, name="receipts"),
    path("receipts/table/", views.hx_receipt_table, name="hx-receipts-table"),
    path("receipts/<uuid:uuid>/", views.receipt_detail, name="receipt-detail"),
    path(
        "hx/receipts/<uuid:uuid>/create/",
        views.hx_create_payment_receipt,
        name="hx-create-payment-receipt",
    ),
    path(
        "hx/receipts/<uuid:uuid>/edit/", views.hx_edit_receipt, name="hx-edit-receipt"
    ),
    path(
        "hx/receipts/<uuid:uuid>/delete/",
        views.hx_delete_receipt,
        name="hx-delete-receipt",
    ),
    path("receipts/<uuid:uuid>/download/", views.receipt_pdf, name="receipt-pdf"),
]
