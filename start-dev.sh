#!/bin/bash
tmux split-window -h "uv run celery -A config.celery_app worker -l info -Q default,pdf --concurrency=2"
uv run python manage.py runserver 0.0.0.0:8000
