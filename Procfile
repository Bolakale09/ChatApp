web: uvicorn chatapp.asgi:application --host 0.0.0.0 --port=$PORT
web: gunicorn chatapp.wsgi:application --bind 0.0.0.0:$PORT
release: python manage.py migrate