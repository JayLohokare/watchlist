import json
import asyncio
import weakref
import datetime
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from .redis_listener import redis_listener

# Configure logger
logger = logging.getLogger('websocket')

# Track all active consumers by their channel_name
active_consumers = weakref.WeakValueDictionary()
# Track which securities each consumer is subscribed to
security_subscribers = {}
# Track which securities we're currently subscribed to at the Redis level
subscribed_securities = set()

async def initialize_redis():
    """Initialize the shared Redis connection and start the listener"""
    # Connect to Redis
    await redis_listener.connect()
    
    # Define the message handler for price updates
    async def handle_price_update(channel, data):
        try:
            # Extract ticker from channel name (stock:price:AAPL -> AAPL)
            ticker = channel.split(':')[-1]
            
            # Parse the message data
            message_data = json.loads(data.decode('utf-8'))
            price = message_data.get('price')
            
            # Send update to all consumers subscribed to this ticker
            if ticker in security_subscribers and price is not None:
                for channel_name in security_subscribers[ticker]:
                    consumer = active_consumers.get(channel_name)
                    if consumer:
                        await consumer.send(text_data=json.dumps({
                            'ticker': ticker,
                            'price': price
                        }))
        except Exception as e:
            logger.error(f"Error processing message: {str(e)}")
    
    # Register the handler
    redis_listener.add_message_handler(handle_price_update)
    
    # Subscribe to all stock price updates
    await redis_listener.subscribe("stock:price:*")
    
    # Start listening
    await redis_listener.start_listening()
    
    # Test the connection
    is_working = await redis_listener.test_connection()
    if is_working:
        logger.info("Redis PubSub connection test successful")
    else:
        logger.error("Redis PubSub connection test failed")

async def subscribe_to_ticker(ticker):
    """Subscribe to a ticker if not already subscribed"""
    global subscribed_securities
    
    if ticker not in subscribed_securities:
        channel = f"stock:price:{ticker}"
        await redis_listener.subscribe(channel)
        subscribed_securities.add(ticker)
        logger.info(f"Subscribed to Redis channel: {channel}")

async def unsubscribe_from_ticker(ticker):
    """Unsubscribe from a ticker if no consumers are subscribed"""
    global subscribed_securities
    
    if ticker in subscribed_securities and (ticker not in security_subscribers or not security_subscribers[ticker]):
        channel = f"stock:price:{ticker}"
        await redis_listener.unsubscribe(channel)
        subscribed_securities.remove(ticker)
        logger.info(f"Unsubscribed from Redis channel: {channel}")

class SecurityConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.subscribed_securities = set()
        
    async def connect(self):
        # Accept the connection
        await self.accept()
        
        try:
            # Initialize the shared Redis connection if needed
            await initialize_redis()
            
            # Register this consumer
            active_consumers[self.channel_name] = self
            
            # Send a connection confirmation
            await self.send(text_data=json.dumps({
                'type': 'connection_established',
                'message': 'Connected to WebSocket server'
            }))
            
            # Start a heartbeat task to verify WebSocket is working
            self.heartbeat_task = asyncio.create_task(self.send_heartbeat())
        except Exception as e:
            logger.error(f"Error connecting to Redis: {str(e)}")
            await self.close(code=1011)  # Internal error
                
    async def disconnect(self, close_code):
        # Cancel heartbeat task if it exists
        if hasattr(self, 'heartbeat_task') and self.heartbeat_task:
            self.heartbeat_task.cancel()
        
        # Unregister this consumer from all securities
        for ticker in list(self.subscribed_securities):
            if ticker in security_subscribers and self.channel_name in security_subscribers[ticker]:
                security_subscribers[ticker].remove(self.channel_name)
                
                # If no more consumers are subscribed to this ticker, unsubscribe at Redis level
                await unsubscribe_from_ticker(ticker)
        
        # Remove from active consumers
        if self.channel_name in active_consumers:
            del active_consumers[self.channel_name]
            
    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            action = data.get('action')
            
            if action == 'subscribe':
                securities = data.get('securities', [])
                await self.subscribe_to_securities(securities)
            elif action == 'unsubscribe':
                securities = data.get('securities', [])
                await self.unsubscribe_from_securities(securities)
            else:
                # Echo unknown messages for debugging
                await self.send(text_data=json.dumps({
                    'type': 'echo',
                    'message': f'Received unknown action: {action}'
                }))
        except Exception as e:
            logger.error(f"Error processing WebSocket message: {str(e)}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': f'Error processing message: {str(e)}'
            }))
            
    async def subscribe_to_securities(self, securities):
        # Add securities to the set of subscribed securities
        new_securities = set(securities) - self.subscribed_securities
        self.subscribed_securities.update(new_securities)
        
        # Register this consumer for each new security
        for ticker in new_securities:
            if ticker not in security_subscribers:
                security_subscribers[ticker] = set()
            security_subscribers[ticker].add(self.channel_name)
            
            # Subscribe at the Redis level if needed
            await subscribe_to_ticker(ticker)
            
            # Send current price for this security
            try:
                # Get Redis client from the listener
                redis_client = redis_listener.redis_client
                if redis_client:
                    price_data = await redis_client.hgetall(f"stock:price:{ticker}")
                    
                    if price_data and b'value' in price_data:
                        price = price_data[b'value'].decode('utf-8')
                        await self.send(text_data=json.dumps({
                            'ticker': ticker,
                            'price': price
                        }))
            except Exception as e:
                logger.error(f"Error sending initial price for {ticker}: {str(e)}")
                
    async def unsubscribe_from_securities(self, securities):
        # Remove securities from the set of subscribed securities
        securities_to_remove = set(securities) & self.subscribed_securities
        self.subscribed_securities -= securities_to_remove
        
        # Unregister this consumer from each security
        for ticker in securities_to_remove:
            if ticker in security_subscribers and self.channel_name in security_subscribers[ticker]:
                security_subscribers[ticker].remove(self.channel_name)
                
                # If no more consumers are subscribed to this ticker, unsubscribe at Redis level
                await unsubscribe_from_ticker(ticker)

    async def send_heartbeat(self):
        """Send periodic heartbeat messages to verify WebSocket is working"""
        try:
            while True:
                await asyncio.sleep(10)  # Send heartbeat every 10 seconds
                await self.send(text_data=json.dumps({
                    'type': 'heartbeat',
                    'timestamp': datetime.datetime.now().isoformat()
                }))
        except asyncio.CancelledError:
            # Task was cancelled, clean up
            pass 