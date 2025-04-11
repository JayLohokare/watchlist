from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth.models import User, AnonymousUser
from django.db import close_old_connections
import urllib.parse

class TokenAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        close_old_connections()
        
        # Get token from query string
        query_string = scope.get('query_string', b'').decode()
        query_params = dict(urllib.parse.parse_qsl(query_string))
        token = query_params.get('token', None)
        
        if token:
            # Get user from token
            user = await self.get_user_from_token(token)
            scope['user'] = user
        else:
            scope['user'] = AnonymousUser()
            
        return await super().__call__(scope, receive, send)
    
    @database_sync_to_async
    def get_user_from_token(self, token):
        try:
            # Simple token auth for demo purposes
            # In a real app, use proper token authentication
            user_id = int(token)
            return User.objects.get(id=user_id)
        except (ValueError, User.DoesNotExist):
            return AnonymousUser() 