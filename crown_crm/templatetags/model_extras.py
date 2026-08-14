from typing import Any, List, Union, cast
from django import template
from django.db.models import QuerySet, Manager
import json

register = template.Library()

def is_queryset(obj: Any) -> bool:
    """Check if object is a queryset or manager with all() method"""
    return hasattr(obj, 'all') and callable(obj.all)

def get_serializable_value(value: Any) -> Union[str, List[str]]:
    """Convert value to a JSON-serializable format"""
    if value is None:
        return ''
    if isinstance(value, (str, int, float, bool)):
        return str(value)
    if is_queryset(value):
        return [str(item) for item in value.all()]  # type: ignore
    return str(value)

@register.filter
def field_as_json(obj: Any, field_name: str = '') -> str:
    """
    Convert a field or related fields to JSON string.
    
    Args:
        obj: The object or queryset to process
        field_name: Optional field name to extract from each item
        
    Returns:
        JSON-encoded string of the field values
        
    Usage in template:
        # For single field
        {{ object|field_as_json:"field_name" }}
        
        # For related fields (preferred way)
        {{ object.related_field.all|field_as_json }}
        {{ object.related_field.all|field_as_json:"field_name" }}
    """
    if obj is None:
        return json.dumps('')
        
    try:
        # Handle querysets and managers
        if is_queryset(obj):
            # Cast to Any to avoid complex type checking
            queryset = cast(Any, obj)
            items = list(queryset.all())
            
            if not field_name:
                return json.dumps([str(item) for item in items])
                
            # Handle case where field_name is a related field
            return json.dumps([
                str(getattr(item, field_name, '')) 
                for item in items
                if hasattr(item, field_name)
            ])
            
        # Handle single objects with field_name
        if field_name and hasattr(obj, field_name):
            value = getattr(obj, field_name)
            if is_queryset(value):
                return json.dumps([str(item) for item in value.all()])  # type: ignore
            return json.dumps(str(value) if value is not None else '')
            
        # Default case: convert to string
        return json.dumps(str(obj) if obj is not None else '')
        
    except Exception as e:
        print(f"Error in field_as_json: {e}")
        return json.dumps('')
