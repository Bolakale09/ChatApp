from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse

def favicon(request):
    return HttpResponse(status=204)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('chat.urls')),
    # path('__debug__/', include('debug_toolbar.urls')),
    path('favicon.ico', favicon),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)