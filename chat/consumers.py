import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import User
from .models import Message, UserProfile
from channels.db import database_sync_to_async

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Check if user is authenticated
        if self.scope["user"].is_anonymous:
            await self.close()
            return

        self.user = self.scope["user"]
        self.room_name = f'chat_{self.user.id}'

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

        # Broadcast initial status to all clients
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
            message_type = text_data_json.get('type', '')

            if message_type == 'chat_message':
                message = text_data_json.get('message', '')
                receiver_id = text_data_json.get('receiver_id', '')

                if not message or not receiver_id:
                    return

                # Save the message in the database
                await self.save_message(message, receiver_id)

                # Get profile picture URL if available
                sender_profile = await self.get_profile_picture(self.user.id)

                # Send to receiver's group
                receiver_room = f'chat_{receiver_id}'
                await self.channel_layer.group_send(
                    receiver_room,
                    {
                        'type': 'chat_message',
                        'message': message,
                        'sender': self.user.username,
                        'sender_id': self.user.id,
                        'sender_profile_picture': sender_profile
                    }
                )

                # Send confirmation back to sender
                await self.send(text_data=json.dumps({
                    'type': 'chat_message',
                    'message': message,
                    'sender': self.user.username,
                    'sender_id': self.user.id,
                    'sender_profile_picture': sender_profile
                }))
            # Add handling for other message types if needed
        except Exception as e:
            print(f"Error in receive: {e}")
            await self.send(text_data=json.dumps({
                'error': str(e)
            }))

    async def chat_message(self, event):
        try:
            # Send chat message to WebSocket
            await self.send(text_data=json.dumps({
                'type': 'chat_message',
                'message': event['message'],
                'sender': event['sender'],
                'sender_id': event['sender_id'],
                'sender_profile_picture': event.get('sender_profile_picture', '/static/images/profile-icon.png')
            }))
        except Exception as e:
            print(f"Error in chat_message: {e}")

    async def status_update(self, event):
        try:
            # Send status update to WebSocket
            await self.send(text_data=json.dumps({
                'type': 'status_update',
                'users': event['users']
            }))
        except Exception as e:
            print(f"Error in status_update: {e}")

    @database_sync_to_async
    def save_message(self, message, receiver_id):
        try:
            receiver = User.objects.get(id=receiver_id)
            return Message.objects.create(
                sender=self.user,
                receiver=receiver,
                content=message
            )
        except User.DoesNotExist:
            raise ValueError(f"Receiver with ID {receiver_id} does not exist")
        except Exception as e:
            raise Exception(f"Failed to save message: {str(e)}")

    @database_sync_to_async
    def get_profile_picture(self, user_id):
        try:
            user = User.objects.get(id=user_id)
            profile = UserProfile.objects.filter(user=user).first()
            if profile and profile.profile_picture:
                return profile.profile_picture.url
            return '/static/images/profile-icon.png'
        except Exception:
            return '/static/images/profile-icon.png'

    @database_sync_to_async
    def set_online_status(self, is_online):
        try:
            user_profile = self.user.userprofile
            user_profile.is_online = is_online
            user_profile.save()
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

    @database_sync_to_async
    def get_all_users(self):
        users = User.objects.exclude(id=self.user.id).select_related('userprofile')
        return [
            {
                "id": user.id,
                "username": user.username,
                "is_online": user.userprofile.is_online,
            }
            for user in users
        ]