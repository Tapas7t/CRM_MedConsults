import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Token } from '../src/modules/token/token.model.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';

describe('Token Model', () => {
  beforeAll(async () => {
    await connectTestDB();
    await Token.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('creates an email verification token', async () => {
    const token = await Token.create({
      userId: new Types.ObjectId(),
      type: 'verify',
      tokenHash: 'sha256_hashed_token_string_abc123',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins expiry
    });

    expect(token._id).toBeDefined();
    expect(token.type).toBe('verify');
    expect(token.tokenHash).toBe('sha256_hashed_token_string_abc123');
    expect(token.expiresAt).toBeDefined();
  });

  it('fails when required fields are missing', async () => {
    const token = new Token({});
    let error: any;
    try {
      await token.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.userId).toBeDefined();
    expect(error.errors.type).toBeDefined();
    expect(error.errors.tokenHash).toBeDefined();
    expect(error.errors.expiresAt).toBeDefined();
  });

  it('validates token type enum values', async () => {
    const token = new Token({
      userId: new Types.ObjectId(),
      type: 'login_magic_link' as any,
      tokenHash: 'hash',
      expiresAt: new Date(),
    });

    await expect(token.validate()).rejects.toThrow();
  });

  it('enforces tokenHash uniqueness', async () => {
    const duplicateHash = 'unique_hash_value_999';

    await Token.create({
      userId: new Types.ObjectId(),
      type: 'verify',
      tokenHash: duplicateHash,
      expiresAt: new Date(Date.now() + 60000),
    });

    await expect(
      Token.create({
        userId: new Types.ObjectId(),
        type: 'reset',
        tokenHash: duplicateHash,
        expiresAt: new Date(Date.now() + 60000),
      })
    ).rejects.toThrow();
  });

  it('has a TTL index configured on expiresAt', async () => {
    const indexes = await Token.collection.indexes();
    const ttlIndex = indexes.find((idx) => idx.name === 'expiresAt_1');

    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.expireAfterSeconds).toBe(0);
  });
});
