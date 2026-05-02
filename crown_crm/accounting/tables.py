import django_tables2 as tables
from .models import MembershipSale, PaymentReceipt


class MembershipSaleTable(tables.Table):
    lead = tables.Column(accessor="lead.full_name", verbose_name="Lead")
    receipt_number = tables.Column(
        accessor="receipts.last.receipt_number",
        verbose_name="Receipt No.",
        default="-",
    )
    duration = tables.Column(verbose_name="Plan")
    membership_start_date = tables.DateColumn(
        verbose_name="Start Date", format="d M Y"
    )
    price = tables.Column(verbose_name="Amount (₹)", default="-")
    detail = tables.TemplateColumn(
        template_code="""
            <a href="{% url 'sale-detail' slug=request.organization.slug uuid=record.uuid %}"
               class="btn btn-sm btn-primary">
                <i data-feather="eye" class="icon-sm"></i> View
            </a>
        """,
        verbose_name="",
        orderable=False,
    )
    delete = tables.TemplateColumn(
        template_code="""
            <button class="btn btn-sm btn-danger"
                    hx-delete="{% url 'hx-sale-delete' slug=request.organization.slug uuid=record.uuid %}"
                    hx-confirm="Delete this sale?"
                    hx-target="closest tr"
                    hx-swap="outerHTML swap:300ms">
                <i data-feather="trash-2" class="icon-sm"></i> Delete
            </button>
        """,
        verbose_name="",
        orderable=False,
    )

    class Meta:
        model = MembershipSale
        template_name = "tables/hx-bootstrap4.html"
        fields = (
            "lead",
            "receipt_number",
            "duration",
            "membership_start_date",
            "price",
            "detail",
            "delete",
        )
        attrs = {"class": "table table-hover"}


class PaymentReceiptTable(tables.Table):
    receipt_number = tables.Column(verbose_name="Receipt #")
    lead = tables.Column(accessor="sale.lead.full_name", verbose_name="Lead")
    date = tables.DateTimeColumn(verbose_name="Date", format="M d, Y")
    amount = tables.Column(
        verbose_name="Amount", default="-"
    )
    method = tables.Column(verbose_name="Payment Method")
    status = tables.Column(
        accessor="sale.balance_amount",
        verbose_name="Status",
    )
    actions = tables.TemplateColumn(
        template_code="""
            <a href="{% url 'receipt-detail' slug=request.organization.slug uuid=record.uuid %}"
               class="btn btn-sm btn-primary">
                <i data-feather="eye" class="icon-sm"></i> View
            </a>
            {% if record.sale.balance_amount > 0 %}
            <button class="btn btn-sm btn-info"
                    hx-get="{% url 'hx-create-payment-receipt' slug=request.organization.slug uuid=record.uuid %}"
                    hx-target="#modal-form">
                <i data-feather="dollar-sign" class="icon-sm"></i> Pay Balance
            </button>
            {% endif %}
        """,
        verbose_name="",
        orderable=False,
    )

    class Meta:
        model = PaymentReceipt
        template_name = "tables/hx-bootstrap4.html"
        fields = (
            "receipt_number",
            "lead",
            "date",
            "amount",
            "method",
            "status",
            "actions",
        )
        attrs = {"class": "table table-hover"}