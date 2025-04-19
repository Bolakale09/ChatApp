from django.db import models
from django.contrib.auth.models import User

# Create your models here.

# class ChatUser(models.Model):
#     user = models.OneToOneField(User, on_delete=models.CASCADE)
#     status = models.CharField(max_length=20, default='Away')
#
#     def __str__(self):
#         return self.user.username


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    profile_picture = models.ImageField(upload_to='profiles/', default='images/profile-icon.png')

    def __str__(self):
        return f"{self.user.username}'s profile"

class Message(models.Model):
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages')
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_messages')
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.content
