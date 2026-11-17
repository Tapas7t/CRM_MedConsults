import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Notification } from '../src/modules/notification/notification.model.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';

describe('Notification Model', () => {
  beforeAll(async () => {
    await connectTestDB();
    await Notification.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('creates an in-app notification with defaults', async () => {
    const notification = await Notification.create({
      userId: new Types.ObjectId(),
      type: 'appointment_confirmed',
      title: 'Appointment Booked',
      message: 'Your OPD appointment with Dr. Rajiv Menon is confirmed.',
      link: '/appointments/view/123',
    });

    expect(notification._id).toBeDefined();
    expect(notification.read).toBe(false);
    expect(notification.title).toBe('Appointment Booked');
  });

  it('fails when required fields are missing', async () => {
    const notification = new Notification({});
    let error: any;
    try {
      await notification.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.userId).toBeDefined();
    expect(error.errors.type).toBeDefined();
    expect(error.errors.title).toBeDefined();
    expect(error.errors.message).toBeDefined();
  });

  it('has expected index on userId and read status', async () => {
    const indexes = await Notification.collection.indexes();
    const indexNames = indexes.map((idx) => idx.name);

    expect(indexNames).toContain('userId_1_read_1');
  });
});
