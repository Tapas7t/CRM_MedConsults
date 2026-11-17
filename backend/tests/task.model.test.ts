import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Task } from '../src/modules/task/task.model.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';

describe('Task Model', () => {
  beforeAll(async () => {
    await connectTestDB();
    await Task.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('creates a task with defaults', async () => {
    const task = await Task.create({
      title: 'Follow up with patient regarding lab results',
      assignedTo: new Types.ObjectId(),
      dueDate: new Date('2026-12-10'),
    });

    expect(task._id).toBeDefined();
    expect(task.priority).toBe('medium');
    expect(task.status).toBe('open');
    expect(task.isDeleted).toBe(false);
  });

  it('fails when required fields are missing', async () => {
    const task = new Task({});
    let error: any;
    try {
      await task.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.title).toBeDefined();
    expect(error.errors.assignedTo).toBeDefined();
    expect(error.errors.dueDate).toBeDefined();
  });

  it('validates priority and status enum values', async () => {
    const task = new Task({
      title: 'Invalid Task',
      assignedTo: new Types.ObjectId(),
      dueDate: new Date(),
      priority: 'urgent' as any,
      status: 'pending' as any,
    });

    await expect(task.validate()).rejects.toThrow();
  });

  it('has expected indexes defined', async () => {
    const indexes = await Task.collection.indexes();
    const indexNames = indexes.map((idx) => idx.name);

    expect(indexNames).toContain('assignedTo_1_dueDate_1_status_1');
    expect(indexNames).toContain('status_1_isDeleted_1');
  });
});
