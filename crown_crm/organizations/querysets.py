from django.db import models
from django.db.models import Q
from django.conf import settings


class OrganizationQuerySet(models.QuerySet):
    def user_in(self, user):
        """
        Returns Organizations where user has any role.
        (owner, admin, or member)
        """

        return self.filter(Q(owner=user) | Q(admins=user) | Q(members=user))

    def owned_by(self, user):
        """
        Returns Organizations where user is owner.
        """
        return self.filter(owner=user)

    def administered_by(self, user):
        """
        Returns Organizations where user is admin.
        """

        return self.filter(admins=user)

    def is_member(self, user):
        """
        Returns Organizations where user is member.
        """

        return self.filter(members=user)

    def with_role(self, user, roles=None):
        """
        Returns organizations where user has specified roles.

        Args:
            user: User Instance.
            roles: List of roles to check ['owner', 'admin', 'member']
        """

        if not roles:
            return self.none()

        queries = []

        if "owner" in roles:
            queries.append(Q(owner=user))

        if "admin" in roles:
            queries.append(Q(admins=user))

        if "member" in roles:
            queries.append(Q(members=user))

        query = queries.pop()
        for item in queries:
            query |= item

        return self.filter(query).distinct()

