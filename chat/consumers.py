import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import User
from .models import Message, ChatUser
from django.utils import timezone


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope['user']
        print(f"WebSocket connection: user={self.user}, authenticated={self.user.is_authenticated}")

        if not self.user.is_authenticated:
            await self.close()
            return

        self.username = self.user.username

        # Join user-specific group
        await self.channel_layer.group_add(
            f"user_{self.username}",
            self.channel_name
        )

        # Join general notification group
        await self.channel_layer.group_add(
            "users_status",
            self.channel_name
        )

        # Update user status to online
        await self.update_user_status('Online')

        # Broadcast user online status
        await self.channel_layer.group_send(
            "users_status",
            {
                'type': 'user_status',
                'username': self.username,
                'status': 'Online'
            }
        )

        await self.accept()

    async def disconnect(self, close_code):
        # Update user status to offline
        await self.update_user_status('Offline')

        # Broadcast user offline status
        await self.channel_layer.group_send(
            "users_status",
            {
                'type': 'user_status',
                'username': self.username,
                'status': 'Offline'
            }
        )

        # Leave groups
        await self.channel_layer.group_discard(
            f"user_{self.username}",
            self.channel_name
        )
        await self.channel_layer.group_discard(
            "users_status",
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        print(f"Received WebSocket data: {data}")
        message_type = data.get('type', 'chat_message')

        if message_type == 'chat_message':
            message = data['message']
            recipient = data['recipient']
            print(f"Processing message: {message} to {recipient}")

            # Save message to database
            await self.save_message(recipient, message)

            # Send message to recipient
            await self.channel_layer.group_send(
                f"user_{recipient}",
                {
                    'type': 'chat_message',
                    'message': message,
                    'sender': self.username,
                    'timestamp': timezone.now().strftime('%H:%M %p')
                }
            )

            # Send confirmation back to sender
            await self.send(text_data=json.dumps({
                'type': 'message_sent',
                'message': message,
                'recipient': recipient,
                'timestamp': timezone.now().strftime('%H:%M %p')
            }))

        elif message_type == 'status_change':
            status = data['status']
            await self.update_user_status(status)

            # Broadcast status change
            await self.channel_layer.group_send(
                "users_status",
                {
                    'type': 'user_status',
                    'username': self.username,
                    'status': status
                }
            )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message': event['message'],
            'sender': event['sender'],
            'timestamp': event['timestamp']
        }))

    async def user_status(self, event):
        await self.send(text_data=json.dumps({
            'type': 'user_status',
            'username': event['username'],
            'status': event['status']
        }))

    @database_sync_to_async
    def save_message(self, recipient_username, content):
        try:
            recipient = User.objects.get(username=recipient_username)
            Message.objects.create(
                sender=self.scope['user'],
                receiver=recipient,
                content=content
            )
            print(f"Message saved: {content}")
        except Exception as e:
            print(f"Error saving message: {e}")

    @database_sync_to_async
    def update_user_status(self, status):
        chat_user, _ = ChatUser.objects.get_or_create(user=self.scope['user'])
        chat_user.status = status
        chat_user.save()