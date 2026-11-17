import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';

describe('Database Isolation Verification', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('guarantees test environment is active and distinct from development', () => {
    expect(env.NODE_ENV).toBe('test');
    expect(env.MONGODB_URI_TEST).toBeDefined();
    expect(env.MONGODB_URI).toBeDefined();
    // Test URI must be distinct from Development URI
    expect(env.MONGODB_URI_TEST).not.toEqual(env.MONGODB_URI);
  });

  it('verifies that active connection uses test database and never development database', () => {
    expect(mongoose.connection.readyState).toBe(1);

    // Extract database name from connection string
    const getDbName = (uri: string): string => {
      try {
        const parsed = new URL(uri.replace('mongodb+srv://', 'http://').replace('mongodb://', 'http://'));
        return parsed.pathname.replace(/^\//, '').split('?')[0];
      } catch {
        return '';
      }
    };

    const devDbName = getDbName(env.MONGODB_URI);
    const testDbName = getDbName(env.MONGODB_URI_TEST);

    const activeDbName = mongoose.connection.db?.databaseName;

    expect(activeDbName).toBeDefined();
    if (testDbName) {
      expect(activeDbName).toBe(testDbName);
    }
    if (devDbName && testDbName && devDbName !== testDbName) {
      expect(activeDbName).not.toBe(devDbName);
    }
  });
});
