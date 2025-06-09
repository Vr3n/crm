from django.db import models
from utils.models import BaseModel

# Create your models here.


class ServiceProductAbstract(BaseModel):
    class Meta:
        abstract = True
        verbose_name = "Service Product ABS"
        verbose_name_plural = "Service Products ABS"

    organization = models.ForeignKey(
        "organizations.OrganizationMaster",
        on_delete=models.CASCADE,
        related_name="%(class)ss",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return self.name


class Service(ServiceProductAbstract):
    code = models.CharField(max_length=255,unique=True)
    duration = models.DurationField(blank=True, null=True)
    category = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        verbose_name = "Service"
        verbose_name_plural = "Services"


class Product(ServiceProductAbstract):
    sku = models.CharField(max_length=100, unique=True)
    weight = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    dimensions = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        verbose_name = "Product"
        verbose_name_plural = "Products"


class Inventory(BaseModel):
    organization = models.ForeignKey(
        "organizations.OrganizationMaster",
        on_delete=models.CASCADE,
        related_name="inventories",
    )
    product = models.OneToOneField(
        Product, on_delete=models.CASCADE, related_name="inventory"
    )
    quantity_in_stock = models.IntegerField(default=0)
    location = models.CharField(max_length=255, blank=True, null=True)
    last_stock_update = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Inventory"
        verbose_name_plural = "Inventories"


class Order(BaseModel):
    organization = models.ForeignKey(
        "organizations.OrganizationMaster",
        on_delete=models.CASCADE,
        related_name="orders",
    )
    lead = models.ForeignKey(
        "leads.LeadMaster", on_delete=models.CASCADE, related_name="orders"
    )
    order_date = models.DateTimeField(auto_now_add=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    status = models.CharField(
        max_length=50, blank=True, null=True
    )  # e.g., 'Pending', 'Confirmed', 'Shipped', 'Delivered'

    def __str__(self):
        return f"Order for {self.lead.get_full_name()}"

    class Meta:
        verbose_name = "Order"
        verbose_name_plural = "Orders"


class OrderLineItem(BaseModel):
    organization = models.ForeignKey(
        "organizations.OrganizationMaster",
        on_delete=models.CASCADE,
        related_name="order_line_items",
    )
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="line_items"
    )
    service = models.ForeignKey(
        "logistics.Service",
        on_delete=models.CASCADE,
        related_name="order_line_items",
        null=True,
        blank=True,
    )
    product = models.ForeignKey(
        "logistics.Product",
        on_delete=models.CASCADE,
        related_name="order_line_items",
        null=True,
        blank=True,
    )
    quantity = models.IntegerField(default=1)
    price_at_purchase = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        if self.service:
            return f"{self.quantity} x {self.service.name} in Order #{self.order.id}"
        elif self.product:
            return f"{self.quantity} x {self.product.name} in Order #{self.order.id}"
        return f"Item in Order #{self.order.id}"

    class Meta:
        verbose_name = "Order Line Item"
        verbose_name_plural = "Order Line Items"
