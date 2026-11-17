import dns from 'node:dns';

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // Ignore if custom DNS is not permitted
}

import mongoose from 'mongoose';
import { env } from '../src/config/env.js';

export async function connectTestDB(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.MONGODB_URI_TEST);
  }
  return mongoose;
}

export async function disconnectTestDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export async function clearTestDB(): Promise<void> {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
}
