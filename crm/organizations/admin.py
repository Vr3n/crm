from django.contrib import admin

from crm.organizations.models import OrganizationMaster

# Register your models here.


@admin.register(OrganizationMaster)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "created_at", "updated_at"]
