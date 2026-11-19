import dns from 'node:dns';

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // Ignore
}

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';
import { UserModel } from '../src/modules/user/user.model.js';
import { Doctor } from '../src/modules/doctor/doctor.model.js';
import { Patient } from '../src/modules/patient/patient.model.js';
import { Appointment } from '../src/modules/appointment/appointment.model.js';
import { signAccess } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/password.js';
import { getKolkataDateString } from '../src/utils/date.js';

describe('Queue Module Integration Tests (GET /api/v1/queue/today)', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  async function createDoctorFixture(email = 'dr.queue@medconsults.example', slotMinutes = 15) {
    const passwordHash = await hashPassword('DoctorPass123!');
    const user = await UserModel.create({
      name: 'Dr. Rajesh Kulkarni',
      email,
      phone: '+919820100001',
      passwordHash,
      role: 'doctor',
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });

    const doctor = await Doctor.create({
      userId: user._id,
      specialty: 'Cardiology',
      qualifications: ['MBBS', 'MD (Cardiology)'],
      registrationNo: 'MMC-QUEUE-001',
      experienceYears: 12,
      languages: ['English', 'Hindi'],
      consultationFee: 1000,
      clinicRoom: 'Room 101',
      approvalStatus: 'approved',
      slotMinutes,
      weeklyAvailability: [],
      blockedDates: [],
    });

    return { user, doctor };
  }

  async function createPatientFixture(name: string, phone: string) {
    return Patient.create({
      name,
      phone,
      patientCode: `P-${Math.random().toString().slice(2, 6)}-0001`,
      source: 'walk_in',
      status: 'active',
    });
  }

  it('enforces RBAC: 401 unauthenticated, 403 patient, 200 doctor/staff/admin', async () => {
    const { user: docUser, doctor } = await createDoctorFixture();
    const passwordHash = await hashPassword('Pass123!');
    const patientUser = await UserModel.create({
      name: 'Patient User',
      email: 'pat.queue@test.com',
      passwordHash,
      role: 'patient',
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });

    const docToken = signAccess({ userId: docUser._id.toString(), role: 'doctor' });
    const patToken = signAccess({ userId: patientUser._id.toString(), role: 'patient' });

    // 401
    const unauth = await request(app).get('/api/v1/queue/today');
    expect(unauth.status).toBe(401);

    // 403 for patient
    const forbidden = await request(app)
      .get('/api/v1/queue/today')
      .set('Authorization', `Bearer ${patToken}`);
    expect(forbidden.status).toBe(403);

    // 200 for doctor (defaults to own queue)
    const ok = await request(app)
      .get('/api/v1/queue/today')
      .set('Authorization', `Bearer ${docToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.doctorId).toBe(doctor._id.toString());
  });

  it('orders queue properly: in_consultation first, then checked_in by token, booked by start, finished; calculates estimated wait and counts', async () => {
    const { user: docUser, doctor } = await createDoctorFixture('dr.queue2@test.com', 20);
    const docToken = signAccess({ userId: docUser._id.toString(), role: 'doctor' });

    const todayStr = getKolkataDateString();

    const p1 = await createPatientFixture('Patient In Consultation', '+919820000001');
    const p2 = await createPatientFixture('Patient Checked In 2', '+919820000002');
    const p3 = await createPatientFixture('Patient Checked In 1', '+919820000003');
    const p4 = await createPatientFixture('Patient Booked Later', '+919820000004');
    const p5 = await createPatientFixture('Patient Booked Earlier', '+919820000005');
    const p6 = await createPatientFixture('Patient Completed', '+919820000006');
    const p7 = await createPatientFixture('Patient Cancelled', '+919820000007');

    // 1. Completed appointment (20 mins duration)
    await Appointment.create({
      appointmentCode: 'APT-COMPL001',
      patientId: p6._id,
      doctorId: doctor._id,
      start: new Date(`${todayStr}T08:30:00+05:30`),
      end: new Date(`${todayStr}T08:50:00+05:30`),
      status: 'completed',
      tokenNumber: 1,
      queueDate: todayStr,
      source: 'website',
      fee: 1000,
      paymentStatus: 'paid',
    });

    // 2. Currently in_consultation (token 2)
    await Appointment.create({
      appointmentCode: 'APT-INCONS01',
      patientId: p1._id,
      doctorId: doctor._id,
      start: new Date(`${todayStr}T08:50:00+05:30`),
      end: new Date(`${todayStr}T09:10:00+05:30`),
      status: 'in_consultation',
      tokenNumber: 2,
      queueDate: todayStr,
      source: 'reception',
      fee: 1000,
      paymentStatus: 'pay_at_clinic',
    });

    // 3. Checked-in token 3
    await Appointment.create({
      appointmentCode: 'APT-CHCK0003',
      patientId: p3._id,
      doctorId: doctor._id,
      start: new Date(`${todayStr}T09:10:00+05:30`),
      end: new Date(`${todayStr}T09:30:00+05:30`),
      status: 'checked_in',
      tokenNumber: 3,
      queueDate: todayStr,
      source: 'reception',
      fee: 1000,
      paymentStatus: 'pay_at_clinic',
    });

    // 4. Checked-in token 4
    await Appointment.create({
      appointmentCode: 'APT-CHCK0004',
      patientId: p2._id,
      doctorId: doctor._id,
      start: new Date(`${todayStr}T09:30:00+05:30`),
      end: new Date(`${todayStr}T09:50:00+05:30`),
      status: 'checked_in',
      tokenNumber: 4,
      queueDate: todayStr,
      source: 'reception',
      fee: 1000,
      paymentStatus: 'pay_at_clinic',
    });

    // 5. Booked earlier (10:00)
    await Appointment.create({
      appointmentCode: 'APT-BOOK0005',
      patientId: p5._id,
      doctorId: doctor._id,
      start: new Date(`${todayStr}T10:00:00+05:30`),
      end: new Date(`${todayStr}T10:20:00+05:30`),
      status: 'booked',
      tokenNumber: 5,
      queueDate: todayStr,
      source: 'website',
      fee: 1000,
      paymentStatus: 'pay_at_clinic',
    });

    // 6. Booked later (10:20)
    await Appointment.create({
      appointmentCode: 'APT-BOOK0006',
      patientId: p4._id,
      doctorId: doctor._id,
      start: new Date(`${todayStr}T10:20:00+05:30`),
      end: new Date(`${todayStr}T10:40:00+05:30`),
      status: 'booked',
      tokenNumber: 6,
      queueDate: todayStr,
      source: 'website',
      fee: 1000,
      paymentStatus: 'pay_at_clinic',
    });

    // 7. Cancelled
    await Appointment.create({
      appointmentCode: 'APT-CANC0007',
      patientId: p7._id,
      doctorId: doctor._id,
      start: new Date(`${todayStr}T10:40:00+05:30`),
      end: new Date(`${todayStr}T11:00:00+05:30`),
      status: 'cancelled',
      tokenNumber: 7,
      queueDate: todayStr,
      source: 'website',
      fee: 1000,
      paymentStatus: 'pay_at_clinic',
    });

    const res = await request(app)
      .get('/api/v1/queue/today')
      .set('Authorization', `Bearer ${docToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;

    // Counts
    expect(data.counts.inConsultation).toBe(1);
    expect(data.counts.waiting).toBe(4); // 2 checked_in + 2 booked
    expect(data.counts.done).toBe(1);
    expect(data.counts.total).toBe(7);

    // Tokens
    expect(data.nowServing).toBe(2);
    expect(data.next).toBe(3);

    // Queue ordering
    const queue = data.queue;
    expect(queue).toHaveLength(7);

    // 1st item: in_consultation
    expect(queue[0].status).toBe('in_consultation');
    expect(queue[0].tokenNumber).toBe(2);
    expect(queue[0].estimatedWaitMinutes).toBe(0);

    // 2nd item: checked_in token 3 (1 patient ahead: the 1 in consultation -> 20 mins)
    expect(queue[1].status).toBe('checked_in');
    expect(queue[1].tokenNumber).toBe(3);
    expect(queue[1].estimatedWaitMinutes).toBe(20);

    // 3rd item: checked_in token 4 (2 patients ahead -> 40 mins)
    expect(queue[2].status).toBe('checked_in');
    expect(queue[2].tokenNumber).toBe(4);
    expect(queue[2].estimatedWaitMinutes).toBe(40);

    // 4th item: booked earlier 10:00 (3 patients ahead -> 60 mins)
    expect(queue[3].status).toBe('booked');
    expect(queue[3].tokenNumber).toBe(5);
    expect(queue[3].estimatedWaitMinutes).toBe(60);

    // 5th item: booked later 10:20 (4 patients ahead -> 80 mins)
    expect(queue[4].status).toBe('booked');
    expect(queue[4].tokenNumber).toBe(6);
    expect(queue[4].estimatedWaitMinutes).toBe(80);

    // 6th & 7th items: finished (completed & cancelled)
    expect(['completed', 'cancelled']).toContain(queue[5].status);
    expect(['completed', 'cancelled']).toContain(queue[6].status);
  });
});
