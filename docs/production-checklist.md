# Production Checklist

## Prerequisites

- [ ] Domain name configured
- [ ] SSL certificate (Let's Encrypt)
- [ ] Server with >= 2GB RAM

## Deployment Steps

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python 3.12
sudo apt install -y python3.12 python3.12-venv python3.12-dev

# Install Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### 2. Application Deployment

```bash
# Clone/pull latest code
cd /home/viren/codes/crm
git pull

# Install dependencies
uv pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Collect static files
python manage.py collectstatic --noinput
```

### 3. Redis + Celery Configuration

**Redis** is already configured via environment variables:
```bash
# In .env file
REDIS_URL=redis://localhost:6379/0
```

**Celery** needs systemd services:

**File: `/etc/systemd/system/celery-worker.service`**
```ini
[Unit]
Description=Celery Worker for crown_crm
After=network.target redis-server.service

[Service]
Type=forking
User=viren
Group=viren
WorkingDirectory=/home/viren/codes/crm
Environment=DJANGO_SETTINGS_MODULE=config.settings.production
ExecStart=/home/viren/codes/crm/.venv/bin/celery -A config.celery_app worker -l info -Q default,pdf --concurrency=2
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**File: `/etc/systemd/system/celery-beat.service`**
```ini
[Unit]
Description=Celery Beat for crown_crm
After=network.target redis-server.service

[Service]
Type=simple
User=viren
Group=viren
WorkingDirectory=/home/viren/codes/crm
Environment=DJANGO_SETTINGS_MODULE=config.settings.production
ExecStart=/home/viren/codes/crm/.venv/bin/celery -A config.celery_app beat -l info
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Start Celery:
```bash
sudo systemctl daemon-reload
sudo systemctl start celery-worker
sudo systemctl start celery-beat
sudo systemctl enable celery-worker
sudo systemctl enable celery-beat
```

### 4. Gunicorn Setup

**File: `/etc/systemd/system/gunicorn.service`**
```ini
[Unit]
Description=gunicorn for crown_crm
After=network.target

[Service]
User=viren
Group=viren
WorkingDirectory=/home/viren/codes/crm
Environment=DJANGO_SETTINGS_MODULE=config.settings.production
ExecStart=/home/viren/codes/crm/.venv/bin/gunicorn config.asgi:application -b 127.0.0.1:8000 --workers 3 --timeout 120
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 5. Nginx Configuration

**File: `/etc/nginx/sites-available/crown_crm`**
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        alias /home/viren/codes/crm/staticfiles/;
    }

    location /media/ {
        alias /home/viren/codes/crm/media/;
    }
}
```

Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/crown_crm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Firewall

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow OpenSSH
sudo ufw enable
```

### 7. Health Checks

```bash
# Verify Redis
redis-cli ping

# Verify Celery
celery -A config.celery_app inspect active

# Verify Gunicorn
curl http://localhost:8000/

# Check logs
journalctl -u celery-worker -n 50 --no-pager
journalctl -u gunicorn -n 50 --no-pager
```

## PDF Generation Queue

The receipt PDF generation uses a dedicated `pdf` queue routed via `CELERY_TASK_ROUTES`:

```python
# config/settings/production.py
CELERY_TASK_ROUTES = {
    "crown_crm.accounting.tasks.generate_receipt_pdf": {"queue": "pdf"},
}
```

Make sure the worker listens to both queues:
```bash
celery -A config.celery_app worker -l info -Q default,pdf
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Redis connection refused | `sudo systemctl start redis-server` |
| Celery task delayed | Check worker: `journalctl -u celery-worker` |
| PDF not generating | Ensure `pdf` queue is included in `-Q` flag |
| 502 Bad Gateway | Check gunicorn: `systemctl status gunicorn` |

## Rollback

```bash
# Stop services
sudo systemctl stop gunicorn celery-worker celery-beat

# Revert to previous deployment
git revert <commit-hash>
python manage.py migrate <previous-migration>
```