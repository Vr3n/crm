from functools import wraps
from django.db.models import QuerySet
from django.contrib import messages
from django.shortcuts import redirect
from django.http import HttpRequest
from typing import Any, Callable, TypeVar, TypeVarTuple, cast

from crown_crm.organizations.models import OrganizationMaster
from crown_crm.utils.types import OrgHttpRequest

# Preserve View function type signatures.
F = TypeVar("F", bound=Callable[..., Any])

def organization_slug_required(view_func: F) -> F:
    """Decorator to inject organization slug into request.

    the decorator:
    1. Gets the organization using the slug from URL.
    2. Injects slug into the request object.
    3. Removes the need to explicitly define slug parameter in view functions.

    Args:
        view_func: The view function to be decorated.

    Returns:
        F: Wrapped view function with organization slug handling.
    """

    @wraps(view_func)
    def _wrapped_view(request: OrgHttpRequest,
                      slug: str, *args, **kwargs) -> F:
        try:
            organization = OrganizationMaster.objects.get(slug=slug)
        except OrganizationMaster.DoesNotExist:
            messages.error(request, "Organization Does not Exist!")
            return redirect("organizations-list")
        # Attaching the organization to request obj.
        request.organization = organization

        return view_func(request, *args, **kwargs)
    return cast(F, _wrapped_view)
