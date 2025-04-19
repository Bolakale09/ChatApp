from django.db import models
from django.contrib.auth.models import User

# Create your models here.

# class ChatUser(models.Model):
#     user = models.OneToOneField(User, on_delete=models.CASCADE)
#     status = models.CharField(max_length=20, default='Away')
#
#     def __str__(self):
#         return self.user.username


class Message(models.Model):
    sender = models.ForeignKey(User, related_name='sent_messages', on_delete=models.CASCADE)
    receiver = models.ForeignKey(User, related_name='received_messages', on_delete=models.CASCADE)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"{self.sender} to {self.receiver}: {self.content}"
