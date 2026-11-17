import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Doctor } from '../src/modules/doctor/doctor.model.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';

describe('Doctor Model', () => {
  beforeAll(async () => {
    await connectTestDB();
    await Doctor.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('creates a valid doctor with weekly availability and blocked dates', async () => {
    const doctor = await Doctor.create({
      userId: new Types.ObjectId(),
      specialty: 'Cardiology',
      qualifications: ['MBBS', 'MD Cardiology'],
      registrationNo: 'MMC-2024-9876',
      experienceYears: 12,
      languages: ['English', 'Hindi', 'Marathi'],
      consultationFee: 1500,
      clinicRoom: 'Room 204',
      bio: 'Consultant cardiologist with 12 years experience.',
      weeklyAvailability: [
        {
          dayOfWeek: 1, // Monday
          slots: [{ start: '09:00', end: '13:00' }],
        },
      ],
      blockedDates: [
        {
          date: new Date('2026-12-25'),
          reason: 'Christmas Holiday',
        },
      ],
    });

    expect(doctor._id).toBeDefined();
    expect(doctor.specialty).toBe('Cardiology');
    expect(doctor.approvalStatus).toBe('pending');
    expect(doctor.isOnline).toBe(false);
    expect(doctor.slotMinutes).toBe(15);
    expect(doctor.isDeleted).toBe(false);
    expect(doctor.weeklyAvailability).toHaveLength(1);
    expect(doctor.blockedDates).toHaveLength(1);
  });

  it('fails when required fields are missing', async () => {
    const doctor = new Doctor({});
    let error: any;
    try {
      await doctor.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.userId).toBeDefined();
    expect(error.errors.specialty).toBeDefined();
    expect(error.errors.registrationNo).toBeDefined();
    expect(error.errors.experienceYears).toBeDefined();
    expect(error.errors.consultationFee).toBeDefined();
    expect(error.errors.clinicRoom).toBeDefined();
  });

  it('validates approvalStatus enum values', async () => {
    const doctor = new Doctor({
      userId: new Types.ObjectId(),
      specialty: 'Dermatology',
      qualifications: ['MBBS'],
      registrationNo: 'REG123',
      experienceYears: 5,
      consultationFee: 800,
      clinicRoom: 'Room 101',
      approvalStatus: 'invalid_status' as any,
    });

    await expect(doctor.validate()).rejects.toThrow();
  });

  it('validates slot time format in weekly availability', async () => {
    const doctor = new Doctor({
      userId: new Types.ObjectId(),
      specialty: 'Dermatology',
      qualifications: ['MBBS'],
      registrationNo: 'REG123',
      experienceYears: 5,
      consultationFee: 800,
      clinicRoom: 'Room 101',
      weeklyAvailability: [
        {
          dayOfWeek: 1,
          slots: [{ start: '9am', end: '1pm' }], // Invalid format, should be HH:MM
        },
      ],
    });

    await expect(doctor.validate()).rejects.toThrow();
  });

  it('enforces userId uniqueness', async () => {
    const sharedUserId = new Types.ObjectId();

    await Doctor.create({
      userId: sharedUserId,
      specialty: 'Neurology',
      qualifications: ['MBBS', 'DM'],
      registrationNo: 'MMC-1111',
      experienceYears: 8,
      consultationFee: 2000,
      clinicRoom: 'Room 302',
    });

    await expect(
      Doctor.create({
        userId: sharedUserId,
        specialty: 'Pediatrics',
        qualifications: ['MBBS', 'MD'],
        registrationNo: 'MMC-2222',
        experienceYears: 6,
        consultationFee: 1200,
        clinicRoom: 'Room 303',
      })
    ).rejects.toThrow();
  });

  it('has expected indexes defined', async () => {
    const indexes = await Doctor.collection.indexes();
    const indexNames = indexes.map((idx) => idx.name);

    expect(indexNames).toContain('userId_1');
    const userIndex = indexes.find((idx) => idx.name === 'userId_1');
    expect(userIndex?.unique).toBe(true);
  });
});
