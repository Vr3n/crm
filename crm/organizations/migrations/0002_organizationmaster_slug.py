# Generated by Django 5.0.8 on 2024-08-18 09:38

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='organizationmaster',
            name='slug',
            field=models.SlugField(blank=True, null=True),
        ),
    ]
