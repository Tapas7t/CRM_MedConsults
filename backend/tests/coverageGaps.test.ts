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
import { Types } from 'mongoose';
import { app } from '../src/app.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';
import { UserModel } from '../src/modules/user/user.model.js';
import { Doctor } from '../src/modules/doctor/doctor.model.js';
import { Patient } from '../src/modules/patient/patient.model.js';
import { Token } from '../src/modules/token/token.model.js';
import { signAccess } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/password.js';

describe('Coverage Gaps Integration Tests', () => {
  let adminId: string;
  let staffId: string;
  let doctorId: string;
  let patientId: string;

  let adminToken: string;
  let staffToken: string;
  let doctorToken: string;
  let patientToken: string;

  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    const pwdHash = await hashPassword('SecurePass123!');

    // Create 4 users with distinct roles
    const adminUser = await UserModel.create({
      name: 'Admin Test',
      email: 'admin@gaptest.example',
      passwordHash: pwdHash,
      role: 'admin',
      status: 'active',
      emailVerified: true,
    });
    adminId = adminUser._id.toString();
    adminToken = signAccess({ userId: adminId, role: 'admin' });

    const staffUser = await UserModel.create({
      name: 'Staff Test',
      email: 'staff@gaptest.example',
      passwordHash: pwdHash,
      role: 'staff',
      status: 'active',
      emailVerified: true,
    });
    staffId = staffUser._id.toString();
    staffToken = signAccess({ userId: staffId, role: 'staff' });

    const doctorUser = await UserModel.create({
      name: 'Doctor Test',
      email: 'doctor@gaptest.example',
      passwordHash: pwdHash,
      role: 'doctor',
      status: 'active',
      emailVerified: true,
    });
    doctorId = doctorUser._id.toString();
    doctorToken = signAccess({ userId: doctorId, role: 'doctor' });

    await Doctor.create({
      userId: doctorUser._id,
      specialty: 'Cardiology',
      qualifications: ['MBBS', 'MD'],
      registrationNo: 'MMC-GAP-2024-001',
      experienceYears: 10,
      consultationFee: 1000,
      clinicRoom: 'Room 101',
      approvalStatus: 'approved',
      slotMinutes: 15,
      weeklyAvailability: [
        {
          dayOfWeek: 1,
          slots: [{ start: '09:00', end: '13:00' }],
        },
      ],
    });

    const patientUser = await UserModel.create({
      name: 'Patient Test',
      email: 'patient@gaptest.example',
      passwordHash: pwdHash,
      role: 'patient',
      status: 'active',
      emailVerified: true,
    });
    patientId = patientUser._id.toString();
    patientToken = signAccess({ userId: patientId, role: 'patient' });

    await Patient.create({
      userId: patientUser._id,
      patientCode: 'P-GAP-0001',
      name: 'Patient Test',
      phone: '+919820001122',
      source: 'walk_in',
      status: 'active',
    });
  });

  const dummyId = new Types.ObjectId().toString();
  const tomorrowStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));

  describe('1. POST /api/v1/auth/register-doctor (Success, Validation, Conflict)', () => {
    const validDoctorPayload = {
      name: 'Dr. Anand Dighe',
      email: 'anand.dighe@example.com',
      phone: '+919820556677',
      password: 'StrongDoctorPass123!',
      specialty: 'Neurology',
      qualifications: ['MBBS', 'DM (Neurology)'],
      registrationNo: 'MMC-GAP-REG-999',
      experienceYears: 12,
      consultationFee: 1500,
      clinicRoom: 'Room 202',
      languages: ['English', 'Marathi'],
    };

    it('successfully registers a doctor, creating user and doctor record in pending state', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register-doctor')
        .send(validDoctorPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(validDoctorPayload.email);
      expect(res.body.data.user.role).toBe('doctor');
      expect(res.body.data.user.status).toBe('pending');

      // Security check: passwords and hashes never returned
      const str = JSON.stringify(res.body);
      expect(str).not.toContain('passwordHash');
      expect(str).not.toContain('refreshTokenHashes');

      // Check DB records
      const user = await UserModel.findOne({ email: validDoctorPayload.email });
      expect(user).not.toBeNull();
      expect(user!.status).toBe('pending');

      const doctor = await Doctor.findOne({ userId: user!._id });
      expect(doctor).not.toBeNull();
      expect(doctor!.approvalStatus).toBe('pending');
      expect(doctor!.specialty).toBe('Neurology');

      const token = await Token.findOne({ userId: user!._id, type: 'verify' });
      expect(token).not.toBeNull();
    });

    it('returns 400 VALIDATION_ERROR on missing or invalid fields', async () => {
      const res = await request(app).post('/api/v1/auth/register-doctor').send({
        name: 'A',
        email: 'invalid-email',
        phone: '123',
        password: 'weak',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields).toBeDefined();
    });

    it('returns 409 CONFLICT on duplicate email', async () => {
      await request(app).post('/api/v1/auth/register-doctor').send(validDoctorPayload);
      const dupRes = await request(app)
        .post('/api/v1/auth/register-doctor')
        .send(validDoctorPayload);

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error.code).toBe('CONFLICT');
    });
  });

  describe('2. Blocked User Token Invalidation (403 FORBIDDEN)', () => {
    it('stops working immediately when user is blocked, even if token is unexpired', async () => {
      // 1. Token works while active
      const beforeRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(beforeRes.status).toBe(200);

      // 2. Admin blocks user
      const blockRes = await request(app)
        .post(`/api/v1/users/${patientId}/block`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(blockRes.status).toBe(200);

      // 3. Existing access token now returns 403 FORBIDDEN
      const afterRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(afterRes.status).toBe(403);
      expect(afterRes.body.error.code).toBe('FORBIDDEN');

      // 4. Same token on PATCH /users/me also returns 403
      const patchRes = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ name: 'Blocked Hack' });
      expect(patchRes.status).toBe(403);
      expect(patchRes.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('3. Validation Errors (400 VALIDATION_ERROR / INVALID_REQUEST)', () => {
    it('returns 400 for invalid bodies on auth endpoints', async () => {
      // resend verification invalid email
      const resendRes = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'not-an-email' });
      expect(resendRes.status).toBe(400);

      // login missing password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@gaptest.example' });
      expect(loginRes.status).toBe(400);

      // forgot password invalid email
      const forgotRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'bad-email' });
      expect(forgotRes.status).toBe(400);

      // reset password weak password
      const resetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'abc', password: 'weak' });
      expect(resetRes.status).toBe(400);
    });

    it('returns 400 for invalid query or param formats across users, doctors, patients, audit-logs', async () => {
      // PATCH /users/me invalid phone
      const badPhone = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phone: '123' });
      expect(badPhone.status).toBe(400);

      // GET /users invalid limit
      const badLimitUsers = await request(app)
        .get('/api/v1/users?limit=9999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badLimitUsers.status).toBe(400);

      // Invalid ObjectIds on users endpoints
      const badIdUserPatch = await request(app)
        .patch('/api/v1/users/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Valid Name' });
      expect(badIdUserPatch.status).toBe(400);

      const badIdUserBlock = await request(app)
        .post('/api/v1/users/invalid-id/block')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badIdUserBlock.status).toBe(400);

      const badIdUserUnblock = await request(app)
        .post('/api/v1/users/invalid-id/unblock')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badIdUserUnblock.status).toBe(400);

      // GET /doctors invalid query limit
      const badDocLimit = await request(app).get('/api/v1/doctors?limit=999');
      expect(badDocLimit.status).toBe(400);

      // GET /doctors/:id invalid ObjectId
      const badDocId = await request(app).get('/api/v1/doctors/invalid-id');
      expect(badDocId.status).toBe(400);

      // GET /doctors/:id/slots invalid ObjectId
      const badDocSlotId = await request(app).get(`/api/v1/doctors/invalid-id/slots?date=${tomorrowStr}`);
      expect(badDocSlotId.status).toBe(400);

      // PATCH /doctors/me invalid fee
      const badDocFee = await request(app)
        .patch('/api/v1/doctors/me')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultationFee: -50 });
      expect(badDocFee.status).toBe(400);

      // PATCH /doctors/me/online invalid isOnline
      const badDocOnline = await request(app)
        .patch('/api/v1/doctors/me/online')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ isOnline: 'not-a-bool' });
      expect(badDocOnline.status).toBe(400);

      // GET /doctors/admin/list invalid limit
      const badDocAdminLimit = await request(app)
        .get('/api/v1/doctors/admin/list?limit=999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badDocAdminLimit.status).toBe(400);

      // POST /doctors/:id/approve and block invalid ObjectId
      const badDocApprove = await request(app)
        .post('/api/v1/doctors/invalid-id/approve')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badDocApprove.status).toBe(400);

      const badDocBlock = await request(app)
        .post('/api/v1/doctors/invalid-id/block')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badDocBlock.status).toBe(400);

      // Patients invalid queries and params
      const badPatientLimit = await request(app)
        .get('/api/v1/patients?limit=999')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(badPatientLimit.status).toBe(400);

      const badPatientPost = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'A', phone: '123' });
      expect(badPatientPost.status).toBe(400);

      const badPatientGet = await request(app)
        .get('/api/v1/patients/invalid-id')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(badPatientGet.status).toBe(400);

      const badPatientTimeline = await request(app)
        .get('/api/v1/patients/invalid-id/timeline')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(badPatientTimeline.status).toBe(400);

      const badPatientPatch = await request(app)
        .patch('/api/v1/patients/invalid-id')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Valid Name' });
      expect(badPatientPatch.status).toBe(400);

      const badPatientDel = await request(app)
        .delete('/api/v1/patients/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badPatientDel.status).toBe(400);

      // Audit logs invalid limit
      const badAuditLimit = await request(app)
        .get('/api/v1/audit-logs?limit=999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badAuditLimit.status).toBe(400);
    });
  });

  describe('4. Missing Authentication (401 UNAUTHORIZED)', () => {
    it('returns 401 across all protected endpoints when Authorization header is absent', async () => {
      const endpoints: Array<{ method: 'get' | 'post' | 'patch' | 'put' | 'delete'; url: string; body?: any }> = [
        { method: 'patch', url: '/api/v1/users/me', body: { name: 'No Token' } },
        { method: 'post', url: '/api/v1/users', body: { name: 'No Token', email: 'no@t.com', role: 'staff' } },
        { method: 'patch', url: `/api/v1/users/${dummyId}`, body: { name: 'No Token' } },
        { method: 'post', url: `/api/v1/users/${dummyId}/block` },
        { method: 'post', url: `/api/v1/users/${dummyId}/unblock` },
        { method: 'get', url: '/api/v1/doctors/me' },
        { method: 'patch', url: '/api/v1/doctors/me', body: { consultationFee: 100 } },
        { method: 'put', url: '/api/v1/doctors/me/availability', body: { slotMinutes: 15, weeklyAvailability: [] } },
        { method: 'patch', url: '/api/v1/doctors/me/online', body: { isOnline: true } },
        { method: 'post', url: '/api/v1/doctors/me/heartbeat' },
        { method: 'get', url: '/api/v1/doctors/admin/list' },
        { method: 'get', url: '/api/v1/doctors/admin/pending' },
        { method: 'post', url: `/api/v1/doctors/${dummyId}/approve` },
        { method: 'post', url: `/api/v1/doctors/${dummyId}/block` },
        { method: 'get', url: '/api/v1/patients/me' },
        { method: 'get', url: '/api/v1/patients' },
        { method: 'post', url: '/api/v1/patients', body: { name: 'No Auth' } },
        { method: 'get', url: `/api/v1/patients/${dummyId}` },
        { method: 'get', url: `/api/v1/patients/${dummyId}/timeline` },
        { method: 'patch', url: `/api/v1/patients/${dummyId}`, body: { name: 'No Auth' } },
        { method: 'delete', url: `/api/v1/patients/${dummyId}` },
        { method: 'get', url: '/api/v1/audit-logs' },
      ];

      for (const ep of endpoints) {
        const req = (request(app) as any)[ep.method](ep.url);
        if (ep.body) req.send(ep.body);
        const res = await req;
        expect(res.status, `Endpoint ${ep.method.toUpperCase()} ${ep.url} should return 401`).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('5. Missing Role Guards (403 FORBIDDEN)', () => {
    it('returns 403 when user does not have required role', async () => {
      // Non-admin (staff) attempting admin user routes
      const staffPostUser = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Denied', email: 'denied@gap.com', role: 'staff' });
      expect(staffPostUser.status).toBe(403);

      const staffPatchUser = await request(app)
        .patch(`/api/v1/users/${patientId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Denied' });
      expect(staffPatchUser.status).toBe(403);

      const staffBlockUser = await request(app)
        .post(`/api/v1/users/${patientId}/block`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(staffBlockUser.status).toBe(403);

      const staffUnblockUser = await request(app)
        .post(`/api/v1/users/${patientId}/unblock`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(staffUnblockUser.status).toBe(403);

      // Non-doctor (patient) attempting doctor self-management
      const patientDoctorMe = await request(app)
        .get('/api/v1/doctors/me')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(patientDoctorMe.status).toBe(403);

      const patientDoctorPatch = await request(app)
        .patch('/api/v1/doctors/me')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ consultationFee: 500 });
      expect(patientDoctorPatch.status).toBe(403);

      const patientDoctorAvail = await request(app)
        .put('/api/v1/doctors/me/availability')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotMinutes: 15, weeklyAvailability: [] });
      expect(patientDoctorAvail.status).toBe(403);

      const patientDoctorOnline = await request(app)
        .patch('/api/v1/doctors/me/online')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ isOnline: true });
      expect(patientDoctorOnline.status).toBe(403);

      const patientDoctorHeartbeat = await request(app)
        .post('/api/v1/doctors/me/heartbeat')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(patientDoctorHeartbeat.status).toBe(403);

      // Non-admin (doctor) attempting doctor admin routes
      const docAdminList = await request(app)
        .get('/api/v1/doctors/admin/list')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(docAdminList.status).toBe(403);

      const docAdminPending = await request(app)
        .get('/api/v1/doctors/admin/pending')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(docAdminPending.status).toBe(403);

      const docApprove = await request(app)
        .post(`/api/v1/doctors/${dummyId}/approve`)
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(docApprove.status).toBe(403);

      const docBlock = await request(app)
        .post(`/api/v1/doctors/${dummyId}/block`)
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(docBlock.status).toBe(403);

      // Non-patient (staff) attempting /patients/me
      const staffPatientMe = await request(app)
        .get('/api/v1/patients/me')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(staffPatientMe.status).toBe(403);

      // Non-staff/admin (patient) attempting staff patient management
      const patientListPatients = await request(app)
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(patientListPatients.status).toBe(403);

      const patientPostPatients = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ name: 'Denied', phone: '+919820112233' });
      expect(patientPostPatients.status).toBe(403);

      const patientPatchPatients = await request(app)
        .patch(`/api/v1/patients/${dummyId}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ name: 'Denied' });
      expect(patientPatchPatients.status).toBe(403);
    });
  });

  describe('6. Missing Not Found (404 NOT_FOUND)', () => {
    it('returns 404 for valid but non-existent resources', async () => {
      // POST /users/:id/block with non-existent user
      const nonExistentUserBlock = await request(app)
        .post(`/api/v1/users/${dummyId}/block`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(nonExistentUserBlock.status).toBe(404);
      expect(nonExistentUserBlock.body.error.code).toBe('NOT_FOUND');

      // POST /users/:id/unblock with non-existent user
      const nonExistentUserUnblock = await request(app)
        .post(`/api/v1/users/${dummyId}/unblock`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(nonExistentUserUnblock.status).toBe(404);
      expect(nonExistentUserUnblock.body.error.code).toBe('NOT_FOUND');

      // GET /doctors/:id/slots with non-existent doctor
      const nonExistentDocSlots = await request(app)
        .get(`/api/v1/doctors/${dummyId}/slots?date=${tomorrowStr}`);
      expect(nonExistentDocSlots.status).toBe(404);
      expect(nonExistentDocSlots.body.error.code).toBe('NOT_FOUND');

      // POST /doctors/:id/approve with non-existent doctor
      const nonExistentDocApprove = await request(app)
        .post(`/api/v1/doctors/${dummyId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(nonExistentDocApprove.status).toBe(404);
      expect(nonExistentDocApprove.body.error.code).toBe('NOT_FOUND');

      // POST /doctors/:id/block with non-existent doctor
      const nonExistentDocBlock = await request(app)
        .post(`/api/v1/doctors/${dummyId}/block`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(nonExistentDocBlock.status).toBe(404);
      expect(nonExistentDocBlock.body.error.code).toBe('NOT_FOUND');

      // PATCH /patients/:id with non-existent patient
      const nonExistentPatientPatch = await request(app)
        .patch(`/api/v1/patients/${dummyId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Non Existent' });
      expect(nonExistentPatientPatch.status).toBe(404);
      expect(nonExistentPatientPatch.body.error.code).toBe('NOT_FOUND');

      // DELETE /patients/:id with non-existent patient
      const nonExistentPatientDel = await request(app)
        .delete(`/api/v1/patients/${dummyId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(nonExistentPatientDel.status).toBe(404);
      expect(nonExistentPatientDel.body.error.code).toBe('NOT_FOUND');

      // Doctor user with missing Doctor record
      const orphanDoctorUser = await UserModel.create({
        name: 'Orphan Doctor',
        email: 'orphan.dr@gaptest.example',
        passwordHash: 'dummy',
        role: 'doctor',
        status: 'active',
        emailVerified: true,
      });
      const orphanDoctorToken = signAccess({ userId: orphanDoctorUser._id.toString(), role: 'doctor' });

      const orphanDoctorMe = await request(app)
        .get('/api/v1/doctors/me')
        .set('Authorization', `Bearer ${orphanDoctorToken}`);
      expect(orphanDoctorMe.status).toBe(404);
      expect(orphanDoctorMe.body.error.code).toBe('NOT_FOUND');

      const orphanDoctorPatch = await request(app)
        .patch('/api/v1/doctors/me')
        .set('Authorization', `Bearer ${orphanDoctorToken}`)
        .send({ consultationFee: 1000 });
      expect(orphanDoctorPatch.status).toBe(404);
      expect(orphanDoctorPatch.body.error.code).toBe('NOT_FOUND');

      // Patient user with missing Patient record
      const orphanPatientUser = await UserModel.create({
        name: 'Orphan Patient',
        email: 'orphan.p@gaptest.example',
        passwordHash: 'dummy',
        role: 'patient',
        status: 'active',
        emailVerified: true,
      });
      const orphanPatientToken = signAccess({ userId: orphanPatientUser._id.toString(), role: 'patient' });

      const orphanPatientMe = await request(app)
        .get('/api/v1/patients/me')
        .set('Authorization', `Bearer ${orphanPatientToken}`);
      expect(orphanPatientMe.status).toBe(404);
      expect(orphanPatientMe.body.error.code).toBe('NOT_FOUND');
    });
  });
});
