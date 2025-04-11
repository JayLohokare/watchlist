from django.core.management.base import BaseCommand
import requests
import time
import logging
import json
import redis
from datetime import datetime
from django.db import transaction
from decimal import Decimal
from casestudy.models import Security, SecurityPriceHistory

logger = logging.getLogger(__name__)

ALLOW_SAME_PRICE = True

AUTO_UPDATE_PRICES = True

class Command(BaseCommand):
    help = 'Makes recurring API calls to Albert stock APIs at specified intervals'
    
    # API configuration
    API_KEY = 'd2db5753-33f6-4e25-b915-6cbdda7953e7'
    BASE_URL = 'https://app.albert.com/casestudy/stock'
    HEADERS = {'Albert-Case-Study-API-Key': API_KEY}
    OUTPUT_FILE = '/app/stock_data.txt'  # Use absolute path

    def add_arguments(self, parser):
        parser.add_argument(
            '--max-calls',
            type=int,
            default=None,
            help='Maximum number of API calls to make (default: unlimited)'
        )
        parser.add_argument(
            '--interval',
            type=int,
            default=5,
            help='Interval in seconds between API calls (default: 5)'
        )
        parser.add_argument(
            '--debug',
            action='store_true',
            help='Enable verbose debug output'
        )
        parser.add_argument(
            '--log-level',
            type=str,
            choices=['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
            default='INFO',
            help='Set logging level (default: INFO)'
        )

    def handle(self, *args, **options):
        interval = options.get('interval', 5)  # Get interval from options or default to 5
        max_calls = options['max_calls']
        calls_made = 0
        
        # Configure logging based on arguments
        self.debug_mode = options.get('debug', False)
        log_level = options.get('log_level', 'INFO')
        logging.getLogger().setLevel(getattr(logging, log_level))
        
        if self.debug_mode:
            self.stdout.write(self.style.SUCCESS(f'Debug mode enabled'))
            self.stdout.write(f'Command options: {options}')
            logger.debug(f'Starting with options: {options}')

        # Initialize Redis connection
        self.initialize_redis()

        self.stdout.write(f'Starting Albert stock API calls with {interval} second intervals')

        try:
            while True:
                if max_calls and calls_made >= max_calls:
                    self.stdout.write(self.style.SUCCESS(
                        f'Completed {max_calls} API calls. Stopping.'
                    ))
                    break

                self.make_api_call()
                calls_made += 1
                
                self.stdout.write(f'Call {calls_made} completed at {datetime.now()}')
                time.sleep(interval)

        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING(
                '\nReceived keyboard interrupt. Stopping API calls.'
            ))

    def initialize_redis(self):
        """Initialize connection to Redis"""
        try:
            self.redis_client = redis.Redis(host='redis', port=6379, db=0)
            self.stdout.write(self.style.SUCCESS('Connected to Redis successfully'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Failed to connect to Redis: {str(e)}'))
            self.redis_client = None

    def fetch_tickers(self):
        """Fetch ticker data from API"""
        if self.debug_mode:
            self.stdout.write(f'Fetching tickers from {self.BASE_URL}/tickers/')
            
        response = requests.get(
            f'{self.BASE_URL}/tickers/',
            headers=self.HEADERS
        )
        response.raise_for_status()
        
        data = response.json()
        if self.debug_mode:
            self.stdout.write(f'Received {len(data)} tickers')
            logger.debug(f'Tickers response: {json.dumps(data)[:200]}...')
            
        return data

    def fetch_prices(self, tickers_list):
        """Fetch price data for tickers from API"""
        if self.debug_mode:
            self.stdout.write(f'Fetching prices for {len(tickers_list.split(","))} tickers')
            
        response = requests.get(
            f'{self.BASE_URL}/prices/?tickers={tickers_list}',
            headers=self.HEADERS
        )
        response.raise_for_status()
        
        data = response.json()
        if self.debug_mode:
            self.stdout.write(f'Received prices for {len(data)} tickers')
            logger.debug(f'Prices response: {json.dumps(data)[:200]}...')
            
        return data

    def write_to_file(self, tickers_data, prices_data, timestamp):
        """Write data to output file"""
        self.stdout.write(f'Writing to {self.OUTPUT_FILE}')
        with open(self.OUTPUT_FILE, 'a') as f:
            f.write(f'\n--- {timestamp} ---\n')
            f.write(f'Tickers: {tickers_data}\n')
            f.write(f'Prices: {prices_data}\n')
        
        self.stdout.write(f'Successfully wrote data to {self.OUTPUT_FILE}')

    def write_to_redis(self, tickers_data, prices_data, timestamp):
        """Write data to Redis and publish updates for changed prices"""
        if not self.redis_client:
            return
            
        try:
            # Store timestamp for reference
            current_time = datetime.now().timestamp()
            
            # Store ticker details in Redis
            for ticker, company_name in tickers_data.items():
                self.redis_client.hset(
                    f"stock:detail:{ticker}",
                    mapping={
                        "company_name": company_name
                    }
                )
            
            # Store price data in Redis and publish updates
            for ticker, price in prices_data.items():
                if price is not None:  # Skip None values
                    # Get current price to check if it changed
                    current_price_data = self.redis_client.hget(f"stock:price:{ticker}", "value")
                    current_price = float(current_price_data.decode('utf-8')) if current_price_data else None
                    
                    # Update price in Redis
                    self.redis_client.hset(
                        f"stock:price:{ticker}",
                        mapping={
                            "lastUpdated": current_time,
                            "value": price
                        }
                    )

                    if AUTO_UPDATE_PRICES:
                        price = price + 1
                    
                    # Publish update if price changed
                    if current_price is None or current_price != price or ALLOW_SAME_PRICE:
                        self.redis_client.publish(f"stock:price:{ticker}", json.dumps({
                            "ticker": ticker,
                            "price": price,
                            "timestamp": current_time
                        }))
            
            self.stdout.write(self.style.SUCCESS('Successfully wrote data to Redis'))
        except Exception as e:
            logger.error(f'Failed to write to Redis: {str(e)}')
            self.stdout.write(self.style.ERROR(f'Failed to write to Redis: {str(e)}'))

    def write_to_database(self, tickers_data, prices_data, timestamp):
        """Write data to PostgreSQL database"""
        try:
            # Convert timestamp string to date object for price history
            date_obj = datetime.strptime(timestamp, '%Y-%m-%d %H:%M:%S').date()
            
            # Use a transaction to ensure data consistency
            with transaction.atomic():
                # Process each ticker and its price
                for ticker, company_name in tickers_data.items():
                    price = prices_data.get(ticker)
                    
                    # Skip if price is None
                    if price is None:
                        continue
                    
                    # Get or create the Security object
                    security, created = Security.objects.update_or_create(
                        ticker=ticker,
                        defaults={
                            'name': company_name,
                            'last_price': Decimal(str(price))
                        }
                    )
                    
                    # Create a price history record
                    SecurityPriceHistory.objects.update_or_create(
                        security=security,
                        date=date_obj,
                        defaults={
                            'price': Decimal(str(price))
                        }
                    )
                
            self.stdout.write(self.style.SUCCESS('Successfully wrote data to database'))
        except Exception as e:
            logger.error(f'Failed to write to database: {str(e)}')
            self.stdout.write(self.style.ERROR(f'Failed to write to database: {str(e)}'))

    def make_api_call(self):
        """
        Make calls to Albert's stock API endpoints and write responses to a file, Redis, and database
        """
        try:
            logger.info("Starting API call cycle")
            
            # Get tickers
            if self.debug_mode:
                self.stdout.write("Fetching ticker data...")
            tickers_data = self.fetch_tickers()
            
            # Get prices for all tickers
            tickers_list = ','.join(tickers_data.keys())
            if self.debug_mode:
                self.stdout.write(f"Fetching prices for {len(tickers_data)} tickers")
            prices_data = self.fetch_prices(tickers_list)
            
            # Format timestamp
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            # Write data to file
            self.write_to_file(tickers_data, prices_data, timestamp)
            
            # Write data to Redis
            self.write_to_redis(tickers_data, prices_data, timestamp)
            
            # Write data to database
            self.write_to_database(tickers_data, prices_data, timestamp)
            
            logger.info("API call cycle completed successfully")
            
        except requests.exceptions.RequestException as e:
            logger.error(f'API call failed: {str(e)}')
            self.stdout.write(self.style.ERROR(f'API call failed: {str(e)}'))
            if self.debug_mode:
                logger.exception("Full exception details:")
        except IOError as e:
            logger.error(f'Failed to write to file: {str(e)}')
            self.stdout.write(self.style.ERROR(f'Failed to write to file: {str(e)}'))
            if self.debug_mode:
                logger.exception("Full exception details:")
        except Exception as e:
            logger.error(f'Unexpected error: {str(e)}')
            self.stdout.write(self.style.ERROR(f'Unexpected error: {str(e)}'))
            if self.debug_mode:
                logger.exception("Full exception details:") 