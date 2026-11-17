import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { User } from '../src/modules/user/user.model.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';

describe('User Model', () => {
  beforeAll(async () => {
    await connectTestDB();
    await User.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('creates a valid user with default fields', async () => {
    const user = await User.create({
      name: 'John Doe',
      email: 'John.Doe@EXAMPLE.COM ',
      passwordHash: 'hashed_secret_password_123',
    });

    expect(user._id).toBeDefined();
    expect(user.email).toBe('john.doe@example.com'); // Lowercased and trimmed
    expect(user.role).toBe('patient');
    expect(user.status).toBe('active');
    expect(user.emailVerified).toBe(false);
    expect(user.failedLogins).toBe(0);
    expect(user.isDeleted).toBe(false);
    expect(user.createdAt).toBeDefined();
  });

  it('fails validation when required fields are missing', async () => {
    const user = new User({});
    let error: any;
    try {
      await user.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.name).toBeDefined();
    expect(error.errors.email).toBeDefined();
    expect(error.errors.passwordHash).toBeDefined();
  });

  it('validates role enum values', async () => {
    const user = new User({
      name: 'Invalid Role',
      email: 'invalid@example.com',
      passwordHash: 'hash',
      role: 'superadmin' as any,
    });

    await expect(user.validate()).rejects.toThrow();
  });

  it('validates status enum values', async () => {
    const user = new User({
      name: 'Invalid Status',
      email: 'invalid@example.com',
      passwordHash: 'hash',
      status: 'suspended' as any,
    });

    await expect(user.validate()).rejects.toThrow();
  });

  it('enforces email uniqueness', async () => {
    await User.create({
      name: 'User One',
      email: 'duplicate@example.com',
      passwordHash: 'hash1',
    });

    await expect(
      User.create({
        name: 'User Two',
        email: 'duplicate@example.com',
        passwordHash: 'hash2',
      })
    ).rejects.toThrow();
  });

  it('excludes passwordHash and refreshTokenHashes from toJSON output', async () => {
    const user = await User.create({
      name: 'Secret User',
      email: 'secret@example.com',
      passwordHash: 'super_secret_hash',
      refreshTokenHashes: ['token_hash_abc'],
    });

    const json = user.toJSON();
    expect(json.passwordHash).toBeUndefined();
    expect(json.refreshTokenHashes).toBeUndefined();
    expect((json as any).__v).toBeUndefined();
    expect(json.name).toBe('Secret User');
    expect(json.email).toBe('secret@example.com');
  });

  it('has expected indexes defined', async () => {
    const indexes = await User.collection.indexes();
    const indexNames = indexes.map((idx) => idx.name);

    expect(indexNames).toContain('email_1');
    const emailIndex = indexes.find((idx) => idx.name === 'email_1');
    expect(emailIndex?.unique).toBe(true);
  });
});
