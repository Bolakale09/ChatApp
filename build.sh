#!/usr/bin/env bash
# exit on error
set -o errexit

pip install -r requirements.txt
mkdir -p static
python manage.py collectstatic
python manage.py migrate