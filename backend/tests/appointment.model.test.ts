import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Appointment } from '../src/modules/appointment/appointment.model.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';

describe('Appointment Model', () => {
  beforeAll(async () => {
    await connectTestDB();
    await Appointment.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  const baseAppointmentData = {
    patientId: new Types.ObjectId(),
    doctorId: new Types.ObjectId(),
    start: new Date('2026-12-01T10:00:00.000Z'),
    end: new Date('2026-12-01T10:15:00.000Z'),
    queueDate: '2026-12-01',
    tokenNumber: 1,
    fee: 1000,
  };

  it('creates an appointment with default status and payment status', async () => {
    const apt = await Appointment.create(baseAppointmentData);

    expect(apt._id).toBeDefined();
    expect(apt.status).toBe('booked');
    expect(apt.paymentStatus).toBe('pay_at_clinic');
    expect(apt.source).toBe('website');
    expect(apt.isDeleted).toBe(false);
  });

  it('fails when required fields are missing', async () => {
    const apt = new Appointment({});
    let error: any;
    try {
      await apt.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.patientId).toBeDefined();
    expect(error.errors.doctorId).toBeDefined();
    expect(error.errors.start).toBeDefined();
    expect(error.errors.end).toBeDefined();
    expect(error.errors.tokenNumber).toBeDefined();
    expect(error.errors.queueDate).toBeDefined();
    expect(error.errors.fee).toBeDefined();
  });

  it('validates status enum values', async () => {
    const apt = new Appointment({
      ...baseAppointmentData,
      status: 'pending_confirmation' as any,
    });

    await expect(apt.validate()).rejects.toThrow();
  });

  it('prevents two active appointments from sharing the same doctor and start time', async () => {
    const sharedDoctorId = new Types.ObjectId();
    const sharedStartTime = new Date('2026-12-05T09:30:00.000Z');
    const sharedEndTime = new Date('2026-12-05T09:45:00.000Z');

    // First booking
    await Appointment.create({
      patientId: new Types.ObjectId(),
      doctorId: sharedDoctorId,
      start: sharedStartTime,
      end: sharedEndTime,
      queueDate: '2026-12-05',
      tokenNumber: 1,
      fee: 1500,
      status: 'booked',
    });

    // Second booking attempting same doctor and start time
    await expect(
      Appointment.create({
        patientId: new Types.ObjectId(),
        doctorId: sharedDoctorId,
        start: sharedStartTime,
        end: sharedEndTime,
        queueDate: '2026-12-05',
        tokenNumber: 2,
        fee: 1500,
        status: 'booked',
      })
    ).rejects.toThrow();
  });

  it('allows re-booking a slot if the previous appointment was cancelled or marked no-show', async () => {
    const sharedDoctorId = new Types.ObjectId();
    const sharedStartTime = new Date('2026-12-05T14:00:00.000Z');
    const sharedEndTime = new Date('2026-12-05T14:15:00.000Z');

    // Initial booking that gets cancelled
    const firstApt = await Appointment.create({
      patientId: new Types.ObjectId(),
      doctorId: sharedDoctorId,
      start: sharedStartTime,
      end: sharedEndTime,
      queueDate: '2026-12-05',
      tokenNumber: 10,
      fee: 1200,
      status: 'booked',
    });

    firstApt.status = 'cancelled';
    await firstApt.save();

    // Now a second patient can book the exact same slot
    const secondApt = await Appointment.create({
      patientId: new Types.ObjectId(),
      doctorId: sharedDoctorId,
      start: sharedStartTime,
      end: sharedEndTime,
      queueDate: '2026-12-05',
      tokenNumber: 11,
      fee: 1200,
      status: 'booked',
    });

    expect(secondApt._id).toBeDefined();
    expect(secondApt.status).toBe('booked');
  });

  it('rejects duplicate token numbers for the same doctor on the same day', async () => {
    const sharedDoctorId = new Types.ObjectId();
    const queueDate = '2026-12-05';

    await Appointment.create({
      patientId: new Types.ObjectId(),
      doctorId: sharedDoctorId,
      start: new Date('2026-12-05T10:00:00.000Z'),
      end: new Date('2026-12-05T10:15:00.000Z'),
      queueDate,
      tokenNumber: 5,
      fee: 1000,
    });

    // Different start time, but duplicate token number for same doctor & day
    await expect(
      Appointment.create({
        patientId: new Types.ObjectId(),
        doctorId: sharedDoctorId,
        start: new Date('2026-12-05T10:30:00.000Z'),
        end: new Date('2026-12-05T10:45:00.000Z'),
        queueDate,
        tokenNumber: 5, // Duplicate token
        fee: 1000,
      })
    ).rejects.toThrow();
  });

  it('has expected indexes defined including partial filter index', async () => {
    const indexes = await Appointment.collection.indexes();
    const indexNames = indexes.map((idx) => idx.name);

    expect(indexNames).toContain('doctorId_1_start_1');
    expect(indexNames).toContain('doctorId_1_queueDate_1_tokenNumber_1');

    const slotIndex = indexes.find((idx) => idx.name === 'doctorId_1_start_1');
    expect(slotIndex?.unique).toBe(true);
    expect(slotIndex?.partialFilterExpression).toBeDefined();

    const tokenIndex = indexes.find((idx) => idx.name === 'doctorId_1_queueDate_1_tokenNumber_1');
    expect(tokenIndex?.unique).toBe(true);
  });
});
