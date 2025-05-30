from django.urls import path
from . import views

urlpatterns = [
    path('', views.chat_view, name='chat'),
    path('login/', views.login_view, name='login'),
    path('signup/', views.signup_view, name='signup'),
    path('logout/', views.logout_view, name='logout'),
    path('api/messages/', views.get_messages, name='get_messages'),
]