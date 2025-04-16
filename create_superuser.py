import django
django.setup()

from django.contrib.auth import get_user_model
from django.core.management import call_command
import os

User = get_user_model()
username = os.environ.get('DJANGO_SUPERUSER_USERNAME', 'admin')

if not User.objects.filter(username=username).exists():
    print(f"Creating superuser '{username}'...")
    call_command('createsuperuser', '--noinput')
    print("Superuser created successfully.")
else:
    print(f"Superuser '{username}' already exists.")