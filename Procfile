release:python manage.py migrate
web: uvicorn chatapp.asgi:application --host 0.0.0.0 --port=$PORT
web: gunicorn chatapp.wsgi:application --bind 0.0.0.0:8000