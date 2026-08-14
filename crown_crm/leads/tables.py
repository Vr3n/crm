import django_tables2 as tables
from .models import LeadMaster
from crown_crm.accounting.models import MembershipSale


class LeadTable(tables.Table):
    full_name = tables.Column(accessor="full_name", verbose_name="Name")
    mobile_number = tables.Column(
        accessor="first_mobile__0__mobile_number",
        verbose_name="Mobile Number",
        default="-",
    )
    email = tables.Column(
        accessor="first_email__0__email", verbose_name="Email", default="-"
    )
    detail = tables.TemplateColumn(
        template_code='<a href="{{ record.get_absolute_url }}" class="btn btn-sm btn-info">View</a>',
        verbose_name="",
        orderable=False,
    )
    delete = tables.TemplateColumn(
        template_code="""
            <button class="btn btn-sm btn-danger"
                    hx-delete="{% url 'hx-delete-lead' slug=request.organization.slug pk=record.pk %}"
                    hx-confirm="Delete this lead?"
                    hx-target="closest tr"
                    hx-swap="outerHTML swap:300ms">
                <i class="fa fa-trash fa-xs"></i>
            </button>
        """,
        verbose_name="",
        orderable=False,
    )

    class Meta:
        model = LeadMaster
        template_name = "tables/hx-bootstrap4.html"
        fields = ("full_name", "mobile_number", "email", "detail", "delete")
        attrs = {"class": "table table-sm table-hover"}


class LeadsWithoutMembershipTable(tables.Table):
    full_name = tables.Column(accessor="full_name", verbose_name="Name")
    mobile_number = tables.Column(
        accessor="first_mobile__0__mobile_number",
        verbose_name="Mobile Number",
        default="-",
    )
    email = tables.Column(
        accessor="first_email__0__email", verbose_name="Email", default="-"
    )
    add_followup = tables.TemplateColumn(
        template_code="""
            <button class="btn btn-sm btn-outline-primary" disabled>
                <i class="fa fa-plus"></i> Add Followup
            </button>
        """,
        verbose_name="",
        orderable=False,
    )

    class Meta:
        model = LeadMaster
        template_name = "tables/hx-bootstrap4.html"
        fields = ("full_name", "mobile_number", "email", "add_followup")
        attrs = {"class": "table table-sm table-hover"}


class LeadsWithMembershipTable(tables.Table):
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
    membership_dates = tables.TemplateColumn(
        template_code="""
            {{ record.membership_start_date|date:"d M Y" }} - {{ record.membership_end_date|date:"d M Y" }}
        """,
        verbose_name="Membership Date",
        orderable=False,
    )
    view_membership = tables.TemplateColumn(
        template_code="""
            <a href="{% url 'sale-detail' slug=request.organization.slug uuid=record.uuid %}"
               class="btn btn-sm btn-outline-success">
                <i class="fa fa-eye"></i> View
            </a>
        """,
        verbose_name="",
        orderable=False,
    )

    class Meta:
        model = MembershipSale
        template_name = "tables/hx-bootstrap4.html"
        fields = ("lead_name", "amount", "membership_dates", "view_membership")
        attrs = {"class": "table table-sm table-hover"}

