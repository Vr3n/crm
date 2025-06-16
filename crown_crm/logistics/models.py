from django.db import models
from crown_crm.utils.models import BaseModel

# Create your models here.

class CategorySP(BaseModel):
    category = models.CharField(max_length=255)

    def __str__(self) -> str:
        return self.category

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
    category = models.ManyToManyField(CategorySP, blank=True)

    def __str__(self):
        return self.name


class Service(ServiceProductAbstract):
    """Represents a service offering in the system.

    This model stores detailed information about services including pricing,
    and related information. It serves as the central model for service management.

    Attributes:
        code (str): Unique service code.
        description (str): Detailed description of the service.
        price (Decimal): Service price.
        category (ManyToMany): Categories associated with the service.
        organization (ForeignKey): Organization this service belongs to.
        status (str): Current status of the service.
        is_active (bool): Whether the service is currently active.
    """
    code = models.CharField(
        max_length=255,
        unique=True,
        help_text="Unique identifier for this service"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this service is currently available"
    )

    class Meta:
        verbose_name = "Service"
        verbose_name_plural = "Services"
        ordering = ['-updated_at', '-created_at']

    def __str__(self):
        """Returns string representation of the service."""
        return f"{self.name} - {self.code}"

    def get_status_display(self):
        """Returns the human-readable status of the service."""
        return "Active" if self.is_active else "Inactive"

    def is_available(self):
        """Checks if the service is currently available."""
        return self.is_active


class Product(ServiceProductAbstract):
    sku = models.CharField(max_length=100, unique=True)
    hsn = models.CharField(max_length=6, null=True, blank=True)
    
    class Meta:
        verbose_name = "Product"
        verbose_name_plural = "Products"
        ordering = ['-updated_at', '-created_at']


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
    price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        if self.service:
            return f"{self.quantity} x {self.service.name} in Order #{self.order.id}"
        elif self.product:
            return f"{self.quantity} x {self.product.name} in Order #{self.order.id}"
        return f"Item in Order #{self.order.id}"

    class Meta:
        verbose_name = "Order Line Item"
        verbose_name_plural = "Order Line Items"
