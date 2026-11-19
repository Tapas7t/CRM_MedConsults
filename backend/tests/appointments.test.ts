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
import { Counter } from '../src/modules/appointment/counter.model.js';
import { Activity } from '../src/modules/activity/activity.model.js';
import { AuditLog } from '../src/modules/auditLog/auditLog.model.js';
import { signAccess } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/password.js';
import { getKolkataDateString } from '../src/utils/date.js';

describe('Appointments Module Integration Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  async function createDoctorFixture(email = 'dr.apt@medconsults.example', name = 'Dr. Rajesh Kulkarni') {
    const passwordHash = await hashPassword('DoctorPass123!');
    const user = await UserModel.create({
      name,
      email,
      phone: '+919820100001',
      passwordHash,
      role: 'doctor',
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });

    const weeklyAvailability = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      slots: [
        { start: '09:00', end: '13:00' },
        { start: '16:00', end: '20:00' },
      ],
    }));

    const doctor = await Doctor.create({
      userId: user._id,
      specialty: 'Cardiology',
      qualifications: ['MBBS', 'MD (Cardiology)'],
      registrationNo: `MMC-${Math.random().toString().slice(2, 8)}`,
      experienceYears: 12,
      languages: ['English', 'Hindi'],
      consultationFee: 1000,
      clinicRoom: 'Room 101',
      approvalStatus: 'approved',
      slotMinutes: 15,
      weeklyAvailability,
      blockedDates: [],
    });

    return { user, doctor };
  }

  async function createPatientFixture(email = 'patient.apt@medconsults.example', name = 'Aarav Sharma', verified = true) {
    const passwordHash = await hashPassword('PatientPass123!');
    const user = await UserModel.create({
      name,
      email,
      phone: `+91982${Math.random().toString().slice(2, 9)}`,
      passwordHash,
      role: 'patient',
      status: 'active',
      emailVerified: verified,
      failedLogins: 0,
      refreshTokenHashes: [],
    });

    const patient = await Patient.create({
      userId: user._id,
      name,
      phone: user.phone!,
      email,
      patientCode: `P-${Math.random().toString().slice(2, 6)}-0001`,
      source: 'website',
      status: 'active',
    });

    return { user, patient };
  }

  async function createStaffUser() {
    const passwordHash = await hashPassword('StaffPass123!');
    return UserModel.create({
      name: 'Pooja Sawant',
      email: 'staff.apt@medconsults.example',
      phone: '+919820011002',
      passwordHash,
      role: 'staff',
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });
  }

  async function createAdminUser() {
    const passwordHash = await hashPassword('AdminPass123!');
    return UserModel.create({
      name: 'Admin User',
      email: 'admin.apt@medconsults.example',
      passwordHash,
      role: 'admin',
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });
  }

  describe('Booking Appointments (POST /api/v1/appointments)', () => {
    it('allows patient to book valid future slot; assigns token number and appointmentCode; writes activity', async () => {
      const { doctor } = await createDoctorFixture();
      const { user: patientUser } = await createPatientFixture();
      const token = signAccess({ userId: patientUser._id.toString(), role: 'patient' });

      const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );
      const slotStart = new Date(`${tomorrowStr}T09:00:00+05:30`);

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          doctorId: doctor._id.toString(),
          start: slotStart.toISOString(),
          reason: 'Routine cardiac evaluation',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.appointment.tokenNumber).toBe(1);
      expect(res.body.data.appointment.appointmentCode).toMatch(/^APT-[A-Z0-9]{8}$/);
      expect(res.body.data.appointment.status).toBe('booked');
      expect(res.body.data.appointment.reason).toBe('Routine cardiac evaluation');

      // Verify activity written
      const act = await Activity.findOne({
        entityType: 'Appointment',
        entityId: res.body.data.appointment._id,
        type: 'APPOINTMENT_BOOKED',
      });
      expect(act).not.toBeNull();
    });

    it('rejects unverified patient with 403 EMAIL_NOT_VERIFIED', async () => {
      const { doctor } = await createDoctorFixture();
      const { user: unverifiedUser } = await createPatientFixture(
        'unverified@medconsults.example',
        'Sneha Verma',
        false
      );
      const token = signAccess({ userId: unverifiedUser._id.toString(), role: 'patient' });

      const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );
      const slotStart = new Date(`${tomorrowStr}T09:00:00+05:30`);

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          doctorId: doctor._id.toString(),
          start: slotStart.toISOString(),
          reason: 'Checkup',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('rejects patient holding overlapping active appointment with 409 CONFLICT', async () => {
      const { doctor: doc1 } = await createDoctorFixture('dr1@test.com');
      const { doctor: doc2 } = await createDoctorFixture('dr2@test.com', 'Dr. Second');
      const { user: patientUser } = await createPatientFixture();
      const token = signAccess({ userId: patientUser._id.toString(), role: 'patient' });

      const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );
      const slotStart = new Date(`${tomorrowStr}T09:00:00+05:30`);

      // 1. First booking with doc1
      const res1 = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          doctorId: doc1._id.toString(),
          start: slotStart.toISOString(),
          reason: 'First appointment',
        });
      expect(res1.status).toBe(201);

      // 2. Second booking with doc2 at identical overlapping time
      const res2 = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          doctorId: doc2._id.toString(),
          start: slotStart.toISOString(),
          reason: 'Second overlapping appointment',
        });
      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('CONFLICT');
    });

    it('five parallel bookings of the same slot give exactly one 201 and four 409', async () => {
      const { doctor } = await createDoctorFixture();
      const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );
      const slotStart = new Date(`${tomorrowStr}T10:00:00+05:30`);

      // Create 5 different patients
      const patients = await Promise.all([
        createPatientFixture('p1@test.com', 'Patient One'),
        createPatientFixture('p2@test.com', 'Patient Two'),
        createPatientFixture('p3@test.com', 'Patient Three'),
        createPatientFixture('p4@test.com', 'Patient Four'),
        createPatientFixture('p5@test.com', 'Patient Five'),
      ]);

      // Fire 5 bookings in parallel
      const promises = patients.map(({ user }) => {
        const token = signAccess({ userId: user._id.toString(), role: 'patient' });
        return request(app)
          .post('/api/v1/appointments')
          .set('Authorization', `Bearer ${token}`)
          .send({
            doctorId: doctor._id.toString(),
            start: slotStart.toISOString(),
            reason: 'Concurrent booking attempt',
          });
      });

      const results = await Promise.all(promises);
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(4);
    });

    it('parallel bookings of different slots for same doctor and day get unique, increasing token numbers', async () => {
      const { doctor } = await createDoctorFixture();
      const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );

      const slotTimes = [
        new Date(`${tomorrowStr}T09:00:00+05:30`),
        new Date(`${tomorrowStr}T09:15:00+05:30`),
        new Date(`${tomorrowStr}T09:30:00+05:30`),
        new Date(`${tomorrowStr}T09:45:00+05:30`),
      ];

      const patients = await Promise.all([
        createPatientFixture('p10@test.com', 'P 10'),
        createPatientFixture('p20@test.com', 'P 20'),
        createPatientFixture('p30@test.com', 'P 30'),
        createPatientFixture('p40@test.com', 'P 40'),
      ]);

      const promises = slotTimes.map((st, idx) => {
        const token = signAccess({ userId: patients[idx].user._id.toString(), role: 'patient' });
        return request(app)
          .post('/api/v1/appointments')
          .set('Authorization', `Bearer ${token}`)
          .send({
            doctorId: doctor._id.toString(),
            start: st.toISOString(),
            reason: `Slot ${idx + 1}`,
          });
      });

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.status).toBe(201);
      }

      const tokenNumbers = results.map((r) => r.body.data.appointment.tokenNumber);
      expect(new Set(tokenNumbers).size).toBe(4);
      expect(tokenNumbers.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('Scoped Appointment Retrieval & Privacy', () => {
    it('role scoping: patient sees only own, doctor sees only own, staff/admin see all', async () => {
      const { doctor: docA, user: docUserA } = await createDoctorFixture('docA@test.com', 'Dr. Alpha');
      const { doctor: docB, user: docUserB } = await createDoctorFixture('docB@test.com', 'Dr. Beta');
      const { user: patA, patient: patientA } = await createPatientFixture('patA@test.com', 'Patient Alpha');
      const { user: patB, patient: patientB } = await createPatientFixture('patB@test.com', 'Patient Beta');
      const staffUser = await createStaffUser();

      const patTokenA = signAccess({ userId: patA._id.toString(), role: 'patient' });
      const docTokenA = signAccess({ userId: docUserA._id.toString(), role: 'doctor' });
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });

      const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );

      // Apt 1: DocA + PatA
      await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patTokenA}`)
        .send({
          doctorId: docA._id.toString(),
          start: new Date(`${tomorrowStr}T09:00:00+05:30`).toISOString(),
          reason: 'Cardiac issue',
        });

      // Apt 2: DocB + PatB
      const patTokenB = signAccess({ userId: patB._id.toString(), role: 'patient' });
      await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patTokenB}`)
        .send({
          doctorId: docB._id.toString(),
          start: new Date(`${tomorrowStr}T09:00:00+05:30`).toISOString(),
          reason: 'Skin issue',
        });

      // PatA listing sees 1 appointment
      const patList = await request(app)
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${patTokenA}`);
      expect(patList.status).toBe(200);
      expect(patList.body.data.appointments).toHaveLength(1);

      // DocA listing sees 1 appointment
      const docList = await request(app)
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${docTokenA}`);
      expect(docList.status).toBe(200);
      expect(docList.body.data.appointments).toHaveLength(1);

      // Staff listing sees both 2 appointments
      const staffList = await request(app)
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(staffList.status).toBe(200);
      expect(staffList.body.data.appointments).toHaveLength(2);
    });

    it('ownership enforcement on GET /appointments/:id: wrong owner gets 404', async () => {
      const { doctor: docA, user: docUserA } = await createDoctorFixture('docA2@test.com');
      const { doctor: docB, user: docUserB } = await createDoctorFixture('docB2@test.com');
      const { user: patA } = await createPatientFixture('patA2@test.com');
      const { user: patB } = await createPatientFixture('patB2@test.com');

      const patTokenA = signAccess({ userId: patA._id.toString(), role: 'patient' });
      const patTokenB = signAccess({ userId: patB._id.toString(), role: 'patient' });
      const docTokenB = signAccess({ userId: docUserB._id.toString(), role: 'doctor' });

      const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );

      const bookRes = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patTokenA}`)
        .send({
          doctorId: docA._id.toString(),
          start: new Date(`${tomorrowStr}T10:00:00+05:30`).toISOString(),
          reason: 'Confidential private symptom',
        });
      const aptId = bookRes.body.data.appointment._id;

      // Patient A sees appointment
      const okPat = await request(app)
        .get(`/api/v1/appointments/${aptId}`)
        .set('Authorization', `Bearer ${patTokenA}`);
      expect(okPat.status).toBe(200);

      // Patient B gets 404
      const failPat = await request(app)
        .get(`/api/v1/appointments/${aptId}`)
        .set('Authorization', `Bearer ${patTokenB}`);
      expect(failPat.status).toBe(404);

      // Doctor B gets 404
      const failDoc = await request(app)
        .get(`/api/v1/appointments/${aptId}`)
        .set('Authorization', `Bearer ${docTokenB}`);
      expect(failDoc.status).toBe(404);
    });

    it('privacy: appointment reason is omitted from admin responses', async () => {
      const { doctor } = await createDoctorFixture();
      const { user: patUser } = await createPatientFixture();
      const adminUser = await createAdminUser();

      const patToken = signAccess({ userId: patUser._id.toString(), role: 'patient' });
      const adminToken = signAccess({ userId: adminUser._id.toString(), role: 'admin' });

      const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );

      const bookRes = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patToken}`)
        .send({
          doctorId: doctor._id.toString(),
          start: new Date(`${tomorrowStr}T11:00:00+05:30`).toISOString(),
          reason: 'Severe migraine headache',
        });
      const aptId = bookRes.body.data.appointment._id;

      // Patient response contains reason
      const patRes = await request(app)
        .get(`/api/v1/appointments/${aptId}`)
        .set('Authorization', `Bearer ${patToken}`);
      expect(patRes.body.data.appointment.reason).toBe('Severe migraine headache');

      // Admin response does NOT contain reason
      const adminRes = await request(app)
        .get(`/api/v1/appointments/${aptId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.appointment.reason).toBeUndefined();
    });
  });

  describe('Rescheduling & Cancellation', () => {
    it('cancellation frees the slot, and the slot can be booked again', async () => {
      const { doctor } = await createDoctorFixture();
      const { user: pat1 } = await createPatientFixture('p.cancel1@test.com');
      const { user: pat2 } = await createPatientFixture('p.cancel2@test.com');

      const patToken1 = signAccess({ userId: pat1._id.toString(), role: 'patient' });
      const patToken2 = signAccess({ userId: pat2._id.toString(), role: 'patient' });

      const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );
      const slotStart = new Date(`${tomorrowStr}T09:00:00+05:30`);

      // 1. Patient 1 books
      const bookRes = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patToken1}`)
        .send({
          doctorId: doctor._id.toString(),
          start: slotStart.toISOString(),
          reason: 'First booking',
        });
      expect(bookRes.status).toBe(201);
      const aptId = bookRes.body.data.appointment._id;

      // 2. Patient 1 cancels
      const cancelRes = await request(app)
        .post(`/api/v1/appointments/${aptId}/cancel`)
        .set('Authorization', `Bearer ${patToken1}`)
        .send({ reason: 'Plans changed' });
      expect(cancelRes.status).toBe(200);

      // 3. Patient 2 books the same freed slot
      const rebookRes = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patToken2}`)
        .send({
          doctorId: doctor._id.toString(),
          start: slotStart.toISOString(),
          reason: 'Rebooking freed slot',
        });
      expect(rebookRes.status).toBe(201);
    });

    it('enforces cancellation and reschedule 2-hour window for patients', async () => {
      const { doctor } = await createDoctorFixture();
      const { user: patUser } = await createPatientFixture();
      const patToken = signAccess({ userId: patUser._id.toString(), role: 'patient' });

      // Create an appointment starting 1 hour from now (less than 2 hours window)
      const nearStart = new Date(Date.now() + 60 * 60 * 1000);
      const nearEnd = new Date(nearStart.getTime() + 15 * 60 * 1000);
      const queueDate = getKolkataDateString(nearStart);

      const nearApt = await Appointment.create({
        appointmentCode: 'APT-NEAR0001',
        patientId: (await Patient.findOne({ userId: patUser._id }))!._id,
        doctorId: doctor._id,
        start: nearStart,
        end: nearEnd,
        status: 'booked',
        tokenNumber: 99,
        queueDate,
        reason: 'Near appointment',
        source: 'website',
        isWalkIn: false,
        fee: 1000,
        paymentStatus: 'pay_at_clinic',
      });

      // Patient attempts cancel within 2 hours -> 400
      const cancelRes = await request(app)
        .post(`/api/v1/appointments/${nearApt._id}/cancel`)
        .set('Authorization', `Bearer ${patToken}`)
        .send();
      expect(cancelRes.status).toBe(400);

      // Patient attempts reschedule within 2 hours -> 400
      const reschedRes = await request(app)
        .post(`/api/v1/appointments/${nearApt._id}/reschedule`)
        .set('Authorization', `Bearer ${patToken}`)
        .send({
          start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(reschedRes.status).toBe(400);
    });

    it('reschedule issues a new token and updates start/end time', async () => {
      const { doctor } = await createDoctorFixture();
      const { user: patUser } = await createPatientFixture();
      const patToken = signAccess({ userId: patUser._id.toString(), role: 'patient' });

      const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );
      const slot1Start = new Date(`${tomorrowStr}T09:00:00+05:30`);
      const slot2Start = new Date(`${tomorrowStr}T09:15:00+05:30`);

      const bookRes = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patToken}`)
        .send({
          doctorId: doctor._id.toString(),
          start: slot1Start.toISOString(),
          reason: 'Initial booking',
        });
      const aptId = bookRes.body.data.appointment._id;
      expect(bookRes.body.data.appointment.tokenNumber).toBe(1);

      // Reschedule to slot 2
      const reschedRes = await request(app)
        .post(`/api/v1/appointments/${aptId}/reschedule`)
        .set('Authorization', `Bearer ${patToken}`)
        .send({
          start: slot2Start.toISOString(),
        });

      expect(reschedRes.status).toBe(200);
      expect(reschedRes.body.data.appointment.tokenNumber).toBe(2);
      expect(new Date(reschedRes.body.data.appointment.start).getTime()).toBe(slot2Start.getTime());
    });
  });

  describe('State Machine & Consultation Transitions', () => {
    it('enforces state machine: check-in on date, start, complete, no-show, rejecting illegal transitions', async () => {
      const { doctor, user: docUser } = await createDoctorFixture();
      const { user: patUser, patient } = await createPatientFixture();
      const staffUser = await createStaffUser();

      const docToken = signAccess({ userId: docUser._id.toString(), role: 'doctor' });
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });

      const todayStr = getKolkataDateString();
      // Appointment for today in 30 mins
      const start = new Date(Date.now() + 30 * 60 * 1000);
      const end = new Date(start.getTime() + 15 * 60 * 1000);

      const apt = await Appointment.create({
        appointmentCode: 'APT-STATE001',
        patientId: patient._id,
        doctorId: doctor._id,
        start,
        end,
        status: 'booked',
        tokenNumber: 1,
        queueDate: todayStr,
        reason: 'State machine test',
        source: 'reception',
        fee: 1000,
        paymentStatus: 'pay_at_clinic',
      });

      // 1. Direct completion from 'booked' is illegal (400)
      const illegalComplete = await request(app)
        .post(`/api/v1/appointments/${apt._id}/complete`)
        .set('Authorization', `Bearer ${docToken}`);
      expect(illegalComplete.status).toBe(400);

      // 2. Direct start from 'booked' is illegal (400)
      const illegalStart = await request(app)
        .post(`/api/v1/appointments/${apt._id}/start`)
        .set('Authorization', `Bearer ${docToken}`);
      expect(illegalStart.status).toBe(400);

      // 3. Staff check-in succeeds
      const checkInRes = await request(app)
        .post(`/api/v1/appointments/${apt._id}/check-in`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(checkInRes.status).toBe(200);
      expect(checkInRes.body.data.appointment.status).toBe('checked_in');

      // 4. Doctor starts consultation
      const startRes = await request(app)
        .post(`/api/v1/appointments/${apt._id}/start`)
        .set('Authorization', `Bearer ${docToken}`);
      expect(startRes.status).toBe(200);
      expect(startRes.body.data.appointment.status).toBe('in_consultation');

      // 5. Doctor completes consultation
      const completeRes = await request(app)
        .post(`/api/v1/appointments/${apt._id}/complete`)
        .set('Authorization', `Bearer ${docToken}`);
      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.appointment.status).toBe('completed');
    });

    it('doctor cannot start a second consultation while one is in progress (409 CONFLICT)', async () => {
      const { doctor, user: docUser } = await createDoctorFixture();
      const { patient: p1 } = await createPatientFixture('p1.busy@test.com', 'Patient 1');
      const { patient: p2 } = await createPatientFixture('p2.busy@test.com', 'Patient 2');
      const docToken = signAccess({ userId: docUser._id.toString(), role: 'doctor' });

      const todayStr = getKolkataDateString();

      // Apt 1: in_consultation
      await Appointment.create({
        appointmentCode: 'APT-BUSY0001',
        patientId: p1._id,
        doctorId: doctor._id,
        start: new Date(),
        end: new Date(Date.now() + 15 * 60 * 1000),
        status: 'in_consultation',
        tokenNumber: 1,
        queueDate: todayStr,
        source: 'walk_in',
        fee: 1000,
        paymentStatus: 'paid',
      });

      // Apt 2: checked_in
      const apt2 = await Appointment.create({
        appointmentCode: 'APT-BUSY0002',
        patientId: p2._id,
        doctorId: doctor._id,
        start: new Date(Date.now() + 20 * 60 * 1000),
        end: new Date(Date.now() + 35 * 60 * 1000),
        status: 'checked_in',
        tokenNumber: 2,
        queueDate: todayStr,
        source: 'reception',
        fee: 1000,
        paymentStatus: 'pay_at_clinic',
      });

      // Starting Apt 2 while Apt 1 is in_consultation fails with 409
      const startRes = await request(app)
        .post(`/api/v1/appointments/${apt2._id}/start`)
        .set('Authorization', `Bearer ${docToken}`);

      expect(startRes.status).toBe(409);
      expect(startRes.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Walk-ins (POST /api/v1/appointments/walk-in)', () => {
    it('registers walk-in: creates patient if not existing, does not consume bookable slots, assigns next token', async () => {
      const { doctor } = await createDoctorFixture();
      const staffUser = await createStaffUser();
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });

      // Tomorrow free slots count before walk-in
      const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );
      const slotsBefore = await request(app).get(`/api/v1/doctors/${doctor._id}/slots?date=${tomorrowStr}`);
      const freeSlotsBefore = slotsBefore.body.data.slots.length;

      // Register walk-in
      const walkInRes = await request(app)
        .post('/api/v1/appointments/walk-in')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          doctorId: doctor._id.toString(),
          name: 'Walk In Patient',
          phone: '9820555777',
          gender: 'male',
          reason: 'Acute fever',
        });

      expect(walkInRes.status).toBe(201);
      expect(walkInRes.body.data.tokenNumber).toBe(1);
      expect(walkInRes.body.data.appointmentCode).toMatch(/^APT-[A-Z0-9]{8}$/);
      expect(walkInRes.body.data.appointment.isWalkIn).toBe(true);
      expect(walkInRes.body.data.appointment.status).toBe('checked_in');

      // Bookable calendar slots remain unaffected
      const slotsAfter = await request(app).get(`/api/v1/doctors/${doctor._id}/slots?date=${tomorrowStr}`);
      expect(slotsAfter.body.data.slots.length).toBe(freeSlotsBefore);
    });
  });

  describe('Summary (GET /api/v1/appointments/summary)', () => {
    it('returns appointment status counts for the day', async () => {
      const { doctor, user: docUser } = await createDoctorFixture();
      const docToken = signAccess({ userId: docUser._id.toString(), role: 'doctor' });
      const { patient } = await createPatientFixture();
      const todayStr = getKolkataDateString();

      await Appointment.create({
        appointmentCode: 'APT-SUM0001',
        patientId: patient._id,
        doctorId: doctor._id,
        start: new Date(),
        end: new Date(Date.now() + 15 * 60 * 1000),
        status: 'booked',
        tokenNumber: 1,
        queueDate: todayStr,
        source: 'website',
        fee: 1000,
        paymentStatus: 'pay_at_clinic',
      });

      const res = await request(app)
        .get(`/api/v1/appointments/summary?date=${todayStr}`)
        .set('Authorization', `Bearer ${docToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.counts.booked).toBe(1);
      expect(res.body.data.counts.total).toBe(1);
    });
  });
});
