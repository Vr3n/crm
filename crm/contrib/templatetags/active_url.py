from typing import List
from django import template
from django.urls import resolve
from django.http import HttpRequest


register = template.library()


class ActiveUrlNode(template.Node):
    def __init__(self, request: HttpRequest,
                 names: List[str],
                 return_value="active"):
        self.request = template.Variable(request)
        self.names = [template.Variable(n) for n in names]
        self.return_value = template.Variable(return_value)

    def render(self, context):
        request = self.request.resolve(context)
        any_of = False
        try:
            url = resolve(request.path_info)
            url_name = "%s:%s" % (url.namespace, url.url_name)
            for n in self.names:
                name = n.resolve(context)
                if url_name.startswith(name):
                    any_of = True
                    break
        except Exception:
            raise "Cannot Resolve %s" % request.path_info
        return self.return_value if any_of else ''


@register.tag
def active(parser, token):
    """
    Simple tag to check which page we are on, based on resolve;
    Useful to add an 'active' css class in menu items that needs to be
    aware when they are selected.

    Usage:
        {% active request "base:index" %}
        {% active request "base:index" "base:my_view" %}
    """

    try:
        args = token.split_contents()
        return ActiveUrlNode(args[1], args[2:])
    except ValueError:
        raise (template.TemplateSyntaxError,
               "%r tag requires at least 2 arguments" % token.contents.split()[
                   0]
               )
