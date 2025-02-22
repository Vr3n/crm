from django.contrib import admin

# Register your models here.
from .models import ClientMaster, ClientBodyMeasurementMaster, ClientBodyStatusMaster

admin.site.register(ClientMaster)
admin.site.register(ClientBodyMeasurementMaster)
admin.site.register(ClientBodyStatusMaster)
