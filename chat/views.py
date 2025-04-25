from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib import messages
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import json
import base64
import uuid
import os
from datetime import datetime
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

        # Add image URL if the message has an image
        if hasattr(message, 'image') and message.image:
            message_dict['image_url'] = message.image.url

        message_list.append(message_dict)

    return JsonResponse(message_list, safe=False)


@login_required
@csrf_exempt
def send_message_api(request):
    if request.method == 'POST':
        try:
            # Handle both form data and JSON requests
            if request.content_type and 'application/json' in request.content_type:
                data = json.loads(request.body)
                receiver_id = data.get('receiver_id')
                content = data.get('content', '')
                image_data = data.get('image_data')  # Base64 encoded image
            else:
                receiver_id = request.POST.get('receiver_id')
                content = request.POST.get('content', '')
                image_data = None

            # Check if an image file was uploaded
            image_file = request.FILES.get('image')

            if not receiver_id:
                return JsonResponse({'status': 'error', 'error': 'Missing receiver_id'})

            # At least one of content, image_file, or image_data must be provided
            if not content and not image_file and not image_data:
                return JsonResponse({'status': 'error', 'error': 'Message must have text or image'})

            try:
                receiver = User.objects.get(id=receiver_id)
            except User.DoesNotExist:
                return JsonResponse({'status': 'error', 'error': 'Receiver not found'})

            # Create message
            message = Message(
                sender=request.user,
                receiver=receiver,
                content=content if content else None
            )

            # Handle image upload (from file or base64)
            image_path = None
            if image_file:
                # Save the uploaded file
                message.image = image_file
                image_path = message.image.url
            elif image_data:
                # Process base64 encoded image
                try:
                    # Extract data after the base64 prefix
                    if ',' in image_data:
                        format_prefix, img_data = image_data.split(',', 1)
                        # Get the file extension from the format prefix
                        img_format = format_prefix.split(';')[0].split('/')[1]
                    else:
                        img_data = image_data
                        img_format = 'png'  # Default to PNG if format not specified

                    # Decode the base64 string
                    img_binary = base64.b64decode(img_data)

                    # Generate a unique filename
                    filename = f"chat_image_{uuid.uuid4()}.{img_format}"
                    filepath = os.path.join('chat_images', filename)

                    # Save the file using Django's storage
                    path = default_storage.save(filepath, ContentFile(img_binary))

                    # Set the image field to the saved path
                    message.image = path
                    image_path = default_storage.url(path)
                except Exception as e:
                    return JsonResponse({'status': 'error', 'error': f'Failed to process image: {str(e)}'})

            # Save message
            message.save()

            # Get sender's profile picture
            sender_profile = UserProfile.objects.filter(user=request.user).first()
            sender_profile_pic = sender_profile.profile_picture.url if sender_profile and sender_profile.profile_picture else '/static/images/profile-icon.png'

            # Prepare response data
            response_data = {
                'status': 'success',
                'message_id': message.id,
                'timestamp': message.timestamp.isoformat()
            }

            # Add image URL to response if present
            if message.image:
                image_url = message.image.url
                response_data['image_url'] = image_url

            # Send notification via WebSocket if possible
            try:
                channel_layer = get_channel_layer()

                # Message data for WebSocket
                ws_message = {
                    'type': 'chat_message',
                    'message': content,
                    'sender': request.user.username,
                    'sender_id': request.user.id,
                    'receiver_id': int(receiver_id),
                    'sender_profile_picture': sender_profile_pic,
                    'timestamp': message.timestamp.isoformat()
                }

                # Add image URL if available
                if message.image:
                    ws_message['image_url'] = image_url

                # Send to receiver's room
                receiver_room = f'chat_{receiver_id}'
                async_to_sync(channel_layer.group_send)(receiver_room, ws_message)
            except Exception as e:
                # Log the error but continue - WebSocket is optional
                print(f"WebSocket notification failed: {e}")

            return JsonResponse(response_data)

        except Exception as e:
            return JsonResponse({'status': 'error', 'error': str(e)})
    else:
        return JsonResponse({'status': 'error', 'error': 'Only POST requests allowed'}, status=405)


@login_required
def get_users_api(request):
    """API endpoint to get all users and their online status"""
    try:
        users = User.objects.exclude(id=request.user.id).select_related('userprofile')
        user_list = []

        for user in users:
            user_data = {
                'id': user.id,
                'username': user.username,
                'is_online': hasattr(user, 'userprofile') and user.userprofile.is_online,
            }

            # Add profile picture if available
            if hasattr(user, 'userprofile') and user.userprofile.profile_picture:
                user_data['profile_picture'] = user.userprofile.profile_picture.url
            else:
                user_data['profile_picture'] = '/static/images/profile-icon.png'

            user_list.append(user_data)

        return JsonResponse({'status': 'success', 'users': user_list})
    except Exception as e:
        return JsonResponse({'status': 'error', 'error': str(e)})


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