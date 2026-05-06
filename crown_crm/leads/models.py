from __future__ import annotations

from typing import TYPE_CHECKING
from django.db import models
from django.core.validators import RegexValidator
from django.conf import settings
from django.urls import reverse
from django.utils import timezone

from crown_crm.organizations.models import OrganizationMaster
from crown_crm.utils.models import ActiveManager, BaseModel

if TYPE_CHECKING:
    from crown_crm.accounting.models import MembershipSale


# Create your models here.
class LeadMaster(BaseModel):
    """
    Represents a lead in the system with basic personal information.

    This model stores core information about leads including their name, gender, and
    organizational affiliation. It serves as the central model for lead management.

    Attributes:
        organization (ForeignKey): Reference to the organization this lead belongs to.
        first_name (str): Lead's first name.
        middle_name (str, optional): Lead's middle name.
        last_name (str): Lead's last name.
        gender (str, optional): Lead's gender, chosen from GENDER_CHOICES.

    Methods:
         full_name -> str: Lead's Full name.
    """

    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"
        TRANSGENDER = "O", "Other"

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        INTERESTED = "INTERESTED", "Interested"
        CONVERTED = "CONVERTED", "Converted"
        DROPPED = "DROPPED", "Dropped"

    organization = models.ForeignKey(
        OrganizationMaster, on_delete=models.CASCADE, related_name="leads"
    )
    first_name = models.CharField(max_length=50)
    middle_name = models.CharField(max_length=50, blank=True, null=True)
    last_name = models.CharField(max_length=50)
    gender = models.CharField(
        max_length=10, choices=Gender.choices, blank=True, null=True
    )
    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.NEW,
        help_text="Current status of the lead",
    )

    @property
    def full_name(self) -> str:
        """Constructs the full name of the lead.

        Returns:
            str: Full name including first, middle (if available), and last name.
        """
        return f"{self.first_name} {self.middle_name if self.middle_name else ''} {self.last_name}"

    def __str__(self) -> str:
        """Returns string representation of the lead.

        Returns:
            str: Full name of the lead.
        """
        return self.full_name

    def get_absolute_url(self):
        return reverse("lead-detail", kwargs={"slug": self.organization.slug, "pk": self.pk})

    # mypy typecheking.
    mobile_numbers: models.QuerySet["LeadMobileNumberMaster"]
    emails: models.QuerySet["LeadEmailAddressMaster"]
    addresses: models.QuerySet["LeadAddressMaster"]
    discussions: models.QuerySet["LeadDiscussionHistory"]
    sources: models.QuerySet["LeadSourceMaster"]
    memberships: models.QuerySet["MembershipSale"]

    # Custom managers
    objects = ActiveManager()  # Returns only active (non-deleted) - default
    all = models.Manager()     # Returns everything including deleted

    def delete(self, *args, **kwargs):
        """Soft delete the lead and all related membership sales."""
        from crown_crm.accounting.models import MembershipSale

        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at"])

        # Also soft delete related memberships
        for sale in self.memberships.all():
            sale.delete()

    class Meta:
        verbose_name = "Lead"
        verbose_name_plural = "Leads"


class LeadMobileNumberMaster(BaseModel):
    """
    Stores mobile numbers associated with a lead.

    This model maintains mobile contact information for leads, ensuring proper
    format validation for mobile numbers.

    Attributes:
        lead (ForeignKey): Reference to the associated lead.
        mobile_number (str): 10-digit mobile number, validated using regex.
    """

    lead = models.ForeignKey(
        LeadMaster, on_delete=models.CASCADE, related_name="mobile_numbers"
    )
    mobile_number = models.CharField(
        max_length=10,
        validators=[
            RegexValidator(r"^\d{10}$", message="Enter a valid 10-digit mobile number.")
        ],
    )

    class Meta:
        verbose_name = "Lead Mobile Number"
        verbose_name_plural = "Lead Mobile Numbers"

    def __str__(self) -> str:
        return f"{self.lead.full_name} - {self.mobile_number}"

    def get_absolute_url(self):
        return reverse("lead-detail", kwargs={"slug": self.lead.organization.slug, "pk": self.lead.pk})


class LeadEmailAddressMaster(BaseModel):
    """Stores email addresses associated with a lead.

    This model maintains email contact information for leads with built-in
    email validation.

    Attributes:
        lead (ForeignKey): Reference to the associated lead.
        email (str): Valid email address.
    """

    lead = models.ForeignKey(
        LeadMaster, on_delete=models.CASCADE, related_name="emails"
    )
    email = models.EmailField()

    class Meta:
        verbose_name = "Lead Email address"
        verbose_name_plural = "Lead Email addresses"

    def __str__(self) -> str:
        """Returns string representation of the lead's email address.

        Returns:
            str: Lead's full name followed by their email address.
        """
        return f"{self.lead.full_name} - {self.email}"

    def get_absolute_url(self):
        return reverse("lead-detail", kwargs={"slug": self.lead.organization.slug, "pk": self.lead.pk})


class LeadAddressMaster(BaseModel):
    """Stores physical addresses associated with a lead.

    This model maintains detailed address information including building details,
    street information, and location specifics.

    Attributes:
        lead (ForeignKey): Reference to the associated lead.
        flat_building (str): Flat or building name/number.
        street (str): Street name or number.
        area (str): Area or locality name.
        landmark (str, optional): Nearby landmark for easy location.
        state (str, optional): State name.
        city (str, optional): City name.
        pincode (str): 6-digit pincode, validated using regex.
    """

    lead = models.ForeignKey(
        LeadMaster, on_delete=models.CASCADE, related_name="addresses"
    )
    flat_building = models.CharField(max_length=100)
    street = models.CharField(max_length=100)
    area = models.CharField(max_length=100)
    landmark = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    pincode = models.CharField(
        max_length=6,
        validators=[
            RegexValidator(r"^\d{6}$", message="Enter a valid 6-digit pincode.")
        ],
    )

    def __str__(self) -> str:
        """Returns string representation of the lead's address.

        Returns:
            str: Lead's full name followed by 'address'.
        """
        return f"{self.lead.full_name} address"

    def get_absolute_url(self):
        return reverse("lead-detail", kwargs={"slug": self.lead.organization.slug, "pk": self.lead.pk})


class LeadDiscussionHistory(BaseModel):
    """Tracks discussion history and notes for each lead.

    This model maintains a record of discussions and interactions with the lead,
    allowing for detailed conversation tracking.

    Attributes:
        lead (ForeignKey): Reference to the associated lead.
        discussion_notes (str): Detailed notes about the discussion or interaction.
    """

    lead = models.ForeignKey(
        LeadMaster, on_delete=models.CASCADE, related_name="discussions"
    )
    discussion_notes = models.TextField()

    def __str__(self) -> str:
        """Returns string representation of the discussion history.

        Returns:
            str: Descriptive text indicating this is discussion history for the lead.
        """
        return f"Discussion history for {self.lead.full_name}"

    def get_absolute_url(self):
        return reverse("lead-detail", kwargs={"slug": self.lead.organization.slug, "pk": self.lead.pk})


class LeadSourceMaster(BaseModel):
    """Tracks the source of leads and related information.

    This model maintains information about where the lead came from and additional
    details about the source.

    Attributes:
        lead (ForeignKey): Reference to the associated lead.
        source (str): Name or identifier of the lead source.
        description (str, optional): Detailed description of the lead source.
    """

    lead = models.ForeignKey(
        LeadMaster, on_delete=models.CASCADE, related_name="sources"
    )
    source = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)

    def __str__(self) -> str:
        """Returns string representation of the lead source.

        Returns:
            str: Lead's name followed by the source information.
        """
        return f"{self.lead.full_name} from {self.source}"

    def get_absolute_url(self):
        return reverse("lead-detail", kwargs={"slug": self.lead.organization.slug, "pk": self.lead.pk})


class LeadFollowUp(models.Model):
    """
    Represents a single follow-up action for a lead.
    Tracks communication touchpoint, scheduled time, outcome, and notes.
    """

    class Channel(models.TextChoices):
        PHONE = "phone", "Phone"
        WHATSAPP = "whatsapp", "WhatsApp"
        SMS = "sms", "SMS"
        EMAIL = "email", "Email"
        SOCIAL = "social", "Social Media"
        IN_PERSON = "in_person", "In Person"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        SKIPPED = "skipped", "Skipped"
        FAILED = "failed", "Failed"

    lead = models.ForeignKey(
        "leads.LeadMaster", on_delete=models.CASCADE, related_name="followups"
    )
    scheduled_for = models.DateTimeField(help_text="When to follow up")
    completed_at = models.DateTimeField(blank=True, null=True)

    channel = models.CharField(max_length=20, choices=Channel.choices)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    outcome = models.TextField(
        blank=True, null=True, help_text="What happened during the follow-up?"
    )
    notes = models.TextField(
        blank=True, null=True, help_text="CRM user's personal observations"
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )

    class Meta:
        ordering = ["-scheduled_for"]
        verbose_name = "Lead Follow-Up"
        verbose_name_plural = "Lead Follow-Ups"

    def mark_completed(self, outcome: str = "") -> None:
        """Mark the follow-up as completed."""
        self.status = self.Status.COMPLETED
        self.completed_at = timezone.now()
        self.outcome = outcome
        self.save(update_fields=["status", "completed_at", "outcome"])

    def __str__(self) -> str:
        return f"{self.lead.full_name} - {self.channel} on {self.scheduled_for.strftime('%d-%m-%Y %H:%M')}"

    def get_absolute_url(self):
        return reverse("lead-detail", kwargs={"slug": self.lead.organization.slug, "pk": self.lead.pk})
