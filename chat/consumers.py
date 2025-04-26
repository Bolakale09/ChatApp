import base64
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from .models import Message, UserProfile
from channels.db import database_sync_to_async
from datetime import datetime


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Check if user is authenticated
        if self.scope["user"].is_anonymous:
            await self.close()
            return

        self.user = self.scope["user"]

        # Get the user's profile
        self.user_profile = await self.get_user_profile(self.user.id)

        # Room name uses the UserProfile ID, not the User ID
        self.room_name = f'chat_{self.user_profile.id}'

        # Join user's personal group for chat messages
        await self.channel_layer.group_add(
            self.room_name,
            self.channel_name
        )

        # Join presence group for status updates
        await self.channel_layer.group_add(
            "presence",
            self.channel_name
        )

        # Set user online status
        await self.set_online_status(True)

        # Accept the connection
        await self.accept()

        # Send initial user list to the client
        await self.send_initial_user_list()

        # Broadcast status to all clients
        await self.broadcast_status()

    async def disconnect(self, close_code):
        # Leave chat group
        if hasattr(self, 'room_name'):
            await self.channel_layer.group_discard(
                self.room_name,
                self.channel_name
            )

        # Leave presence group and set offline status
        if self.user.is_authenticated:
            await self.set_online_status(False)
            await self.channel_layer.group_discard(
                "presence",
                self.channel_name
            )
            await self.broadcast_status()

    async def receive(self, text_data):
        try:
            text_data_json = json.loads(text_data)
            message_type = text_data_json.get('type', 'chat_message')


            if message_type == 'chat_message':
                message = text_data_json.get('message', '')
                receiver_id = text_data_json.get('receiver_id', '')
                image_url = None

                if text_data_json['image_base64']:
                    # Decode base64 and save image
                    image_data = base64.b64decode(text_data_json['image_base64'])
                    image_file = ContentFile(image_data, name='image.jpg')
                    path = default_storage.save(f'media/images/image.jpg', image_file)
                    image_url = default_storage.url(path)

                if (not message and not image_url) or not receiver_id:
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'error': 'Message or receiver_id missing'
                    }))
                    return

                # Save the message in the database
                saved_message = await self.save_message(message,image_url, receiver_id)

                # Format timestamp for frontend
                timestamp = saved_message.timestamp.strftime('%Y-%m-%dT%H:%M:%S.%fZ')

                # Get sender's user profile
                sender_profile_pic = await self.get_profile_picture_url(self.user_profile)

                # Send to receiver's group - using UserProfile ID for the room
                receiver_room = f'chat_{receiver_id}'
                await self.channel_layer.group_send(
                    receiver_room,
                    {
                        'type': 'chat_message',
                        'message': message,
                        'content': message,  # Include both for compatibility
                        'sender': self.user.username,
                        'sender_id': self.user_profile.id,  # Send profile ID, not user ID
                        'receiver_id': receiver_id,
                        'sender_profile_picture': sender_profile_pic,
                        'timestamp': timestamp,
                        'image_url': image_url
                    }
                )

                # Send confirmation back to sender
                await self.send(text_data=json.dumps({
                    'type': 'chat_message',
                    'message': message,
                    'content': message,  # Include both for compatibility
                    'sender': self.user.username,
                    'sender_id': self.user_profile.id,  # Send profile ID, not user ID
                    'receiver_id': receiver_id,
                    'sender_profile_picture': sender_profile_pic,
                    'timestamp': timestamp,
                    'image_url': image_url
                }))
            elif message_type == 'ping':
                # Handle ping request for keeping connection alive
                await self.send(text_data=json.dumps({
                    'type': 'pong'
                }))
            else:
                # Handle other message types if needed
                pass

        except Exception as e:
            print(f"Error in receive: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'error': str(e)
            }))

    async def chat_message(self, event):
        try:
            # Send chat message to WebSocket
            message_data = {
                'type': 'chat_message',
                'message': event.get('message', ''),
                'content': event.get('content', event.get('message', '')),
                'sender': event['sender'],
                'sender_id': event['sender_id'],
                'receiver_id': event.get('receiver_id'),
                'sender_profile_picture': event.get('sender_profile_picture', '/static/images/profile-icon.png'),
                'timestamp': event.get('timestamp', datetime.now().isoformat())
            }

            # Add image URL if present
            if 'image_url' in event:
                message_data['image_url'] = event['image_url']

            await self.send(text_data=json.dumps(message_data))
        except Exception as e:
            print(f"Error in chat_message: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'error': f"Failed to process message: {str(e)}"
            }))

    async def status_update(self, event):
        try:
            # Send status update to WebSocket
            await self.send(text_data=json.dumps({
                'type': 'status_update',
                'users': event['users']
            }))
        except Exception as e:
            print(f"Error in status_update: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'error': f"Failed to update status: {str(e)}"
            }))

    @database_sync_to_async
    def get_user_profile(self, user_id):
        """Get the UserProfile instance for a User ID"""
        user = User.objects.get(id=user_id)
        profile, created = UserProfile.objects.get_or_create(user=user)
        return profile

    @database_sync_to_async
    def save_message(self, message,image_url, receiver_id):
        try:
            # Get the receiver's UserProfile
            receiver_profile = UserProfile.objects.get(id=receiver_id)
            # Get the sender's UserProfile (which we've already stored)
            sender_profile = self.user_profile

            # Create message using the correct model fields
            return Message.objects.create(
                sender=sender_profile,
                receiver=receiver_profile,
                content=message,
                image_url=image_url
            )
        except UserProfile.DoesNotExist:
            raise ValueError(f"Receiver with ID {receiver_id} does not exist")
        except Exception as e:
            raise Exception(f"Failed to save message: {str(e)}")

    @database_sync_to_async
    def get_profile_picture_url(self, user_profile):
        """Get profile picture URL from a UserProfile instance"""
        if user_profile.profile_picture:
            return user_profile.profile_picture.url
        return '/static/images/profile-icon.png'

    @database_sync_to_async
    def set_online_status(self, is_online):
        try:
            # We already have the user_profile
            self.user_profile.is_online = is_online
            self.user_profile.save()
        except Exception as e:
            print(f"Error setting online status: {e}")

    async def broadcast_status(self):
        users = await self.get_all_users()
        await self.channel_layer.group_send(
            "presence",
            {
                "type": "status_update",
                "users": users,
            }
        )

    async def send_initial_user_list(self):
        users = await self.get_all_users()
        await self.send(text_data=json.dumps({
            "type": "status_update",
            "users": users,
        }))

    @database_sync_to_async
    def get_all_users(self):
        # Get all UserProfile objects instead of Users
        profiles = UserProfile.objects.exclude(user=self.user).select_related('user')
        return [
            {
                "id": profile.id,  # Use UserProfile ID
                "username": profile.user.username,
                "is_online": profile.is_online,
                "profile_picture": profile.profile_picture.url if profile.profile_picture else '/static/images/profile-icon.png'
            }
            for profile in profiles
        ]
