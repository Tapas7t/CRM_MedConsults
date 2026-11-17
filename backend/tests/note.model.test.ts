import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Note } from '../src/modules/note/note.model.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';

describe('Note Model', () => {
  beforeAll(async () => {
    await connectTestDB();
    await Note.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('creates a clinical note with defaults', async () => {
    const note = await Note.create({
      patientId: new Types.ObjectId(),
      authorId: new Types.ObjectId(),
      body: 'Patient reports mild headache for 3 days. Prescribed rest and fluids.',
    });

    expect(note._id).toBeDefined();
    expect(note.visibility).toBe('clinical');
    expect(note.isDraft).toBe(false);
    expect(note.isDeleted).toBe(false);
  });

  it('fails when required fields are missing', async () => {
    const note = new Note({});
    let error: any;
    try {
      await note.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.patientId).toBeDefined();
    expect(error.errors.authorId).toBeDefined();
    expect(error.errors.body).toBeDefined();
  });

  it('validates visibility enum values', async () => {
    const note = new Note({
      patientId: new Types.ObjectId(),
      authorId: new Types.ObjectId(),
      body: 'Some note',
      visibility: 'public_confidential' as any,
    });

    await expect(note.validate()).rejects.toThrow();
  });

  it('has expected indexes defined', async () => {
    const indexes = await Note.collection.indexes();
    const indexNames = indexes.map((idx) => idx.name);

    expect(indexNames).toContain('patientId_1_isDeleted_1');
    expect(indexNames).toContain('authorId_1_visibility_1');
  });
});
