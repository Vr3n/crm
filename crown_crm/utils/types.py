from django.http import HttpRequest
from crown_crm.organizations.models import OrganizationMaster

class OrgHttpRequest(HttpRequest):
    organization: OrganizationMaster