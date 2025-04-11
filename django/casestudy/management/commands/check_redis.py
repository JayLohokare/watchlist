from django.core.management.base import BaseCommand
import redis

class Command(BaseCommand):
    help = 'Check Redis content'

    def handle(self, *args, **options):
        # Connect to Redis
        r = redis.Redis(host='redis', port=6379, db=0)  # Use 'redis' as host if using Docker Compose
        
        # List all keys
        keys = r.keys('*')
        self.stdout.write(f"Found {len(keys)} keys in Redis")
        
        # Display each key and its content
        for key in keys:
            key_str = key.decode('utf-8')
            key_type = r.type(key).decode('utf-8')
            
            self.stdout.write(f"\nKey: {key_str}")
            self.stdout.write(f"Type: {key_type}")
            
            if key_type == 'string':
                self.stdout.write(f"Value: {r.get(key).decode('utf-8')}")
            elif key_type == 'list':
                self.stdout.write(f"Values: {[x.decode('utf-8') for x in r.lrange(key, 0, -1)]}")
            elif key_type == 'set':
                self.stdout.write(f"Values: {[x.decode('utf-8') for x in r.smembers(key)]}")
            elif key_type == 'hash':
                hash_data = r.hgetall(key)
                self.stdout.write("Values: " + str({k.decode('utf-8'): v.decode('utf-8') for k, v in hash_data.items()}))
            elif key_type == 'zset':
                self.stdout.write(f"Values: {r.zrange(key, 0, -1, withscores=True)}") 