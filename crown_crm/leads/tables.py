import django_tables2 as tables
from .models import LeadMaster


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
        template_code='<a href="{{ record.get_absolute_url }}" class="btn btn-sm btn-info">Detail</a>',
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
                Delete
            </button>
        """,
        verbose_name="",
        orderable=False,
    )

    class Meta:
        model = LeadMaster
        template_name = "tables/hx-bootstrap4.html"
        fields = ("full_name", "mobile_number", "email", "detail", "delete")
        attrs = {"class": "table table-hover"}

