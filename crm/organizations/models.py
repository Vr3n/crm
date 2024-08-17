from django.db import models
from django.conf import settings

from crm.utils.models import BaseModel

# Create your models here.


class OrganizationMaster(BaseModel):
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE
    )

    admins = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="admin_in_organizations",
        blank=True,
    )

    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="organizations",
        blank=True
    )

    description = models.TextField(blank=True)

    logo = models.ImageField(upload_to="organizations/logos/",
                             blank=True,
                             null=True)

    def all_members(self) -> models.QuerySet:
        """
        Returns all members including owner and admins.
        """

        return self.members.all() | self.admins.all() | self.owner

    def __str__(self) -> str:
        return self.name


class OrganizationAddressMaster(BaseModel):
    organization = models.ForeignKey(
        OrganizationMaster, on_delete=models.CASCADE)
    address_line_1 = models.TextField()
    address_line_2 = models.TextField()
    address_line_3 = models.TextField()
    address_line_4 = models.TextField()
    state = models.CharField(max_length=255, null=True, blank=True)
    city = models.CharField(max_length=255, null=True, blank=True)
    pincode = models.CharField(max_length=6, null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.organization.name} address."


class OrganizationMobileNumberMaster(BaseModel):
    organization = models.ForeignKey(
        OrganizationMaster, on_delete=models.CASCADE)
    mobile_number = models.CharField(max_length=10)

    def __str__(self) -> str:
        return f"{self.organization.name} ({self.mobile_number})"


class OrganizationEmailMaster(BaseModel):
    organization = models.ForeignKey(
        OrganizationMaster, on_delete=models.CASCADE)
    email = models.EmailField()

    def __str__(self) -> str:
        return f"{self.organization.name} ({self.email})"
