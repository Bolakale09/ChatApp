release: python manage.py migrate
web: gunicorn chatapp.asgi:application --bind 0.0.0.0:$PORT
