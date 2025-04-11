"""casestudy URL Configuration.


The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path

from casestudy.views import (
    LoginView, SecurityListView, UserWatchListView, 
    UserWatchListDetailView, add_security_to_watchlist,
    remove_security_from_watchlist
)

urlpatterns = [
    # The only url defined in the casestudy application are the admin urls. The admin urls are defined in the
    # django.contrib.admin application, and provide a GUI for viewing and managing the database models like 'Email'.
    # https://docs.djangoproject.com/en/4.2/ref/contrib/admin/
    path('admin/', admin.site.urls),

    path('login/', LoginView.as_view(), name='login'),
    path('securities/', SecurityListView.as_view(), name='security-list'),
    path('watchlists/', UserWatchListView.as_view(), name='watchlist-list'),
    path('watchlists/<int:pk>/', UserWatchListDetailView.as_view(), name='watchlist-detail'),
    path('watchlists/<int:watchlist_id>/add_security/', add_security_to_watchlist, name='add_security_to_watchlist'),
    path('watchlists/<int:pk>/remove_security/', remove_security_from_watchlist, name='remove-security-from-watchlist'),
]
