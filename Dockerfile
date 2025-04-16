ARG PYTHON_VERSION=3.13-slim

FROM python:${PYTHON_VERSION}

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SUPERUSER_PASSWORD=admin123
ENV DJANGO_SUPERUSER_EMAIL=admin@admin.com
ENV DJANGO_SUPERUSER_USERNAME=admin

# install psycopg2 dependencies.
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /code

WORKDIR /code

COPY requirements.txt /tmp/requirements.txt
RUN set -ex && \
    pip install --upgrade pip && \
    pip install -r /tmp/requirements.txt && \
    rm -rf /root/.cache/
COPY . /code

ENV SECRET_KEY "zsb1EFkhehJ3wSSul10mJWg56t5T4Ua1nEeNUy6ySaBGmR8F2Q"
ENV DATABASE_URL "postgres://avnadmin:AVNS_RqbTnyzhEWPm8uiBGTT@chatapp-chat111.d.aivencloud.com:28686/defaultdb?sslmode=require"

#RUN python manage.py collectstatic --noinput

EXPOSE 8000

CMD python manage.py migrate && \
    python create_superuser.py && \
    gunicorn --bind :8000 --workers 1 --worker-class uvicorn.workers.UvicornWorker chatapp.asgi