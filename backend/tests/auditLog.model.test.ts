import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { AuditLog } from '../src/modules/auditLog/auditLog.model.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';

describe('AuditLog Model', () => {
  beforeAll(async () => {
    await connectTestDB();
    await AuditLog.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('creates an audit log entry', async () => {
    const actorId = new Types.ObjectId();
    const audit = await AuditLog.create({
      actorId,
      role: 'admin',
      action: 'doctor_approved',
      entityType: 'doctor',
      entityId: new Types.ObjectId().toString(),
      ip: '192.168.1.50',
      meta: { previousStatus: 'pending', newStatus: 'approved' },
    });

    expect(audit._id).toBeDefined();
    expect(audit.action).toBe('doctor_approved');
    expect(audit.entityType).toBe('doctor');
    expect(audit.at).toBeDefined();
  });

  it('fails when required fields are missing', async () => {
    const audit = new AuditLog({});
    let error: any;
    try {
      await audit.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.action).toBeDefined();
    expect(error.errors.entityType).toBeDefined();
  });

  it('has expected indexes defined', async () => {
    const indexes = await AuditLog.collection.indexes();
    const indexNames = indexes.map((idx) => idx.name);

    expect(indexNames).toContain('at_-1_actorId_1');
    expect(indexNames).toContain('entityType_1_entityId_1');
  });
});
