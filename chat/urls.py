from django.urls import path
from . import views

urlpatterns = [
    path('', views.chat_home, name='chat_home'),
    path('signup/', views.signup_view, name='signup'),
    path('chat/<str:username>/', views.chat_room, name='chat_room'),
    path('api/users/', views.user_list, name='user_list'),
    path('api/send_message/', views.send_message, name='send_message'),
    path('api/messages/<str:username>/', views.message_history, name='message_history'),
]