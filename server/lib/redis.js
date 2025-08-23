import { createClient } from 'redis';

const client = createClient({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});

client.on('error', (err) => console.error('Redis Client Error', err));

let isConnected = false;

export async function getRedisClient() {
  if (!isConnected) {
    await client.connect();
    console.log("Redis client connected successfully");
    isConnected = true;
  }
  return client;
}
