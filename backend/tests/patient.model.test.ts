import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Patient } from '../src/modules/patient/patient.model.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';

describe('Patient Model', () => {
  beforeAll(async () => {
    await connectTestDB();
    await Patient.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('creates a patient with default fields', async () => {
    const patient = await Patient.create({
      name: 'Ananya Deshmukh',
      phone: '+91 98201 44529',
      email: 'ananya@example.com',
      patientCode: 'MC-1001',
      status: 'active',
      whatsappOptIn: true,
    });

    expect(patient._id).toBeDefined();
    expect(patient.name).toBe('Ananya Deshmukh');
    expect(patient.patientCode).toBe('MC-1001');
    expect(patient.status).toBe('active');
    expect(patient.isDeleted).toBe(false);
  });

  it('fails when required fields are missing', async () => {
    const patient = new Patient({});
    let error: any;
    try {
      await patient.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.name).toBeDefined();
    expect(error.errors.phone).toBeDefined();
    expect(error.errors.patientCode).toBeDefined();
  });

  it('enforces patientCode uniqueness', async () => {
    await Patient.create({
      name: 'Patient Alpha',
      phone: '9876543210',
      patientCode: 'MC-DUP-01',
    });

    await expect(
      Patient.create({
        name: 'Patient Beta',
        phone: '9876543211',
        patientCode: 'MC-DUP-01',
      })
    ).rejects.toThrow();
  });

  it('has expected indexes including text index on name', async () => {
    const indexes = await Patient.collection.indexes();
    const indexNames = indexes.map((idx) => idx.name);

    expect(indexNames).toContain('patientCode_1');
    expect(indexNames).toContain('name_text');
  });
});
