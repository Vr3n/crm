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
    def _wrapped_view(request: OrgHttpRequest, slug: str, *args, **kwargs) -> F:
        try:
            organization = OrganizationMaster.objects.get(slug=slug)
        except OrganizationMaster.DoesNotExist:
            messages.error(request, "Organization Does not Exist!")
            return redirect("organizations-list")
        # Attaching the organization to request obj.
        request.organization = organization

        return view_func(request, *args, **kwargs)

    return cast(F, _wrapped_view)


class OrganizationRequiredMixin:
    """Mixin to inject organization into request and handle slug validation."""

    def dispatch(self, request, *args, **kwargs):
        # 1. Extract the slug from the URL kwargs
        slug = kwargs.get("slug")

        try:
            # 2. Fetch the organization
            organization = OrganizationMaster.objects.get(slug=slug)
            # 3. Inject it into the request
            request.organization = organization
        except OrganizationMaster.DoesNotExist:
            messages.error(request, "Organization Does not Exist!")
            return redirect("organizations-list")

        # 4. Clean up kwargs so the view doesn't need to accept 'slug' as an argument
        # This mirrors your decorator's behavior of removing the slug parameter.
        kwargs.pop("slug", None)

        return super().dispatch(request, *args, **kwargs)
