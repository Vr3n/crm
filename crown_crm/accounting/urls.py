from django.urls import path

from . import views

urlpatterns = [
    # Member Types URLs
    path("member-types/", views.member_types_view, name="member-types"),
    path(
        "member-types/<uuid:uuid>/",
        views.member_type_detail_view,
        name="member-type-detail",
    ),
    # HTMX URLs for Member Types
    path(
        "hx/member-types/create/",
        views.hx_create_member_type,
        name="hx-create-member-type",
    ),
    path(
        "hx/member-types/<uuid:uuid>/edit/",
        views.hx_edit_member_type,
        name="hx-edit-member-type",
    ),
    path(
        "hx/member-types/<uuid:uuid>/dt/edit/",
        views.member_type_detail_edit_view,
        name="member-type-detail-edit",
    ),
    path(
        "hx/member-types/<uuid:uuid>/delete/",
        views.hx_delete_member_type,
        name="hx-delete-member-type",
    ),
    path(
        "hx/member-types/table/",
        views.hx_member_types_table,
        name="hx-member-types-table",
    ),
    # Ajax search endpoint for Select2 (membership plans)
    path("search-membership-plan/", views.search_membership_plan_results_view, name="search-membership-plan"),
    # Ajax search endpoint for Select2 (membership plans)
    path("search-plan/", views.search_plan, name="search_plan"),
    # API Endpoint for plan details
    path("api/plans/<uuid:uuid>/", views.get_plan_details, name="api-plan-details"),
    # Membership Plans URLs
    path("membership-plans/", views.membership_plans_view, name="membership-plans"),
    path(
        "membership-plans/<uuid:uuid>/",
        views.membership_plan_detail_view,
        name="membership-plan-detail",
    ),
    # HTMX URLs for Membership Plans
    path(
        "hx/membership-plans/create/",
        views.hx_create_membership_plan,
        name="hx-create-membership-plan",
    ),
    path(
        "hx/membership-plans/<uuid:uuid>/edit/",
        views.hx_edit_membership_plan,
        name="hx-edit-membership-plan",
    ),
    path(
        "hx/membership-plans/<uuid:uuid>/dt/edit/",
        views.membership_plan_detail_edit_view,
        name="membership-plan-detail-edit",
    ),
    path(
        "hx/membership-plans/<uuid:uuid>/delete/",
        views.hx_delete_membership_plan,
        name="hx-delete-membership-plan",
    ),
    path(
        "hx/membership-plans/table/",
        views.hx_membership_plans_table,
        name="hx-membership-plans-table",
    ),
    # Membership Sales URLs
    path("hx/fill-plan/<str:uuid>/", views.hx_fill_plan, name="fill_plan"),
    path(
        "hx/create-membership-sale/",
        views.hx_create_membership_sale,
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
    path("hx/receipts/<uuid:uuid>/create/", views.hx_create_payment_receipt, name="hx-create-payment-receipt"),
    path("hx/receipts/<uuid:uuid>/edit/", views.hx_edit_receipt, name="hx-edit-receipt"),
    path("hx/receipts/<uuid:uuid>/delete/", views.hx_delete_receipt, name="hx-delete-receipt"),
    path("receipts/<uuid:uuid>/download/", views.receipt_pdf, name="receipt-pdf"),
]
