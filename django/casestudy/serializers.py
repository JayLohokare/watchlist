from rest_framework import serializers
from .models import Security, UserWatchList


class SecuritySerializer(serializers.ModelSerializer):
    """
    Serializer for the Security model.
    """
    class Meta:
        model = Security
        fields = ['id', 'name', 'ticker', 'last_price']


class UserWatchListSerializer(serializers.ModelSerializer):
    """
    Serializer for the UserWatchList model.
    """
    class Meta:
        model = UserWatchList
        fields = ['id', 'user', 'name', 'description', 'created_at', 'updated_at', 'securities']
        read_only_fields = ['created_at', 'updated_at'] 