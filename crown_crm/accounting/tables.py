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
    membership_start_date = tables.DateColumn(verbose_name="Start Date", format="d M Y")
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
        attrs = {"class": "table table-sm table-hover"}


class MembershipExpirationTable(tables.Table):
    lead_name = tables.Column(accessor="lead.full_name", verbose_name="Lead Name")
    amount = tables.TemplateColumn(
        template_code="""
            <div class="text-success">₹ {{ record.total_paid_amount|default:"0"|floatformat:2 }}</div>
            {% if record.balance_amount > 0 %}
            <small class="text-danger">Outstanding: ₹ {{ record.balance_amount|floatformat:2 }}</small>
            {% endif %}
        """,
        verbose_name="Amount (₹)",
        orderable=False,
    )
    start_date = tables.DateColumn(
        accessor="membership_start_date",
        verbose_name="Start Date",
        format="d M Y",
    )
    end_date = tables.DateColumn(
        accessor="membership_end_date",
        verbose_name="End Date",
        format="d M Y",
    )
    days_left = tables.Column(verbose_name="Days Left", orderable=False)
    view = tables.TemplateColumn(
        template_code="""
            <button class="btn btn-sm btn-outline-primary"
                    hx-get="{% url 'hx-membership-detail-drawer' slug=request.organization.slug uuid=record.uuid %}"
                    hx-target="#details-modal-body"
                    hx-swap="innerHTML">
                <i class="fa fa-eye"></i> View
            </button>
        """,
        verbose_name="",
        orderable=False,
    )

    class Meta:
        model = MembershipSale
        template_name = "tables/hx-bootstrap4.html"
        fields = ("lead_name", "amount", "end_date", "start_date", "days_left", "view")
        attrs = {"class": "table table-sm table-hover"}


class RecentMembershipSalesTable(tables.Table):
    lead_name = tables.Column(accessor="lead.full_name", verbose_name="Lead Name")
    amount = tables.TemplateColumn(
        template_code="""
            <div class="text-success">₹ {{ record.total_paid_amount|default:"0"|floatformat:2 }}</div>
            {% if record.balance_amount > 0 %}
            <small class="text-danger">Outstanding: ₹ {{ record.balance_amount|floatformat:2 }}</small>
            {% endif %}
        """,
        verbose_name="Amount (₹)",
        orderable=False,
    )
    duration = tables.Column(verbose_name="Membership Plan")
    created_at = tables.DateColumn(verbose_name="Date", format="d-m-Y")

    class Meta:
        model = MembershipSale
        template_name = "tables/hx-bootstrap4.html"
        fields = ("lead_name", "amount", "duration", "created_at")
        attrs = {"class": "table table-sm table-hover"}


class OutstandingPaymentsTable(tables.Table):
    lead_name = tables.Column(accessor="lead.full_name", verbose_name="Lead Name")
    start_date = tables.DateColumn(
        accessor="membership_start_date",
        verbose_name="Start Date",
        format="d M Y",
    )
    total = tables.Column(
        accessor="price",
        verbose_name="Total (₹)",
    )
    paid = tables.Column(
        accessor="total_paid_amount",
        verbose_name="Paid (₹)",
        orderable=False,
    )
    outstanding = tables.Column(
        accessor="balance_amount",
        verbose_name="Outstanding (₹)",
    )
    view = tables.TemplateColumn(
        template_code="""
            <a href="{% url 'sale-detail' slug=request.organization.slug uuid=record.uuid %}"
               class="btn btn-sm btn-outline-primary">
                <i class="fa fa-eye"></i> View
            </a>
        """,
        verbose_name="",
        orderable=False,
    )

    class Meta:
        model = MembershipSale
        template_name = "tables/hx-bootstrap4.html"
        fields = ("lead_name", "start_date", "total", "paid", "outstanding", "view")
        attrs = {"class": "table table-sm table-hover"}


class PaymentReceiptTable(tables.Table):
    receipt_number = tables.Column(verbose_name="Receipt #")
    lead = tables.Column(accessor="sale.lead.full_name", verbose_name="Lead")
    date = tables.DateTimeColumn(verbose_name="Date", format="M d, Y")
    opening_balance = tables.Column(verbose_name="Opening Balance (₹)")
    closing_balance = tables.Column(verbose_name="Closing Balance (₹)")
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
<a href="{% url 'receipt-pdf' slug=request.organization.slug uuid=record.uuid %}"
               class="btn btn-sm btn-success"
               download>
             <i class="fa fa-download mr-1"></i> Download
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
            "opening_balance",
            "closing_balance",
            "method",
            "status",
            "actions",
        )
        attrs = {"class": "table table-sm table-hover"}
