from functools import wraps
from django.db.models import QuerySet
from django.contrib import messages
from django.shortcuts import redirect
from django.http import HttpRequest
from typing import Callable

from crm.organizations.models import OrganizationMaster


def organization_slug_required(view_func: Callable) -> Callable:
    """Decorator to inject organization slug into request.

    the decorator:
    1. Gets the organization using the slug from URL.
    2. Injects slug into the request object.
    3. Removes the need to explicitly define slug parameter in view functions.

    Args:
        view_func: The view function to be decorated.

    Returns:
        Callable: Wrapped view function with organization slug handling.
    """

    @wraps(view_func)
    def _wrapped_view(request: HttpRequest,
                      slug: str, *args, **kwargs) -> Callable:
        organization: QuerySet = OrganizationMaster.objects.filter(slug=slug)

        if not organization.exists():
            messages.error(request, "Organization Does not Exist!")
            return redirect("organizations-list")

        # Attaching the organization to request obj.
        request.organization = organization.first()

        return view_func(request, *args, **kwargs)
    return _wrapped_view
