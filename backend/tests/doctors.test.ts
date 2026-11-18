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
import { Appointment } from '../src/modules/appointment/appointment.model.js';
import { Patient } from '../src/modules/patient/patient.model.js';
import { AuditLog } from '../src/modules/auditLog/auditLog.model.js';
import { signAccess } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/password.js';

describe('Doctors Module Integration Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  async function createDoctorFixture(options: {
    name?: string;
    email?: string;
    specialty?: string;
    approvalStatus?: 'approved' | 'pending' | 'blocked';
    isOnline?: boolean;
    slotMinutes?: number;
    blockedDates?: { date: Date; reason?: string }[];
  } = {}) {
    const passwordHash = await hashPassword('DoctorPass123!');
    const user = await UserModel.create({
      name: options.name || 'Dr. Rajesh Kulkarni',
      email: options.email || 'dr1@medconsults.example',
      phone: '+919820100001',
      passwordHash,
      role: 'doctor',
      status: options.approvalStatus === 'approved' ? 'active' : 'pending',
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
      specialty: options.specialty || 'Cardiology',
      qualifications: ['MBBS', 'MD (Cardiology)'],
      registrationNo: 'MMC-DEMO-2010-001',
      experienceYears: 15,
      languages: ['English', 'Hindi', 'Marathi'],
      consultationFee: 1200,
      clinicRoom: 'Room 101',
      bio: 'Senior Cardiologist specializing in preventive heart care.',
      approvalStatus: options.approvalStatus || 'approved',
      isOnline: options.isOnline ?? false,
      slotMinutes: options.slotMinutes || 15,
      weeklyAvailability,
      blockedDates: options.blockedDates || [],
    });

    return { user, doctor };
  }

  describe('Public Doctor Directory (GET /api/v1/doctors)', () => {
    it('returns only approved doctors, never pending or blocked doctors, and strips private data', async () => {
      // 1 approved doctor
      await createDoctorFixture({
        name: 'Dr. Approved',
        email: 'approved@medconsults.example',
        approvalStatus: 'approved',
      });

      // 1 pending doctor
      await createDoctorFixture({
        name: 'Dr. Pending',
        email: 'pending@medconsults.example',
        approvalStatus: 'pending',
      });

      // 1 blocked doctor
      await createDoctorFixture({
        name: 'Dr. Blocked',
        email: 'blocked@medconsults.example',
        approvalStatus: 'blocked',
      });

      const res = await request(app).get('/api/v1/doctors');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.doctors).toHaveLength(1);
      expect(res.body.data.doctors[0].name).toBe('Dr. Approved');

      // Security check: ensure email and phone are NEVER returned in public doctor data
      const jsonStr = JSON.stringify(res.body);
      expect(jsonStr).not.toContain('approved@medconsults.example');
      expect(jsonStr).not.toContain('+919820100001');
      expect(jsonStr).not.toContain('passwordHash');
    });

    it('filters by specialty, q, and availableToday', async () => {
      await createDoctorFixture({
        name: 'Dr. Rajesh Kulkarni',
        email: 'cardio@medconsults.example',
        specialty: 'Cardiology',
      });
      await createDoctorFixture({
        name: 'Dr. Priya Nair',
        email: 'derma@medconsults.example',
        specialty: 'Dermatology',
      });

      // Filter by specialty
      const cardioRes = await request(app).get('/api/v1/doctors?specialty=Cardiology');
      expect(cardioRes.status).toBe(200);
      expect(cardioRes.body.data.doctors).toHaveLength(1);
      expect(cardioRes.body.data.doctors[0].specialty).toBe('Cardiology');

      // Filter by search q
      const searchRes = await request(app).get('/api/v1/doctors?q=Priya');
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.doctors).toHaveLength(1);
      expect(searchRes.body.data.doctors[0].name).toBe('Dr. Priya Nair');

      // Filter by availableToday
      const availRes = await request(app).get('/api/v1/doctors?availableToday=true');
      expect(availRes.status).toBe(200);
      expect(availRes.body.data.doctors.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v1/doctors/:id returns single approved doctor or 404 for unapproved/nonexistent', async () => {
      const { doctor: approvedDoctor } = await createDoctorFixture({ approvalStatus: 'approved' });
      const { doctor: pendingDoctor } = await createDoctorFixture({
        email: 'pending2@medconsults.example',
        approvalStatus: 'pending',
      });

      // Approved doctor returns 200
      const okRes = await request(app).get(`/api/v1/doctors/${approvedDoctor._id}`);
      expect(okRes.status).toBe(200);
      expect(okRes.body.data.doctor._id).toBe(approvedDoctor._id.toString());

      // Pending doctor returns 404
      const pendingRes = await request(app).get(`/api/v1/doctors/${pendingDoctor._id}`);
      expect(pendingRes.status).toBe(404);

      // Nonexistent ID returns 404
      const notFoundRes = await request(app).get('/api/v1/doctors/507f1f77bcf86cd799439011');
      expect(notFoundRes.status).toBe(404);
    });
  });

  describe('Slot Computation (GET /api/v1/doctors/:id/slots)', () => {
    it('computes free slots, excludes booked and blocked times, frees slot on cancelled appointment, and rejects invalid/past dates', async () => {
      const { doctor } = await createDoctorFixture({ slotMinutes: 15 });

      // Tomorrow date in Kolkata
      const now = new Date();
      const tomorrowKolkata = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
      }).format(tomorrowKolkata);

      // 1. Check free slots for tomorrow
      const initialSlotsRes = await request(app).get(
        `/api/v1/doctors/${doctor._id}/slots?date=${tomorrowStr}`
      );
      expect(initialSlotsRes.status).toBe(200);
      expect(initialSlotsRes.body.data.slots.length).toBeGreaterThan(0);
      const initialCount = initialSlotsRes.body.data.slots.length;

      // 2. Insert an active appointment for the 09:00 slot directly
      const dummyPatient = await Patient.create({
        name: 'Patient Test',
        phone: '+919820998877',
        patientCode: 'P-TEST-9988',
        source: 'walk_in',
        status: 'active',
        whatsappOptIn: false,
      });

      const slotStart = new Date(`${tomorrowStr}T09:00:00+05:30`);
      const slotEnd = new Date(`${tomorrowStr}T09:15:00+05:30`);

      const appointment = await Appointment.create({
        patientId: dummyPatient._id,
        doctorId: doctor._id,
        start: slotStart,
        end: slotEnd,
        status: 'booked',
        tokenNumber: 1,
        queueDate: tomorrowStr,
        fee: 1200,
        paymentStatus: 'pay_at_clinic',
        source: 'website',
      });

      // 3. Query slots again: 09:00 slot must be excluded
      const bookedSlotsRes = await request(app).get(
        `/api/v1/doctors/${doctor._id}/slots?date=${tomorrowStr}`
      );
      expect(bookedSlotsRes.status).toBe(200);
      expect(bookedSlotsRes.body.data.slots.length).toBe(initialCount - 1);
      const hasSlot0900 = bookedSlotsRes.body.data.slots.some((s: any) => s.time === '09:00');
      expect(hasSlot0900).toBe(false);

      // 4. Cancel the appointment: slot must be freed!
      appointment.status = 'cancelled';
      await appointment.save();

      const freedSlotsRes = await request(app).get(
        `/api/v1/doctors/${doctor._id}/slots?date=${tomorrowStr}`
      );
      expect(freedSlotsRes.status).toBe(200);
      expect(freedSlotsRes.body.data.slots.length).toBe(initialCount);
      const freedSlot0900 = freedSlotsRes.body.data.slots.some((s: any) => s.time === '09:00');
      expect(freedSlot0900).toBe(true);

      // 5. Block the entire date: slots must return empty
      doctor.blockedDates = [{ date: new Date(`${tomorrowStr}T00:00:00+05:30`), reason: 'Conference' }];
      await doctor.save();

      const blockedSlotsRes = await request(app).get(
        `/api/v1/doctors/${doctor._id}/slots?date=${tomorrowStr}`
      );
      expect(blockedSlotsRes.status).toBe(200);
      expect(blockedSlotsRes.body.data.slots).toHaveLength(0);

      // 6. Past date returns 400 INVALID_REQUEST
      const pastRes = await request(app).get(
        `/api/v1/doctors/${doctor._id}/slots?date=2020-01-01`
      );
      expect(pastRes.status).toBe(400);
      expect(pastRes.body.error.code).toBe('INVALID_REQUEST');

      // 7. Date > 30 days ahead returns 400 INVALID_REQUEST
      const farFutureRes = await request(app).get(
        `/api/v1/doctors/${doctor._id}/slots?date=2099-01-01`
      );
      expect(farFutureRes.status).toBe(400);
      expect(farFutureRes.body.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('Doctor Self Management (/api/v1/doctors/me)', () => {
    it('allows doctor to update profile and availability, preventing overlapping sessions', async () => {
      const { user, doctor } = await createDoctorFixture({ approvalStatus: 'approved' });
      const doctorToken = signAccess({ userId: user._id.toString(), role: 'doctor' });

      // 1. GET /doctors/me
      const meRes = await request(app)
        .get('/api/v1/doctors/me')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.data.doctor._id).toBe(doctor._id.toString());

      // 2. PATCH /doctors/me
      const patchRes = await request(app)
        .patch('/api/v1/doctors/me')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          bio: 'Updated bio for senior cardiologist.',
          consultationFee: 1500,
          clinicRoom: 'Room 101-B',
        });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.doctor.consultationFee).toBe(1500);

      // 3. PUT /doctors/me/availability (valid)
      const validAvailability = {
        slotMinutes: 20,
        weeklyAvailability: [
          {
            dayOfWeek: 1,
            slots: [
              { start: '10:00', end: '13:00' },
              { start: '17:00', end: '20:00' },
            ],
          },
        ],
        blockedDates: [],
      };

      const putRes = await request(app)
        .put('/api/v1/doctors/me/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(validAvailability);
      expect(putRes.status).toBe(200);
      expect(putRes.body.data.doctor.slotMinutes).toBe(20);

      // 4. PUT /doctors/me/availability with overlapping sessions returns 400 VALIDATION_ERROR
      const overlappingAvailability = {
        slotMinutes: 20,
        weeklyAvailability: [
          {
            dayOfWeek: 1,
            slots: [
              { start: '10:00', end: '13:00' },
              { start: '12:30', end: '15:00' }, // Overlaps with 10:00-13:00!
            ],
          },
        ],
      };

      const overlapRes = await request(app)
        .put('/api/v1/doctors/me/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(overlappingAvailability);
      expect(overlapRes.status).toBe(400);
      expect(overlapRes.body.error.code).toBe('VALIDATION_ERROR');

      // 5. PATCH /doctors/me/online and POST /doctors/me/heartbeat
      const onlineRes = await request(app)
        .patch('/api/v1/doctors/me/online')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ isOnline: true });
      expect(onlineRes.status).toBe(200);
      expect(onlineRes.body.data.isOnline).toBe(true);

      const heartbeatRes = await request(app)
        .post('/api/v1/doctors/me/heartbeat')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(heartbeatRes.status).toBe(200);
      expect(heartbeatRes.body.data.lastSeenAt).toBeDefined();
    });
  });

  describe('Admin Doctor Management', () => {
    it('allows admin to list, approve, and block doctors with audit logging', async () => {
      const passwordHash = await hashPassword('AdminPass123!');
      const admin = await UserModel.create({
        name: 'Admin Boss',
        email: 'admin.boss@medconsults.example',
        passwordHash,
        role: 'admin',
        status: 'active',
        emailVerified: true,
        failedLogins: 0,
        refreshTokenHashes: [],
      });
      const adminToken = signAccess({ userId: admin._id.toString(), role: 'admin' });

      const { user: pendingUser, doctor: pendingDoc } = await createDoctorFixture({
        name: 'Dr. Pending Verification',
        email: 'pending.doc@medconsults.example',
        approvalStatus: 'pending',
      });

      // 1. GET /doctors/admin/list and /pending
      const listRes = await request(app)
        .get('/api/v1/doctors/admin/list')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.doctors.length).toBeGreaterThanOrEqual(1);

      const pendingRes = await request(app)
        .get('/api/v1/doctors/admin/pending')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(pendingRes.status).toBe(200);
      expect(pendingRes.body.data.doctors.some((d: any) => d._id === pendingDoc._id.toString())).toBe(true);

      // 2. Approve doctor
      const approveRes = await request(app)
        .post(`/api/v1/doctors/${pendingDoc._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(approveRes.status).toBe(200);

      // Check DB
      const approvedDocInDb = await Doctor.findById(pendingDoc._id);
      expect(approvedDocInDb!.approvalStatus).toBe('approved');
      const approvedUserInDb = await UserModel.findById(pendingUser._id);
      expect(approvedUserInDb!.status).toBe('active');

      // Check AuditLog
      const approveAudit = await AuditLog.findOne({
        action: 'DOCTOR_APPROVED',
        entityId: pendingDoc._id.toString(),
      });
      expect(approveAudit).not.toBeNull();

      // 3. Block doctor
      const blockRes = await request(app)
        .post(`/api/v1/doctors/${pendingDoc._id}/block`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(blockRes.status).toBe(200);

      const blockedDocInDb = await Doctor.findById(pendingDoc._id);
      expect(blockedDocInDb!.approvalStatus).toBe('blocked');
      const blockedUserInDb = await UserModel.findById(pendingUser._id);
      expect(blockedUserInDb!.status).toBe('blocked');

      // Check AuditLog
      const blockAudit = await AuditLog.findOne({
        action: 'DOCTOR_BLOCKED',
        entityId: pendingDoc._id.toString(),
      });
      expect(blockAudit).not.toBeNull();
    });
  });

  describe('Public Doctor Rate Limiting', () => {
    it('triggers 429 RATE_LIMIT_EXCEEDED when public route limit is exceeded', async () => {
      // Send 30 requests rapidly to hit test limit (25)
      let rateLimited = false;
      for (let i = 0; i < 30; i++) {
        const res = await request(app).get('/api/v1/doctors');
        if (res.status === 429) {
          rateLimited = true;
          expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
          break;
        }
      }
      expect(rateLimited).toBe(true);
    });
  });
});
