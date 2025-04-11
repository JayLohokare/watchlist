import redis

# Connect to your Redis instance
r = redis.Redis(host='localhost', port=6379, db=0)  # Adjust host/port as needed

# List all keys
keys = r.keys('*')
print("All keys:", keys)

# For each key, print its type and value
for key in keys:
    key_type = r.type(key).decode('utf-8')
    print(f"\nKey: {key.decode('utf-8')}")
    print(f"Type: {key_type}")
    
    if key_type == 'string':
        print(f"Value: {r.get(key).decode('utf-8')}")
    elif key_type == 'list':
        print(f"Values: {[x.decode('utf-8') for x in r.lrange(key, 0, -1)]}")
    elif key_type == 'set':
        print(f"Values: {[x.decode('utf-8') for x in r.smembers(key)]}")
    elif key_type == 'hash':
        hash_data = r.hgetall(key)
        print("Values:", {k.decode('utf-8'): v.decode('utf-8') for k, v in hash_data.items()})
    elif key_type == 'zset':
        print(f"Values: {r.zrange(key, 0, -1, withscores=True)}") 