from django.urls import path

from . import views


urlpatterns = [
    # Services URLs
    path('services/', views.services_view, name='services'),
    path('services/<uuid:uuid>/', views.service_detail_view, name='service-detail'),
    path('hx/services/create/', views.hx_create_service, name='hx-create-service'),
    path('hx/services/<uuid:uuid>/edit/', views.hx_edit_service, name='hx-edit-service'),
    path('hx/services/<uuid:uuid>/dt/edit/', views.service_detail_edit_view, name='service-detail-edit'),
    path('hx/services/<uuid:uuid>/delete/', views.hx_delete_service, name='hx-delete-service'),
    path('hx/services/table/', views.hx_services_table, name='hx-services-table'),
    
    # Products URLs
    path('products/', views.products_view, name='products'),
    path('products/<uuid:uuid>/', views.product_detail_view, name='product-detail'),
    path('hx/products/create/', views.hx_create_product, name='hx-create-product'),
    path('hx/products/<uuid:uuid>/edit/', views.hx_edit_product, name='hx-edit-product'),
    path('hx/products/<uuid:uuid>/dt/edit/', views.product_detail_edit_view, name='product-detail-edit'),
    path('hx/products/<uuid:uuid>/delete/', views.hx_delete_product, name='hx-delete-product'),
    path('hx/products/table/', views.hx_products_table, name='hx-products-table'),
]