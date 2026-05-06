# Receipt PDF Celery Generation Plan

## Problem

Currently, `receipt_pdf` in `crown_crm/accounting/views.py:615` generates PDFs **synchronously** using WeasyPrint. This:

- Blocks the HTTP request (user waits 2-10 seconds)
- Consumes CPU on the web server (inefficient)
- Causes timeouts under load
- WeasyPrint is CPU-intensive — better suited for a separate worker

## Solution

Move PDF generation to a Celery task, return immediately with a task ID, and have the frontend poll/download the prepared PDF.

---

## Architecture

```
request → view returns task_id immediately
         ↓
    Celery task generates PDF → stores in Receipt.pdf_file (FileField)
         ↓
    frontend polls/redirects → serves static PDF
```

---

## Step-by-Step Implementation

### Step 1: Add fields to `PaymentReceipt` model

**File:** `crown_crm/accounting/models.py`

```python
class PaymentReceipt(models.Model):
    # ... existing fields ...
    pdf_file = models.FileField(
        upload_to="receipts/pdfs/",
        blank=True,
        null=True,
    )
    pdf_generated_at = models.DateTimeField(null=True, blank=True)
    pdf_status = models.CharField(
        max_length=20,
        choices=[
            ("none", "None"),
            ("pending", "Pending"),
            ("generating", "Generating"),
            ("ready", "Ready"),
            ("failed", "Failed"),
        ],
        default="none",
    )
```

**Why:** `pdf_status` prevents race conditions where two requests dispatch duplicate tasks.

### Step 2: Create Celery task for PDF generation

**File:** `crown_crm/accounting/tasks.py`

```python
import logging
import base64
from celery import shared_task
from django.core.files.base import ContentFile
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def generate_receipt_pdf(self, receipt_uuid: str):
    """
    Generate PDF for a payment receipt asynchronously.
    Uses dedicated 'pdf' queue to avoid blocking other tasks.
    """
    from crown_crm.accounting.models import PaymentReceipt
    from django.template.loader import get_template
    from weasyprint import HTML

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

        terms_list = [
            "NO Refund / Membership Cancellation",
            "Please read, understand and comply with these rules",
            "Right of enrollment and entry is reserved by management",
            "Transfer fees of 1000/- will be charged under conditions",
            "Clients may not participate in workout independently or under personal trainer unless authorized",
            "Clients are required to carry and change their footwear outside in shoe closet.",
        ]

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
                    logo_url = f"data:{mime};base64,{base64.b64encode(logo_data).decode()}"
            except Exception as e:
                logger.warning(f"Failed to encode logo: {e}")

        context = {
            "terms_list": terms_list,
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
        file_name = f"receipt-{lead.full_name}-{receipt.receipt_number}.pdf"
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
```

**Queue config:**

```python
# In celery config
task_routes = {
    "crown_crm.accounting.tasks.generate_receipt_pdf": {"queue": "pdf"},
}
```

### Step 3: Modify view with atomic update

**File:** `crown_crm/accounting/views.py`

```python
from django.db.models import Q
from crown_crm.accounting.tasks import generate_receipt_pdf


def receipt_pdf(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    receipt = get_object_or_404(
        PaymentReceipt, uuid=uuid, organization=request.organization
    )

    # Check staleness: regenerate if receipt was updated after PDF
    is_stale = (
        receipt.pdf_generated_at and receipt.updated_at
        and receipt.pdf_generated_at < receipt.updated_at
    )

    # Return existing fresh PDF
    if receipt.pdf_status == "ready" and receipt.pdf_file and not is_stale:
        response = HttpResponse(receipt.pdf_file, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{receipt.pdf_file.name}"'
        return response

    # Atomic update: only claim if truly idle
    updated = PaymentReceipt.objects.filter(
        uuid=uuid,
        pdf_status__in=["none", "failed"],
    ).update(pdf_status="pending")

    if not updated:
        # Another request already claimed it — read current status
        receipt.refresh_from_db()
        return JsonResponse({
            "status": receipt.pdf_status,
            "receipt_uuid": str(receipt.uuid),
        })

    # Dispatch task
    generate_receipt_pdf.delay(str(uuid))

    return JsonResponse({
        "status": "pending",
        "receipt_uuid": str(receipt.uuid),
    })
```

### Step 4: Poll endpoint (no reset, GET is read-only)

**File:** `crown_crm/accounting/views.py`

```python
def check_receipt_pdf_status(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """Poll task status using model field — no Celery AsyncResult needed."""
    receipt = get_object_or_404(
        PaymentReceipt, uuid=uuid, organization=request.organization
    )

    if receipt.pdf_status == "ready" and receipt.pdf_file:
        return JsonResponse({
            "status": "ready",
            "pdf_url": receipt.pdf_file.url,
        })

    if receipt.pdf_status == "failed":
        return JsonResponse({
            "status": "error",
            "message": "PDF generation failed. Click 'Retry' to try again.",
        })

    if receipt.pdf_status in ("pending", "generating"):
        return JsonResponse({"status": "processing"})

    return JsonResponse({"status": "unknown"})
```

### Step 5: POST retry endpoint (explicit action, not side effect)

**File:** `crown_crm/accounting/views.py`

```python
from django.views.decorators.http import require_POST
from django.middleware.csrf import get_token


@require_POST
def retry_receipt_pdf(request: OrgHttpRequest, uuid: UUID) -> HttpResponse:
    """Reset failed status and trigger regeneration."""
    receipt = get_object_or_404(
        PaymentReceipt, uuid=uuid, organization=request.organization
    )

    if receipt.pdf_status != "failed":
        return JsonResponse({
            "status": "error",
            "message": f"Cannot retry — current status is {receipt.pdf_status}",
        }, status=400)

    # Atomic claim
    updated = PaymentReceipt.objects.filter(
        uuid=uuid,
        pdf_status="failed",
    ).update(pdf_status="pending")

    if not updated:
        return JsonResponse({
            "status": "error",
            "message": "Retry already in progress",
        }, status=409)

    generate_receipt_pdf.delay(str(uuid))

    return JsonResponse({"status": "pending", "receipt_uuid": str(receipt.uuid)})
```

### Step 6: Add URLs

**File:** `crown_crm/accounting/urls.py`

```python
path("receipts/<uuid:uuid>/download/", views.receipt_pdf, name="receipt-pdf"),
path("receipts/<uuid:uuid>/download/status/", views.check_receipt_pdf_status, name="receipt-pdf-status"),
path("receipts/<uuid:uuid>/download/retry/", views.retry_receipt_pdf, name="receipt-pdf-retry"),
```

### Step 7: Frontend polling with retry button

**JavaScript:**

```javascript
async function downloadReceiptPdf(url, maxAttempts = 10) {
  let attempts = 0;

  async function poll() {
    attempts++;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "ready") {
      const link = document.createElement("a");
      link.href = data.pdf_url;
      link.download = true;
      link.click();
      return;
    }

    if (data.status === "error") {
      showRetryButton(url);
      return;
    }

    if (attempts >= maxAttempts) {
      alert("PDF generation timed out. Please try again.");
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, attempts - 1), 8000);
    setTimeout(poll, delay);
  }

  poll();
}

function showRetryButton(url) {
  const retryUrl = url.replace("/status/", "/retry/");

  // Create retry button (replace loading indicator if present)
  const container = document.getElementById("pdf-status");
  if (container) {
    container.innerHTML = `
      <button type="button" class="btn btn-warning" id="retry-btn">
        Retry PDF Generation
      </button>
    `;
    document.getElementById("retry-btn").addEventListener("click", async () => {
      const csrfToken =
        document.querySelector("[name=csrfmiddlewaretoken]")?.value ||
        getCookie("csrftoken");

      await fetch(retryUrl, {
        method: "POST",
        headers: {
          "X-CSRFToken": csrfToken,
          "Content-Type": "application/json",
        },
      });

      // Reset attempts and restart polling
      downloadReceiptPdf(url, maxAttempts);
    });
  }
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
}

// Usage: call on button click
downloadReceiptPdf("/org/slug/receipts/uuid/download/");
```

**HTML (in receipt detail template):**

```html
<div id="pdf-status"></div>
<input type="hidden" name="csrfmiddlewaretoken" value="{{ csrf_token }}" />
```

---

## Files to Modify

| File                             | Change                                                  |
| -------------------------------- | ------------------------------------------------------- |
| `crown_crm/accounting/models.py` | Add `pdf_file`, `pdf_generated_at`, `pdf_status` fields |
| `crown_crm/accounting/tasks.py`  | Add task with try/except retry, base64 logo             |
| `crown_crm/accounting/views.py`  | Atomic update, poll, retry views                        |
| `crown_crm/accounting/urls.py`   | Add status + retry URLs                                 |
| Config                           | Add queue routing                                       |

---

## Race Condition Flow

```
Request A                         Request B                    Receipt
     |                               |                            |
     |-- Atomic UPDATE -----→       |                            |
     |      WHERE status IN          |                            |
     |      ('none','failed')        |                            |
     |      SET status='pending'     |                            |
     |←- rows_updated=1 --------    |                            |
     |                               |                            |
     |-- dispatch task              |                            |
     |                               |-- Atomic UPDATE -----→     |
     |                               |   WHERE status IN         |
     |                               |   ('none','failed')      |
     |                               |←- rows_updated=0 --------| (claiming failed)
     |                               |                            |
     |                               |-- read status --------→ |
     |                               |←- "pending" -----------| (sees already claimed)
```
