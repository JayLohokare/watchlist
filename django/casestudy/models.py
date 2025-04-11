"""
Django models for the casestudy service.

We have added the initial Security model for you with common fields for a
stock market security. Add any additional fields you need to this model to
complete the case study.

Once you have added a new field to the Security model or created any new
models you can run 'make migrations' to create the new Django migration files
and apply them to the database.

https://docs.djangoproject.com/en/4.2/topics/db/models/
"""

from django.db import models


class Security(models.Model):
    """
    Represents a Stock or ETF trading in the US stock market, i.e. Apple,
    Google, SPDR S&P 500 ETF Trust, etc.
    """

    # The security's name (e.g. Netflix Inc)
    name = models.TextField(null=False, blank=False)

    # The security's ticker (e.g. NFLX)
    ticker = models.TextField(null=False, blank=False)

    # This field is used to store the last price of a security
    last_price = models.DecimalField(
        null=True, blank=True, decimal_places=2, max_digits=11,
    )


class SecurityPriceHistory(models.Model):
    """
    Represents historical price data for a Security.
    """
    # Foreign key to the Security model
    security = models.ForeignKey(
        Security, 
        on_delete=models.CASCADE,
        related_name='price_history'
    )
    
    # The date of this price record
    date = models.DateField(null=False, blank=False)
    
    # Single price field (matching the structure of the main Security model)
    price = models.DecimalField(
        null=False, blank=False, decimal_places=2, max_digits=11,
    )
    
    class Meta:
        # Ensure we don't have duplicate entries for the same security on the same date
        unique_together = ['security', 'date']
        # Add index for faster querying by date ranges
        indexes = [
            models.Index(fields=['security', 'date']),
        ]


class UserWatchList(models.Model):
    """
    Represents a user's watchlist of securities they want to track.
    """
    # Link to Django's built-in User model
    user = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='watchlists'
    )
    
    # The name of the watchlist (e.g. "Tech Stocks", "My Portfolio")
    name = models.CharField(max_length=100, null=False, blank=False)
    
    # Description of the watchlist (optional)
    description = models.TextField(null=True, blank=True)
    
    # Date the watchlist was created
    created_at = models.DateTimeField(auto_now_add=True)
    
    # Date the watchlist was last updated
    updated_at = models.DateTimeField(auto_now=True)
    
    # Many-to-many relationship with Security model
    securities = models.ManyToManyField(
        Security,
        related_name='watchlists',
        blank=True,
    )
    
    class Meta:
        # Add indexes for faster querying
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['user', 'created_at']),
        ]
        # Optional: ensure each user can't have duplicate watchlist names
        unique_together = ['user', 'name']
    
    def __str__(self):
        return self.name