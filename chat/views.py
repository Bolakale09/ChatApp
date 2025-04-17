from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.contrib.auth import logout, login, authenticate
from .forms import SignUpForm
from django.contrib.auth.models import User
from .models import Message
from django.db.models import Q

# Create your views here.

def signup_view(request):
    if request.method == 'POST':
        form = SignUpForm(request.POST)
        if form.is_valid():
            user = form.save()
            # Auto-login after signup
            username = form.cleaned_data.get('username')
            raw_password = form.cleaned_data.get('password1')
            user = authenticate(username=username, password=raw_password)
            login(request, user)
            return redirect('login')  # Redirect to your chat homepage
    else:
        form = SignUpForm()
    return render(request, 'chat/signup.html', {'form': form})

@login_required
def index(request):
    return render(request, 'chat/index.html')

@login_required
def logout_view(request):
    logout(request)
    return redirect('login')


@login_required
def chat_room(request, username):
    try:
        chat_partner = User.objects.get(username=username)
        return render(request, 'chat/chat_room.html', {
            'chat_partner': chat_partner
        })
    except User.DoesNotExist:
        return  render(request, 'chat/user_not_found.html')


@login_required
def user_list(request):
    users = User.objects.exclude(id=request.user.id)
    user_data = []

    for user in users:
        try:
            status = user.chatuser.status
        except:
            status = 'Offline'

        user_data.append({
            'id': user.id,
            'username': user.username,
            'status': status
        })

    return JsonResponse({'users': user_data})


@login_required
def send_message(request):
    if request.method == 'POST':
        recipient_username = request.POST.get('recipient')
        content = request.POST.get('content')
        if not recipient_username or not content:
            return JsonResponse({'status': 'error', 'message': 'Missing recipient or content'})

        try:
            recipient = User.objects.get(username=recipient_username)
            Message.objects.create(sender=request.user, recipient=recipient, content=content)
            return JsonResponse({'status': 'success'})
        except User.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': 'Recipient not found'})
    return JsonResponse({'status': 'error', 'message': 'Invalid request method'})


@login_required
def message_history(request, username):
    try:
        chat_partner = User.objects.get(username=username)
        messages = Message.objects.filter(
            (Q(sender=request.user) & Q(receiver=chat_partner)) |
            (Q(sender=chat_partner) & Q(receiver=request.user))
        ).order_by('timestamp')

        message_data = []
        for msg in messages:
            message_data.append({
                'id': msg.id,
                'content': msg.content,
                'sender': msg.sender.username,
                'timestamp': msg.timestamp.strftime('%H:%M %p')
            })

        return JsonResponse({'messages': message_data})
    except User.DoesNotExist:
        return JsonResponse({'error': 'User not found'}, status=404)
