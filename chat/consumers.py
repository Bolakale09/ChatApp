import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import User
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
            message_type = text_data_json.get('type', 'chat_message')  # Default to chat_message

            if message_type == 'chat_message':
                message = text_data_json.get('message', '')
                receiver_id = text_data_json.get('receiver_id', '')

                if not message or not receiver_id:
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'error': 'Message or receiver_id missing'
                    }))
                    return

                # Save the message in the database
                saved_message = await self.save_message(message, receiver_id)

                # Format timestamp for frontend
                timestamp = saved_message.timestamp.strftime('%Y-%m-%dT%H:%M:%S.%fZ')

                # Get profile picture URL if available
                sender_profile = await self.get_profile_picture(self.user.id)
                receiver_profile = await self.get_profile_picture(receiver_id)

                # Send to receiver's group
                receiver_room = f'chat_{receiver_id}'
                await self.channel_layer.group_send(
                    receiver_room,
                    {
                        'type': 'chat_message',
                        'message': message,
                        'content': message,  # Include both for compatibility
                        'sender': self.user.username,
                        'sender_id': self.user.id,
                        'receiver_id': receiver_id,
                        'sender_profile_picture': sender_profile,
                        'timestamp': timestamp
                    }
                )

                # Send confirmation back to sender
                await self.send(text_data=json.dumps({
                    'type': 'chat_message',
                    'message': message,
                    'content': message,  # Include both for compatibility
                    'sender': self.user.username,
                    'sender_id': self.user.id,
                    'receiver_id': receiver_id,
                    'sender_profile_picture': sender_profile,
                    'timestamp': timestamp
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
            await self.send(text_data=json.dumps({
                'type': 'chat_message',
                'message': event['message'],
                'content': event.get('content', event['message']),  # Include both for compatibility
                'sender': event['sender'],
                'sender_id': event['sender_id'],
                'receiver_id': event.get('receiver_id'),
                'sender_profile_picture': event.get('sender_profile_picture', '/static/images/profile-icon.png'),
                'timestamp': event.get('timestamp', datetime.now().isoformat())
            }))
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
            user_profile = UserProfile.objects.get(user=self.user)
            user_profile.is_online = is_online
            user_profile.save()
        except UserProfile.DoesNotExist:
            # Create profile if it doesn't exist
            UserProfile.objects.create(user=self.user, is_online=is_online)
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
        users = User.objects.exclude(id=self.user.id).select_related('userprofile')
        return [
            {
                "id": user.id,
                "username": user.username,
                "is_online": hasattr(user, 'userprofile') and user.userprofile.is_online,
                "profile_picture": self.get_profile_picture_sync(user)
            }
            for user in users
        ]

    def get_profile_picture_sync(self, user):
        try:
            profile = UserProfile.objects.filter(user=user).first()
            if profile and profile.profile_picture:
                return profile.profile_picture.url
            return '/static/images/profile-icon.png'
        except Exception:
            return '/static/images/profile-icon.png'

