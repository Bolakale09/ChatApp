from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User

from . import models
from .models import Message

def login_view(request):
    if request.method == 'POST':
        username = request.POST['username']
        password = request.POST['password']
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect('chat')
    return render(request, 'chat/login.html')

def signup_view(request):
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('login')
    else:
        form = UserCreationForm()
    return render(request, 'chat/signup.html', {'form': form})

def logout_view(request):
    logout(request)
    return redirect('login')

@login_required
def chat_view(request):
    users = User.objects.exclude(id=request.user.id)
    messages = Message.objects.filter(
        models.Q(sender=request.user) | models.Q(receiver=request.user)
    ).order_by('timestamp')
    return render(request, 'chat/chat.html', {'users': users, 'messages': messages})