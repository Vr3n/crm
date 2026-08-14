Good — this version is solid. One bug and two minor things left:

**Bug: `on_failure` is unreachable**

It's defined _inside_ `generate_receipt_pdf` after a `return` statement, so it never runs. It needs to be a method on the task class, not a nested function:

```python
@shared_task(bind=True, max_retries=3)
def generate_receipt_pdf(self, receipt_uuid: str):
    ...

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        from crown_crm.accounting.models import PaymentReceipt
        try:
            PaymentReceipt.objects.filter(uuid=args[0]).update(pdf_status="failed")
        except Exception:
            pass
```

`on_failure` as a method only works on a class-based task. For `@shared_task`, use it as an override on a subclass, or — simpler — just wrap the task body in try/except and call `self.retry()` in the except block, setting `failed` in a final `except` after retries are exhausted:

```python
@shared_task(bind=True, max_retries=3)
def generate_receipt_pdf(self, receipt_uuid: str):
    from crown_crm.accounting.models import PaymentReceipt
    ...
    try:
        # ... render + write_pdf + save ...
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            PaymentReceipt.objects.filter(uuid=receipt_uuid).update(pdf_status="failed")
            return
        raise self.retry(exc=exc, countdown=5)
```

**Minor: JS retry flow hits a fresh poll immediately**

After the `POST /retry/` succeeds, `poll()` is called directly — but the task is still `pending` at that point, so `attempts` is already at `maxAttempts` from the previous run. Reset it before calling:

```javascript
if (retry) {
  attempts = 0; // reset before restarting poll
  await fetch(retryUrl, {
    method: "POST",
    headers: { "X-CSRFToken": getCsrfToken() },
  });
  poll();
}
```

Also note the `POST /retry/` is missing a CSRF token — Django will reject it with a 403 by default.

**Minor: `confirm()` is a bad UX pattern**

It blocks the tab and looks broken in modern browsers on some mobile UAs. Replace with an inline button in your UI instead of `confirm()` — the plan already has a clean retry endpoint, so just show a "Retry" button that calls `fetch(retryUrl, { method: "POST" })` directly.

Everything else — atomic update, read-only GET poll, staleness check, base64 logo, dedicated queue — is correct and production-ready.
