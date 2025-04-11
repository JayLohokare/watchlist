import os
import django
from django.core.asgi import get_asgi_application

# Set the Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'casestudy.settings')
django.setup()

# Import after Django is set up to avoid circular imports
from channels.routing import ProtocolTypeRouter, URLRouter
from .websocket.routing import websocket_urlpatterns
from .websocket.middleware import TokenAuthMiddleware

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": TokenAuthMiddleware(
        URLRouter(
            websocket_urlpatterns
        )
    ),
}) 