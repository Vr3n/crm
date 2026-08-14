# Plan: HTMX Pagination with django-tables2

## Modifying the reusable boostrap4 template.

- Rename the `htmx_bootstrap4.html` to `hx-bootstrap4.html`.

The content change is here:

```jinja
{% extends "django_tables2/bootstrap4.html" %}
{% load i18n %}
{% load django_tables2 %}

{% block table.thead %}
    {% if table.show_header %}
        <thead {{ table.attrs.thead.as_html }} >
            <tr>
                {% for column in table.columns %}
                    <th {{ column.attr.th.as_html }} scope="col"
                        {% if column.orderable %}
                            hx-get="{% querystring table.prefixed_order_by_field=column.order_by_alias.next %}"
                            hx-trigger="click"
                            hx-target="div.table-container"
                            hx-swap="outerHTML"
                            style="cursor: pointer;"
                        {% endif %}
                    >
                        {{ column.header }}
                    </th>
                {% endfor %}
            </tr>
        </thead>
    {% endif %}
{% endblock table.thead %}

{% block pagination %}
<div class="pagination">
    {% if table.page and table.paginatior.num_pages > 1 %}
        <div class="join">
            <a class="join-item btn">
                {% if table.page.has_previous %}
                    hx-get="{{ request.path_info }}{% querystring table.prefixed_field=table.page.next_page_number %}"
                    hx-trigger="click"
                    hx-target="div.table-container"
                    hx-swap="outerHTML"
                {% else %}
                    disabled
                {% endif %}
                <span aria-hidden="true">&arquo;</span>
            </a>
        </div>
    {% endif %}
</div>
{% endblock pagination %}
```
