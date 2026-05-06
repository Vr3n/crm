import pytest
from django.utils import timezone

from crown_crm.leads.models import LeadMaster
from crown_crm.accounting.models import MembershipSale, PaymentReceipt
from crown_crm.organizations.models import OrganizationMaster
from crown_crm.users.models import User


@pytest.fixture
def user(db):
    return User.objects.create_user(email="test@test.com", password="testpass123")


@pytest.fixture
def organization(db, user):
    return OrganizationMaster.objects.create(
        name="Test Org",
        slug="test-org",
        owner=user
    )


@pytest.fixture
def lead(db, organization):
    return LeadMaster.objects.create(
        organization=organization,
        first_name="John",
        last_name="Doe"
    )


@pytest.fixture
def membership_sale(db, lead, organization):
    return MembershipSale.objects.create(
        organization=organization,
        lead=lead,
        duration=MembershipSale.Duration.MONTHLY,
        price=1000,
        membership_start_date=timezone.now().date(),
        membership_end_date=timezone.now().date()
    )


@pytest.fixture
def payment_receipt(db, membership_sale, organization):
    return PaymentReceipt.objects.create(
        organization=organization,
        sale=membership_sale,
        amount=500,
        opening_balance=1000,
        closing_balance=500
    )


class TestLeadSoftDelete:
    def test_delete_soft_deletes_lead(self, lead):
        """Test that delete() performs soft delete."""
        assert lead.is_deleted is False
        lead.delete()
        lead.refresh_from_db()
        assert lead.is_deleted is True
        assert lead.deleted_at is not None

    def test_objects_excludes_deleted(self, lead):
        """Test that objects manager excludes deleted leads."""
        lead.delete()
        assert not LeadMaster.objects.filter(pk=lead.pk).exists()

    def test_all_includes_deleted(self, lead):
        """Test that all manager includes deleted leads."""
        lead.delete()
        assert LeadMaster.all.filter(pk=lead.pk).exists()


class TestMembershipSaleSoftDelete:
    def test_delete_soft_deletes_sale(self, membership_sale):
        """Test that delete() performs soft delete."""
        assert membership_sale.is_deleted is False
        membership_sale.delete()
        membership_sale.refresh_from_db()
        assert membership_sale.is_deleted is True

    def test_objects_excludes_deleted(self, membership_sale):
        """Test that objects manager excludes deleted sales."""
        membership_sale.delete()
        assert not MembershipSale.objects.filter(pk=membership_sale.pk).exists()

    def test_all_includes_deleted(self, membership_sale):
        """Test that all manager includes deleted sales."""
        membership_sale.delete()
        assert MembershipSale.all.filter(pk=membership_sale.pk).exists()


class TestPaymentReceiptSoftDelete:
    def test_delete_soft_deletes_receipt(self, payment_receipt):
        """Test that delete() performs soft delete."""
        assert payment_receipt.is_deleted is False
        payment_receipt.delete()
        payment_receipt.refresh_from_db()
        assert payment_receipt.is_deleted is True

    def test_objects_excludes_deleted(self, payment_receipt):
        """Test that objects manager excludes deleted receipts."""
        payment_receipt.delete()
        assert not PaymentReceipt.objects.filter(pk=payment_receipt.pk).exists()

    def test_all_includes_deleted(self, payment_receipt):
        """Test that all manager includes deleted receipts."""
        payment_receipt.delete()
        assert PaymentReceipt.all.filter(pk=payment_receipt.pk).exists()


class TestCascadeDelete:
    def test_deleting_lead_cascades_to_sales(self, lead, membership_sale):
        """Test that deleting a lead soft deletes all related sales."""
        lead.delete()
        membership_sale.refresh_from_db()
        assert membership_sale.is_deleted is True

    def test_deleting_sale_cascades_to_receipts(self, membership_sale, payment_receipt):
        """Test that deleting a sale soft deletes all related receipts."""
        membership_sale.delete()
        payment_receipt.refresh_from_db()
        assert payment_receipt.is_deleted is True