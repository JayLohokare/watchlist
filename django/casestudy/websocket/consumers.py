import json
import asyncio
import redis.asyncio as aioredis
from channels.generic.websocket import AsyncWebsocketConsumer
import weakref
import datetime
import logging

# Configure logger
logger = logging.getLogger('websocket')

# Global Redis client and PubSub connection
redis_client = None
pubsub = None
listener_task = None
# Track all active consumers by their channel_name
active_consumers = weakref.WeakValueDictionary()
# Track which securities each consumer is subscribed to
security_subscribers = {}
# Track which securities we're currently subscribed to at the Redis level
subscribed_securities = set()

async def initialize_redis():
    """Initialize the shared Redis client and PubSub connection"""
    global redis_client, pubsub, listener_task
    
    if redis_client is None:
        redis_client = await aioredis.from_url('redis://redis:6379/0')
        pubsub = redis_client.pubsub()
        
        # Start the global listener task if not already running
        if listener_task is None or listener_task.done():
            listener_task = asyncio.create_task(listen_for_updates())
            
    async def test_redis_pubsub():
        """Test Redis PubSub functionality"""
        test_channel = "test:channel"
        await pubsub.subscribe(test_channel)
        
        # Publish a test message
        await redis_client.publish(test_channel, json.dumps({"test": "message"}))
        
        # Wait for the message
        async for message in pubsub.listen():
            # print(f"Test message received: {message}")
            if message['type'] == 'message':
                # Unsubscribe after receiving the test message
                await pubsub.unsubscribe(test_channel)
                break

    # Call this after initializing Redis
    asyncio.create_task(test_redis_pubsub())

async def listen_for_updates():
    """Global listener for all Redis updates"""
    try:
        # logger.info("Starting global Redis listener")

        # First subscribe to channels before listening
        # if subscribed_securities:
        #     channels = [f"stock:price:{ticker}" for ticker in subscribed_securities]
        #     logger.info(f"Initially subscribing to channels: {channels}")
        #     await pubsub.subscribe(*channels)

        await pubsub.psubscribe("stock:price:*")
        
        async for message in pubsub.listen():
            # logger.debug(f"Received Redis message: {message}")
            
            if message['type'] == 'message':
                # Extract ticker from channel name (stock:price:AAPL -> AAPL)
                channel = message['channel'].decode('utf-8')
                ticker = channel.split(':')[-1]
                
                # Parse the message data (which contains the price update)
                try:
                    message_data = json.loads(message['data'].decode('utf-8'))
                    price = message_data.get('price')
                    
                    # logger.debug(f"consumer Processing price update for {ticker}: {price}")
                    
                    # Send update to all consumers subscribed to this ticker
                    if ticker in security_subscribers and price is not None:
                        for channel_name in security_subscribers[ticker]:
                            consumer = active_consumers.get(channel_name)
                            if consumer:
                                await consumer.send(text_data=json.dumps({
                                    'ticker': ticker,
                                    'price': price
                                }))
                                # logger.debug(f"Sent update to consumer {channel_name} for {ticker}: {price}")
                except Exception as e:
                    logger.error(f"Error processing message for {ticker}: {str(e)}")
                    # Continue processing other messages
    except asyncio.CancelledError:
        logger.info("Global Redis listener task cancelled")
    except Exception as e:
        logger.error(f"Error in global Redis listener: {str(e)}")
        # Restart the listener after a short delay
        await asyncio.sleep(1)
        global listener_task
        listener_task = asyncio.create_task(listen_for_updates())

async def subscribe_to_ticker(ticker):
    """Subscribe to a ticker at the Redis level if not already subscribed"""
    global subscribed_securities
    
    if ticker not in subscribed_securities:
        channel = f"stock:price:{ticker}"
        await pubsub.subscribe(channel)
        subscribed_securities.add(ticker)
        # logger.info(f"Subscribed to Redis channel: {channel}")

async def unsubscribe_from_ticker(ticker):
    """Unsubscribe from a ticker at the Redis level if no consumers are subscribed"""
    global subscribed_securities
    
    if ticker in subscribed_securities and (ticker not in security_subscribers or not security_subscribers[ticker]):
        channel = f"stock:price:{ticker}"
        await pubsub.unsubscribe(channel)
        subscribed_securities.remove(ticker)
        logger.info(f"Unsubscribed from Redis channel: {channel}")

class SecurityConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.subscribed_securities = set()
        
    async def connect(self):
        # Accept the connection
        await self.accept()
        # logger.info(f"WebSocket connection established for user: {self.scope['user']}")
        
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
        # logger.info(f"WebSocket disconnected with code: {close_code}")
        
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
            
            # logger.debug(f"Received WebSocket message: {data}")
            
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
        # logger.info(f"Subscribing to securities: {securities}")
        
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
                # Add debug logging
                # logger.debug(f"Fetching initial price for {ticker}")
                price_data = await redis_client.hgetall(f"stock:price:{ticker}")
                # logger.debug(f"Price data for {ticker}: {price_data}")
                
                if price_data and b'value' in price_data:
                    price = price_data[b'value'].decode('utf-8')
                    await self.send(text_data=json.dumps({
                        'ticker': ticker,
                        'price': price
                    }))
                    # logger.debug(f"Sent initial price for {ticker}: {price}")
            except Exception as e:
                logger.error(f"Error sending initial price for {ticker}: {str(e)}")
                
    async def unsubscribe_from_securities(self, securities):
        # logger.info(f"Unsubscribing from securities: {securities}")
        
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
        except Exception as e:
            logger.error(f"Error in heartbeat: {str(e)}") 