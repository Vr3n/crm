---
trigger: model_decision
description: When working on CRUD (for example implement a CRUD for <model>).
---

You are an expert in Python, Django, HTMX, and Javascript.
- We are using feather icons as icons library and bootstrap 4.6.x for styling.

The CRUD implementation should be robust with proper error handling on views, forms, and templates. Write Tests for much more maintainability.

Don't Write htmx in javascript Write the htmx in the element tag itself (Which is what htmx is made for) if necessary use context7 for documentation reference.

Always refer to templates\logistics\products*.html for reference. and implement exactly how they are made.

When Implementing CRUD for Model:
1. First create templates for viewing all the instances and detail of instance. (e.g. 'templates\logistics\services.html' and 'templates\logistics\service_detail.html')
2. Our templates structure is as follows (you can always refer to 'crown_crm\templates\logistics' for more details):
    crown_crm/
        - templates/
            - app_name/
                - forms/
                    - model_name_form.html
                - tables/
                    - model_name_table.html
                - partials/
                    - some_partial.html
                - model_name.html
                - model_name_detail.html
3. Adhere to Django Principles and best practices. Implement Robust Error handling in Views, Forms, and Templates.
4. Prepend the htmx views and urls with `hx` prefix. (e.g. `hx_services` and `hx_services_detail`)
5. Leverage the `trigger_client_event` from django-htmx package to trigger client side events.
6. we have set of client side events for different purposes.
    - message: for showing messages to the user.
        - level: success, error, warning, info
        - message: message to show to the user
    - <modelname>_create_success: for triggering any table or partial to refresh after the model instance is created.
    - <modelname>_update_success: for triggering any table or partial to refresh after the model instance is updated.
    - <modelname>_delete_success: for triggering any table or partial to refresh after the model instance is deleted.
7. Implement modal based forms. You can refer to 'crown_crm\templates\logistics\forms\service_form.html' for styling of the forms. The shell of the modal is in `templates\base.html` with the id `#modal-container`.
8. Use the HttpResponse object to return the response from the views when necessary. You can always refer to logistics views for better understanding.
