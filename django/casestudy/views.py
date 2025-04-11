"""
For more information on setting up DRF views see docs:
https://www.django-rest-framework.org/api-guide/views/#class-based-views
"""
import os
import redis
from decimal import Decimal

from rest_framework.views import APIView
from rest_framework import authentication, permissions, status
from rest_framework.response import Response
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404, redirect
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from django.conf import settings
from .models import Security, UserWatchList
from .serializers import SecuritySerializer, UserWatchListSerializer
from django.contrib import messages
from django.urls import reverse
from django.http import HttpResponseForbidden, HttpResponseBadRequest
from django.contrib.auth.decorators import login_required


class SimpleTokenAuthentication(authentication.BaseAuthentication):
    """
    Simple token authentication for demo purposes.
    In a real app, you would use Django's built-in token authentication.
    """
    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith('Token '):
            return None
            
        token = auth_header.split(' ')[1]
        try:
            user_id = int(token)
            user = User.objects.get(pk=user_id)
            return (user, None)
        except (ValueError, User.DoesNotExist):
            return None


class LoginView(APIView):
    """
    Login view for the API.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, format=None):
        """
        Login view for the API.
        """
        username = request.data['username']
        user = User.objects.get(username=username)
        user_data = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
        }
        return Response(user_data)


class SecurityListView(APIView):
    """
    View to list all securities in the system.
    """
    authentication_classes = [SimpleTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, format=None):
        """
        Return a list of all securities, trying Redis first and falling back to database.
        """
        try:
            # Try to get securities from Redis
            redis_client = redis.Redis(host='redis', port=6379, db=0)
            
            # Check if Redis is available
            if redis_client.ping():
                # Get all keys matching stock:detail:*
                detail_keys = redis_client.keys('stock:detail:*')
                
                if detail_keys:
                    securities_data = []
                    
                    for key in detail_keys:
                        # Extract ticker from key (stock:detail:AAPL -> AAPL)
                        ticker = key.decode('utf-8').split(':')[-1]
                        
                        # Get company details
                        details = redis_client.hgetall(f'stock:detail:{ticker}')
                        if not details:
                            continue
                            
                        # Get price data
                        price_data = redis_client.hgetall(f'stock:price:{ticker}')
                        
                        # Create security object
                        security = {
                            'ticker': ticker,
                            'name': details.get(b'company_name', b'Unknown').decode('utf-8'),
                            'last_price': Decimal(price_data.get(b'value', b'0').decode('utf-8')) if price_data else None
                        }
                        
                        # Get the database ID if available
                        db_security = Security.objects.filter(ticker=ticker).first()
                        security['id'] = db_security.id if db_security else None
                        
                        securities_data.append(security)
                    
                    # If we have data from Redis, return it
                    if securities_data:
                        return Response(securities_data)
        
        except Exception as e:
            # Log the error but continue to database fallback
            print(f"Error fetching from Redis: {str(e)}")
        
        # Fallback to database
        securities = Security.objects.all()
        serializer = SecuritySerializer(securities, many=True)
        return Response(serializer.data)


class UserWatchListView(APIView):
    """
    View to list all watchlists for the authenticated user and create new ones.
    """
    authentication_classes = [SimpleTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, format=None):
        """
        Return a list of all watchlists for the authenticated user.
        """
        watchlists = UserWatchList.objects.filter(user=request.user)
        serializer = UserWatchListSerializer(watchlists, many=True)
        return Response(serializer.data)

    def post(self, request, format=None):
        """
        Create a new watchlist for the authenticated user.
        """
        # Add the user to the request data
        data = request.data.copy()
        data['user'] = request.user.id
        
        serializer = UserWatchListSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserWatchListDetailView(APIView):
    """
    View to manage a specific watchlist.
    """
    authentication_classes = [SimpleTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, pk, format=None):
        """
        Retrieve a specific watchlist.
        """
        watchlist = get_object_or_404(UserWatchList, pk=pk, user=request.user)
        serializer = UserWatchListSerializer(watchlist)
        return Response(serializer.data)
    
    def put(self, request, pk, format=None):
        """
        Update a specific watchlist.
        """
        watchlist = get_object_or_404(UserWatchList, pk=pk, user=request.user)
        serializer = UserWatchListSerializer(watchlist, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, pk, format=None):
        """
        Delete a specific watchlist.
        """
        watchlist = get_object_or_404(UserWatchList, pk=pk, user=request.user)
        watchlist.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@authentication_classes([SimpleTokenAuthentication])
@permission_classes([permissions.IsAuthenticated])
def add_security_to_watchlist(request, watchlist_id):
    """
    Add a security to a watchlist.
    """
    # The user is already authenticated by DRF
    user = request.user
    
    # Get the watchlist
    watchlist = get_object_or_404(UserWatchList, id=watchlist_id, user=user)
    
    # Get the security ID from the request data
    security_id = request.data.get('security_id')
    
    if not security_id:
        return Response(
            {'error': 'security_id is required'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Get the security
    security = get_object_or_404(Security, id=security_id)
    
    # Add the security to the watchlist
    watchlist.securities.add(security)
    
    return Response(
        {'message': f'Added {security.name} to your watchlist successfully'}, 
        status=status.HTTP_200_OK
    )


@api_view(['POST'])
@authentication_classes([SimpleTokenAuthentication])
@permission_classes([permissions.IsAuthenticated])
def remove_security_from_watchlist(request, pk):
    """
    Remove a security from a watchlist.
    """
    # The user is already authenticated by DRF
    user = request.user
    
    # Get the watchlist
    watchlist = get_object_or_404(UserWatchList, pk=pk, user=user)
    
    # Get the security ID from the request data
    security_id = request.data.get('security_id')
    
    if not security_id:
        return Response(
            {'error': 'security_id is required'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Get the security
    security = get_object_or_404(Security, pk=security_id)
    
    # Remove the security from the watchlist
    watchlist.securities.remove(security)
    
    return Response(
        {'message': 'Security removed from watchlist successfully'}, 
        status=status.HTTP_200_OK
    )
