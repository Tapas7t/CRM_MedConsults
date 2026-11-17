import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Lead } from '../src/modules/lead/lead.model.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';

describe('Lead Model', () => {
  beforeAll(async () => {
    await connectTestDB();
    await Lead.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('creates a lead with defaults', async () => {
    const lead = await Lead.create({
      name: 'Rohan Mehta',
      phone: '9820011223',
    });

    expect(lead._id).toBeDefined();
    expect(lead.stage).toBe('new');
    expect(lead.source).toBe('website');
    expect(lead.isDeleted).toBe(false);
  });

  it('fails when required fields are missing', async () => {
    const lead = new Lead({});
    let error: any;
    try {
      await lead.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.name).toBeDefined();
    expect(error.errors.phone).toBeDefined();
  });

  it('validates stage enum values', async () => {
    const lead = new Lead({
      name: 'Lead Invalid Stage',
      phone: '9820011224',
      stage: 'invalid_stage' as any,
    });

    await expect(lead.validate()).rejects.toThrow();
  });

  it('validates source enum values', async () => {
    const lead = new Lead({
      name: 'Lead Invalid Source',
      phone: '9820011225',
      source: 'billboard' as any,
    });

    await expect(lead.validate()).rejects.toThrow();
  });

  it('has expected indexes defined', async () => {
    const indexes = await Lead.collection.indexes();
    const indexNames = indexes.map((idx) => idx.name);

    expect(indexNames).toContain('stage_1_isDeleted_1');
    expect(indexNames).toContain('createdAt_1');
    expect(indexNames).toContain('phone_1_isDeleted_1');
  });
});
