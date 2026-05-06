import base64
import logging

from celery import shared_task
from django.core.files.base import ContentFile
from django.template.loader import get_template
from django.utils import timezone

logger = logging.getLogger(__name__)

TERMS_LIST = [
    "NO Refund / Membership Cancellation",
    "Please read, understand and comply with these rules",
    "Right of enrollment and entry is reserved by management",
    "Clients may not participate in workout independently or under personal trainer unless authorized",
    "Clients are required to carry and change their footwear outside in shoe closet.",
]


@shared_task(bind=True, max_retries=3)
def generate_receipt_pdf(self, receipt_uuid: str):
    """
    Generate PDF for a payment receipt asynchronously.
    Uses dedicated 'pdf' queue to avoid blocking other tasks.
    """
    # Import weasyprint inside task to avoid multi-processing issues
    from weasyprint import HTML

    from crown_crm.accounting.models import PaymentReceipt

    # First try: fetch receipt (non-retryable failure)
    try:
        receipt = PaymentReceipt.objects.get(uuid=receipt_uuid)
    except PaymentReceipt.DoesNotExist:
        logger.error(f"Receipt {receipt_uuid} not found")
        return {"status": "error", "message": "Receipt not found"}

    # Second try: everything else (retryable)
    try:
        receipt.pdf_status = "generating"
        receipt.save(update_fields=["pdf_status"])

        organization = receipt.organization
        sale = receipt.sale
        lead = sale.lead

        # Encode logo as base64 data URI to avoid network dependency
        logo_url = None
        if organization.logo:
            try:
                with organization.logo.open() as f:
                    logo_data = f.read()
                    ext = organization.logo.name.split(".")[-1].lower()
                    mime = "image/png" if ext == "png" else "image/jpeg"
                    logo_url = (
                        f"data:{mime};base64,{base64.b64encode(logo_data).decode()}"
                    )
            except Exception as e:
                logger.warning(f"Failed to encode logo: {e}")

        context = {
            "terms_list": TERMS_LIST,
            "organization": organization,
            "receipt": receipt,
            "sale": sale,
            "lead": lead,
            "logo_url": logo_url,
        }

        template = get_template("pdfs/receipt.html")
        html = template.render(context)

        # Generate PDF — no base_url needed since logo is embedded
        pdf_bytes = HTML(string=html).write_pdf()

        # Save to model
        file_name = f"{lead.full_name}-{receipt.receipt_number}-receipt.pdf"
        receipt.pdf_file.save(file_name, ContentFile(pdf_bytes), save=True)
        receipt.pdf_generated_at = timezone.now()
        receipt.pdf_status = "ready"
        receipt.save(update_fields=["pdf_file", "pdf_generated_at", "pdf_status"])

        logger.info(f"Generated PDF for receipt {receipt.uuid}")
        return {"status": "success", "receipt_uuid": str(receipt.uuid)}

    except Exception as exc:
        # On final retry exhausted, mark as failed
        if self.request.retries >= self.max_retries:
            PaymentReceipt.objects.filter(uuid=receipt_uuid).update(pdf_status="failed")
            logger.error(f"PDF generation permanently failed for {receipt_uuid}: {exc}")
            return {"status": "error"}
        # Retry with countdown
        raise self.retry(exc=exc, countdown=5)

