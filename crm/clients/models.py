from django.core.validators import RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from crm.organizations.models import OrganizationMaster
from crm.utils.models import BaseModel

from .querysets import ClientQuerySet


class ClientMaster(BaseModel):
    GENDER_CHOICES = [
        ("M", "Male"),
        ("F", "Female"),
        ("O", "Other"),
    ]

    organization = models.ForeignKey(OrganizationMaster,
                                     on_delete=models.CASCADE)
    first_name = models.CharField(max_length=255)
    middle_name = models.CharField(max_length=255, blank=True, null=True)
    last_name = models.CharField(max_length=255)
    is_lead = models.BooleanField(default=False)
    date_of_birth = models.DateField(blank=True, null=True)
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES)
    is_deleted = models.BooleanField(default=False)

    def get_full_name(self) -> str:
        return f"{self.first_name} {self.middle_name if self.middle_name else ''} {self.last_name}"  # noqa

    def __str__(self):
        return self.get_full_name()

    objects = ClientQuerySet.as_manager()


class ClientMobileNumberMaster(models.Model):
    client = models.ForeignKey(
        ClientMaster,
        on_delete=models.CASCADE, related_name="mobile_numbers")
    mobile_number = models.CharField(max_length=10, unique=True)

    def __str__(self):
        return self.mobile_number


class ClientEmailMaster(models.Model):
    client = models.ForeignKey(
        ClientMaster,
        on_delete=models.CASCADE, related_name="emails")
    email = models.EmailField(unique=True)

    def __str__(self):
        return self.email


class ClientBodyMeasurementMaster(BaseModel):
    client = models.ForeignKey(
        ClientMaster,
        on_delete=models.CASCADE, related_name="body_measurements")
    height = models.FloatField(help_text="Height in cm")
    weight = models.FloatField(help_text="Weight in kg")
    activity_level = models.CharField(max_length=255, blank=True, null=True)
    dietary_restrictions = models.TextField(blank=True, null=True)
    extra_comments = models.TextField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Measurements for {self.client.first_name} {self.client.last_name}"  # noqa


class ClientBodyStatusMaster(BaseModel):
    ACTIVITY_LEVEL_CHOICES = [
        ("Sedentary", _("Sedentary")),
        ("Lightly Active", _("Lightly Active")),
        ("Moderately Active", _("Moderately Active")),
        ("Very Active", _("Very Active")),
    ]

    client = models.ForeignKey(
        ClientMaster, on_delete=models.CASCADE, related_name="body_statuses")
    body_measurements = models.ForeignKey(
        ClientBodyMeasurementMaster,
        on_delete=models.SET_NULL, blank=True, null=True)
    ideal_body_weight = models.FloatField(
        help_text="Ideal weight in kg", blank=True, null=True)
    over_under_weight = models.FloatField(
        help_text="Difference from ideal weight in kg", blank=True, null=True)
    fat_percentage = models.FloatField(
        help_text="Body fat percentage", blank=True, null=True)
    lbm_percentage = models.FloatField(
        help_text="Lean body mass percentage", blank=True, null=True)
    lbm_kg = models.FloatField(
        help_text="Lean body mass in kg", blank=True, null=True)
    protein_required = models.FloatField(
        help_text="Protein required in grams/kg", blank=True, null=True)
    total_protein_required = models.FloatField(
        help_text="Total protein required in grams", blank=True, null=True)
    medical_conditions = models.TextField(blank=True, null=True)
    activity_level = models.CharField(
        max_length=50, choices=ACTIVITY_LEVEL_CHOICES, blank=True, null=True)
    dietary_restrictions = models.TextField(blank=True, null=True)
    extra_comments = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Body Status for {self.client.first_name} {self.client.last_name}"  # noqa


class ClientAddressMaster(BaseModel):
    client = models.ForeignKey(
        ClientMaster, on_delete=models.CASCADE, related_name="addresses")
    flat_building = models.CharField(max_length=100, blank=True, null=True)
    street = models.CharField(max_length=100, blank=True, null=True)
    area = models.CharField(max_length=100, blank=True, null=True)
    landmark = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    pincode = models.CharField(max_length=6, validators=[RegexValidator(
        r'^\d{6}$', message="Enter a valid 6-digit pincode.")],
        blank=True, null=True)
