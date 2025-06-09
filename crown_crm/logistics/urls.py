from django.urls import path

from . import views


urlpatterns = [
    path("hx/products/add", views.hx_create_product, name="hx-create-product"),
    path("hx/services/add", views.hx_create_service, name="hx-create-service"),
    path("hx/orders/add", views.hx_create_order, name="hx-create-order"),
]