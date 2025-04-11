import asyncio
import json
import logging
import redis.asyncio as aioredis
from django.conf import settings

logger = logging.getLogger('websocket')

class RedisListener:
    def __init__(self):
        self.redis_client = None
        self.pubsub = None
        self.running = False
        self.listener_task = None
        self.message_handlers = []
        self.lock = asyncio.Lock()
        
    async def connect(self):
        if self.redis_client is None:
            self.redis_client = await aioredis.from_url('redis://redis:6379/0')
            self.pubsub = self.redis_client.pubsub()
            
    async def subscribe(self, pattern):
        await self.connect()
        async with self.lock:
            await self.pubsub.psubscribe(pattern)
        
    async def unsubscribe(self, channel):
        if self.pubsub:
            async with self.lock:
                await self.pubsub.unsubscribe(channel)
            
    def add_message_handler(self, handler):
        self.message_handlers.append(handler)
        
    def remove_message_handler(self, handler):
        if handler in self.message_handlers:
            self.message_handlers.remove(handler)
            
    async def start_listening(self):
        if self.running:
            return
            
        self.running = True
        self.listener_task = asyncio.create_task(self._listen())
        
    async def stop_listening(self):
        self.running = False
        if self.listener_task:
            self.listener_task.cancel()
            try:
                await self.listener_task
            except asyncio.CancelledError:
                pass
            self.listener_task = None
            
    async def _listen(self):
        await self.connect()
        
        try:
            async with self.lock:
                async for message in self.pubsub.listen():
                    if not self.running:
                        break
                        
                    if message['type'] == 'message' or message['type'] == 'pmessage':
                        # Process message
                        channel = message['channel'].decode('utf-8')
                        data = message['data']
                        
                        # Call all registered handlers
                        for handler in self.message_handlers:
                            try:
                                await handler(channel, data)
                            except Exception as e:
                                logger.error(f"Error in message handler: {str(e)}")
        except asyncio.CancelledError:
            logger.info("Redis listener task cancelled")
        except Exception as e:
            logger.error(f"Error in Redis listener: {str(e)}")
            if self.running:
                # Restart listening after a short delay
                await asyncio.sleep(1)
                self.listener_task = asyncio.create_task(self._listen())

    async def test_connection(self):
        """Test Redis PubSub functionality with a separate connection"""
        # Create a separate connection for testing
        test_redis = await aioredis.from_url('redis://redis:6379/0')
        test_pubsub = test_redis.pubsub()
        
        try:
            test_channel = "test:channel"
            await test_pubsub.subscribe(test_channel)
            
            # Publish a test message
            await test_redis.publish(test_channel, json.dumps({"test": "message"}))
            
            # Wait for the message with a timeout
            received = False
            async for message in test_pubsub.listen():
                if message['type'] == 'message':
                    received = True
                    break
                    
            await test_pubsub.unsubscribe(test_channel)
            return received
        finally:
            await test_pubsub.close()
            await test_redis.close()

# Create a singleton instance
redis_listener = RedisListener() 