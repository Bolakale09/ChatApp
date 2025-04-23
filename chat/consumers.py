import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import User
from .models import Message, UserProfile
from channels.db import database_sync_to_async


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Check if user is authenticated
        if self.scope["user"].is_anonymous:
            # Reject the connection if user is not authenticated
            await self.close()
            return

        self.user = self.scope["user"]
        self.room_name = f'chat_{self.user.id}'

        # Join user's personal group
        await self.channel_layer.group_add(
            self.room_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        # Leave the group when disconnecting
        if hasattr(self, 'room_name'):
            await self.channel_layer.group_discard(
                self.room_name,
                self.channel_name
            )

    async def receive(self, text_data):
        try:
            text_data_json = json.loads(text_data)
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
                'message': message,
                'sender': self.user.username,
                'sender_id': self.user.id,
                'sender_profile_picture': sender_profile
            }))
        except Exception as e:
            print(f"Error in receive: {e}")
            # Send error message back to client
            await self.send(text_data=json.dumps({
                'error': str(e)
            }))

    async def chat_message(self, event):
        try:
            # Send message to WebSocket
            await self.send(text_data=json.dumps({
                'message': event['message'],
                'sender': event['sender'],
                'sender_id': event['sender_id'],
                'sender_profile_picture': event.get('sender_profile_picture', '/static/images/profile-icon.png')
            }))
        except Exception as e:
            print(f"Error in chat_message: {e}")

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