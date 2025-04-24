from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib import messages
from django.db.models import Q
from .models import Message, UserProfile

@login_required
def chat_view(request):
    users = User.objects.exclude(id=request.user.id).select_related('userprofile')
    messages = Message.objects.filter(
        Q(sender=request.user) | Q(receiver=request.user)
    ).select_related('sender__userprofile', 'receiver__userprofile').order_by('timestamp')
    return render(request, 'chat.html', {'users': users, 'messages': messages})


@login_required
def get_messages(request):
    # API endpoint to get messages for a specific receiver
    receiver_id = request.GET.get('receiver')

    if not receiver_id:
        return JsonResponse({'error': 'Receiver ID is required'}, status=400)

    try:
        receiver = User.objects.get(id=receiver_id)
    except User.DoesNotExist:
        return JsonResponse({'error': 'Receiver not found'}, status=404)

    # Get messages between current user and selected receiver
    messages = Message.objects.filter(
        (Q(sender=request.user) & Q(receiver=receiver)) |
        (Q(sender=receiver) & Q(receiver=request.user))
    ).select_related('sender', 'receiver').order_by('timestamp')

    # Convert messages to JSON-serializable format
    message_list = []
    for message in messages:
        message_dict = {
            'id': message.id,
            'content': message.content,
            'timestamp': message.timestamp.isoformat(),
            'sender': message.sender.username,
            'sender_profile_picture': message.sender.userprofile.profile_picture.url if hasattr(message.sender,
                                                                                                'userprofile') and message.sender.userprofile.profile_picture else None,
        }
        message_list.append(message_dict)

    return JsonResponse(message_list, safe=False)

def login_view(request):
    if request.method == 'POST':
        username = request.POST['username']
        password = request.POST['password']
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            # Create a UserProfile if it doesn't exist
            UserProfile.objects.get_or_create(user=user)
            return redirect('chat')
        else:
            messages.error(request, 'Invalid username or password.')
    return render(request, 'login.html')

def signup_view(request):
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            # Create a UserProfile for the new user
            UserProfile.objects.create(user=user)
            username = form.cleaned_data.get('username')
            messages.success(request, f'Account created for {username}! You can now log in.')
            return redirect('login')
        else:
            # This will pass the form with errors back to the template
            return render(request, 'signup.html', {'form': form})
    else:
        form = UserCreationForm()
    return render(request, 'signup.html', {'form': form})

def logout_view(request):
    logout(request)
    return redirect('login')