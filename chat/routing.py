import os

from django.urls import re_path

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chatapp.settings')

from chat import consumers

websocket_urlpatterns = [
    re_path(r'ws/chat/$', consumers.ChatConsumer.as_asgi()),
]