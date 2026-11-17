import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Activity } from '../src/modules/activity/activity.model.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';

describe('Activity Model', () => {
  beforeAll(async () => {
    await connectTestDB();
    await Activity.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('creates an activity log record with defaults', async () => {
    const entityId = new Types.ObjectId();
    const activity = await Activity.create({
      entityType: 'lead',
      entityId,
      type: 'stage_change',
      actorId: new Types.ObjectId(),
      meta: { fromStage: 'new', toStage: 'contacted' },
    });

    expect(activity._id).toBeDefined();
    expect(activity.entityType).toBe('lead');
    expect(activity.type).toBe('stage_change');
    expect(activity.at).toBeDefined();
    expect(activity.meta.fromStage).toBe('new');
  });

  it('fails when required fields are missing', async () => {
    const activity = new Activity({});
    let error: any;
    try {
      await activity.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.entityType).toBeDefined();
    expect(error.errors.entityId).toBeDefined();
    expect(error.errors.type).toBeDefined();
  });

  it('has expected compound index defined', async () => {
    const indexes = await Activity.collection.indexes();
    const indexNames = indexes.map((idx) => idx.name);

    expect(indexNames).toContain('entityType_1_entityId_1_at_-1');
  });
});
