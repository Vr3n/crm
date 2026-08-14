"""
HTMX view mixins for Crown CRM.

Provides consistent status code handling for HTMX form views:
- 422: Validation errors (form re-rendered with errors)
- 204: Success, no body, trigger client event
- 200: Success with body (template rendered)
"""

import logging
import pdb

from django.http import HttpResponse, HttpResponseBadRequest
from django.template.response import TemplateResponse
from django.core.exceptions import ImproperlyConfigured
from django.views.generic.edit import FormMixin, DeletionMixin
from django_htmx.http import trigger_client_event

__all__ = ["HtmxFormMixin", "HtmxDeleteMixin", "HtmxFormsetMixin"]

logger = logging.getLogger(__name__)


class HtmxFormMixin(FormMixin):
    """
    Mixin for HTMX form views.

    Inherits from Django's FormMixin for form handling.
    Subclasses MUST define:
        template_name: str
        form_class: type[Form]

    May define:
        success_event: str | None
        success_status: int (default: 204)
        context_object_name: str (default: "form")
        redirect_url: str | None (for HX-Redirect header)
    """

    template_name = None
    form_class = None
    success_event = None
    success_status = 204
    context_object_name = "form"
    redirect_url = None

    def dispatch(self, request, *args, **kwargs):
        """Enforce HTMX-only access."""
        logger.debug(f"[HtmxFormMixin] dispatch called, method={request.method}, htmx={getattr(request, 'htmx', False)}")
        if not getattr(request, "htmx", False):
            return HttpResponseBadRequest("HTMX request required")
        return super().dispatch(request, *args, **kwargs)

    def render_form(self, form=None, extra_context=None, status=200):
        """Render template with given status.

        Args:
            form: The form instance (optional)
            extra_context: Additional context dict (optional)
            status: HTTP status code (default: 200)
        """
        context = {}
        if form is not None:
            context[self.context_object_name] = form
        if extra_context:
            context.update(extra_context)


        return TemplateResponse(
            self.request,
            self.template_name,
            self.get_context_data(**context),
            status=status,
        )

    def htmx_success(self, context=None, template_name=None):
        """Handle successful form submission."""
        if self.success_status == 204:
            response = HttpResponse(status=204)

            redirect_url = self.build_success_url()
            if redirect_url:
                response["HX-Redirect"] = redirect_url

            if self.success_event:
                response = trigger_client_event(
                    response, self.success_event, self.get_success_event_params()
                )
            return response

        template = template_name or self.template_name
        return TemplateResponse(
            request=self.request,
            template=template,
            context=self.get_context_data(**(context or {})),
            status=200,
        )

    def build_success_url(self):
        """Return URL for HX-Redirect header, or None.

        Supports format string with {id} placeholder.
        Example: redirect_url = "/leads/{id}/detail"
        """
        if self.redirect_url:
            return self.redirect_url.format(id=getattr(self._object, "id", ""))
        return None

    def get_success_event_params(self):
        """Override to provide dynamic event params."""
        return {}

    def form_valid(self, form):
        """Save form and return success response. Override for custom save."""
        self._object = form.save()
        return self.htmx_success()

    def form_invalid(self, form, **context):
        """Return 422 with re-rendered form showing errors."""
        return self.render_form(form, extra_context=context, status=422)


class HtmxDeleteMixin(DeletionMixin):
    """
    Mixin for HTMX delete views.
    Returns 204 + trigger event on success.

    Subclasses MUST define:
        model: Model class
        success_event: str | None

    May define:
        pk_url_kwarg: str (default: 'pk')
        event_id_key: str (default: 'id')
    """

    success_event = None
    event_id_key = "id"

    def dispatch(self, request, *args, **kwargs):
        """Enforce HTMX-only access."""
        if not getattr(request, "htmx", False):
            return HttpResponseBadRequest("HTMX request required")
        return super().dispatch(request, *args, **kwargs)

    def delete(self, request, *args, **kwargs):
        obj = self.get_object()
        obj_id = obj.pk
        obj.delete()

        response = HttpResponse(status=204)
        if self.success_event:
            response = trigger_client_event(
                response, self.success_event, {self.event_id_key: obj_id}
            )
        return response


class HtmxFormsetMixin(HtmxFormMixin):
    """
    Mixin for HTMX form views with formsets.

    Subclasses MUST define:
        template_name: str
        form_class: type[Form]
        formset_classes: dict  # {'mobile': LeadMobileFormSet, 'email': LeadEmailFormSet}

    Usage:
        class HxCreateLeadView(HtmxFormsetMixin, View):
            template_name = "leads/forms/lead_create.html"
            form_class = LeadForm
            formset_classes = {
                'mobile': LeadMobileFormSet,
                'email': LeadEmailFormSet,
            }
            success_event = "lead-created"
    """

    formset_classes = None

    def get_formset_classes(self):
        if self.formset_classes is None:
            raise ImproperlyConfigured(
                f"{self.__class__.__name__} must define formset_classes"
            )
        return self.formset_classes

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        for name, formset_class in self.get_formset_classes().items():
            key = f"{name}_formset"
            if key not in context:
                context[key] = formset_class(prefix=name)
        return context

    def get(self, request, *args, **kwargs):
        form = self.get_form()
        extra = {}
        for name, formset_class in self.get_formset_classes().items():
            extra[f"{name}_formset"] = formset_class(prefix=name)
        return self.render_form(form, extra_context=extra)

    def post(self, request, *args, **kwargs):
        logger.debug(f"[HtmxFormsetMixin] POST data keys: {list(request.POST.keys())}")

        form = self.get_form()
        form_is_valid = form.is_valid()
        logger.debug(
            f"[HtmxFormsetMixin] Form: {form.__class__.__name__}, is_valid: {form_is_valid}"
        )
        if not form_is_valid:
            logger.debug(f"[HtmxFormsetMixin] Form errors: {dict(form.errors)}")

        formsets = {}
        all_valid = form_is_valid

        for name, formset_class in self.get_formset_classes().items():
            formsets[name] = formset_class(request.POST, prefix=name)
            fs = formsets[name]
            fs_valid = fs.is_valid()
            logger.debug(f"[HtmxFormsetMixin] Formset {name}: is_valid={fs_valid}")
            if not fs_valid:
                logger.debug(
                    f"[HtmxFormsetMixin] Formset {name} full errors: {fs.errors}"
                )
                for i, sub_form in enumerate(fs.forms):
                    if sub_form.errors:
                        logger.debug(
                            f"[HtmxFormsetMixin] Formset {name}[{i}] errors: {dict(sub_form.errors)}"
                        )
            all_valid = all_valid and fs_valid

        logger.debug(f"[HtmxFormsetMixin] Final all_valid: {all_valid}")

        if all_valid:
            self._object = form.save()
            for name, fs in formsets.items():
                fs.instance = self._object
                fs.save()
            return self.htmx_success()

        logger.warning("[HtmxFormsetMixin] Validation failed, returning 422")
        context = {f"{name}_formset": fs for name, fs in formsets.items()}
        return self.form_invalid(form, **context)
