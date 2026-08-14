import contextlib

from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class UsersConfig(AppConfig):
    name = "crown_crm.users"
    verbose_name = _("Users")

    def ready(self):
        with contextlib.suppress(ImportError):
            import crown_crm.users.signals  # noqa: F401
