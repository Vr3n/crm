from django.db import models


class ClientQuerySet(models.QuerySet):
    """
    Custom queryset class for Client MAster.
    """

    def active(self):
        return self.filter(is_deleted=False)
