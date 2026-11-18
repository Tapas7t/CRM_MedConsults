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
import { Appointment } from '../src/modules/appointment/appointment.model.js';
import { Activity } from '../src/modules/activity/activity.model.js';
import { AuditLog } from '../src/modules/auditLog/auditLog.model.js';
import { signAccess } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/password.js';

describe('Patients Module Integration Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  async function createUserFixture(role: 'admin' | 'staff' | 'patient' | 'doctor', email: string, name = 'Test User') {
    const passwordHash = await hashPassword('SecurePass123!');
    return UserModel.create({
      name,
      email,
      phone: '+919820001122',
      passwordHash,
      role,
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });
  }

  describe('GET /api/v1/patients/me', () => {
    it('returns own patient record for logged-in patient, 401 unauthenticated, 403 other roles', async () => {
      const patientUser = await createUserFixture('patient', 'patient.me@medconsults.example', 'Aarav Sharma');
      const staffUser = await createUserFixture('staff', 'staff.me@medconsults.example');

      const patientToken = signAccess({ userId: patientUser._id.toString(), role: 'patient' });
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });

      // Create linked Patient CRM record
      const patientDoc = await Patient.create({
        userId: patientUser._id,
        name: patientUser.name,
        phone: patientUser.phone!,
        email: patientUser.email,
        patientCode: 'P-ME-0001',
        source: 'website',
        status: 'active',
        whatsappOptIn: true,
      });

      // 1. Success for patient
      const res = await request(app)
        .get('/api/v1/patients/me')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.patient.patientCode).toBe(patientDoc.patientCode);

      // 2. 401 without token
      const unauthRes = await request(app).get('/api/v1/patients/me');
      expect(unauthRes.status).toBe(401);

      // 3. 403 for staff (roleGuard patient only)
      const forbiddenRes = await request(app)
        .get('/api/v1/patients/me')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(forbiddenRes.status).toBe(403);
    });
  });

  describe('Staff and Admin CRUD (/api/v1/patients)', () => {
    it('allows staff to create and search CRM patients, writing activity and audit logs', async () => {
      const staffUser = await createUserFixture('staff', 'staff@medconsults.example', 'Pooja Sawant');
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });

      const newPatientData = {
        name: 'Ramesh Gupta',
        phone: '+919820334455',
        email: 'ramesh.gupta@medconsults.example',
        dob: '1985-04-12',
        gender: 'male',
        source: 'walk_in',
        status: 'active',
        whatsappOptIn: true,
      };

      // 1. Create Patient
      const createRes = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${staffToken}`)
        .send(newPatientData);

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.patient.patientCode).toMatch(/^P-[A-Z0-9]+-\d{4}$/);
      expect(createRes.body.data.patient.name).toBe(newPatientData.name);
      expect(createRes.body.data.patient.whatsappOptIn).toBe(true);

      const patientId = createRes.body.data.patient._id;

      // 2. Verify Activity was written
      const activity = await Activity.findOne({
        entityType: 'Patient',
        $or: [{ entityId: patientId }, { entityId: new Types.ObjectId(patientId) }],
        type: 'PATIENT_CREATED',
      });
      expect(activity).not.toBeNull();
      expect(activity!.actorId?.toString()).toBe(staffUser._id.toString());

      // 3. Verify AuditLog was written
      const audit = await AuditLog.findOne({
        entityType: 'Patient',
        entityId: patientId,
        action: 'PATIENT_CREATED',
      });
      expect(audit).not.toBeNull();

      // 4. Search and filter patients
      const searchRes = await request(app)
        .get('/api/v1/patients?q=Ramesh')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.patients).toHaveLength(1);
      expect(searchRes.body.data.patients[0].name).toBe('Ramesh Gupta');

      // 5. Update patient
      const updateRes = await request(app)
        .patch(`/api/v1/patients/${patientId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          phone: '+919988776611',
          source: 'referral',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.patient.phone).toBe('+919988776611');
      expect(updateRes.body.data.patient.source).toBe('referral');

      // Verify update activity
      const updateActivity = await Activity.findOne({
        entityType: 'Patient',
        $or: [{ entityId: patientId }, { entityId: new Types.ObjectId(patientId) }],
        type: 'PATIENT_UPDATED',
      });
      expect(updateActivity).not.toBeNull();
    });

    it('enforces soft delete: admin can delete, non-admin cannot (403)', async () => {
      const admin = await createUserFixture('admin', 'admin@medconsults.example');
      const staff = await createUserFixture('staff', 'staff@medconsults.example');
      const adminToken = signAccess({ userId: admin._id.toString(), role: 'admin' });
      const staffToken = signAccess({ userId: staff._id.toString(), role: 'staff' });

      const patient = await Patient.create({
        name: 'Patient To Delete',
        phone: '+919820009988',
        patientCode: 'P-DEL-0001',
        source: 'walk_in',
        status: 'active',
        whatsappOptIn: false,
      });

      // Staff cannot delete (403)
      const staffDelRes = await request(app)
        .delete(`/api/v1/patients/${patient._id}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(staffDelRes.status).toBe(403);

      // Admin can delete (200)
      const adminDelRes = await request(app)
        .delete(`/api/v1/patients/${patient._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminDelRes.status).toBe(200);

      // In DB: isDeleted is true
      const deletedInDb = await Patient.findById(patient._id);
      expect(deletedInDb!.isDeleted).toBe(true);

      // Subsequent query returns 404
      const getRes = await request(app)
        .get(`/api/v1/patients/${patient._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('Doctor Patient Access Check and Confidentiality', () => {
    it('allows a treating doctor with an appointment to read patient record and timeline, but returns 404 for a doctor without an appointment', async () => {
      // Doctor 1
      const docUser1 = await createUserFixture('doctor', 'doc1@medconsults.example');
      const doc1 = await Doctor.create({
        userId: docUser1._id,
        specialty: 'Cardiology',
        qualifications: ['MBBS'],
        registrationNo: 'MMC-1',
        experienceYears: 10,
        consultationFee: 1000,
        clinicRoom: '101',
        approvalStatus: 'approved',
        weeklyAvailability: [],
        blockedDates: [],
      });
      const doc1Token = signAccess({ userId: docUser1._id.toString(), role: 'doctor' });

      // Doctor 2 (has no appointment)
      const docUser2 = await createUserFixture('doctor', 'doc2@medconsults.example');
      await Doctor.create({
        userId: docUser2._id,
        specialty: 'Dermatology',
        qualifications: ['MBBS'],
        registrationNo: 'MMC-2',
        experienceYears: 8,
        consultationFee: 900,
        clinicRoom: '102',
        approvalStatus: 'approved',
        weeklyAvailability: [],
        blockedDates: [],
      });
      const doc2Token = signAccess({ userId: docUser2._id.toString(), role: 'doctor' });

      // Patient
      const patient = await Patient.create({
        name: 'Shared Patient',
        phone: '+919820776655',
        patientCode: 'P-SH-0001',
        source: 'website',
        status: 'active',
        whatsappOptIn: false,
      });

      // Doctor 1 has an appointment with patient
      await Appointment.create({
        patientId: patient._id,
        doctorId: doc1._id,
        start: new Date('2026-11-20T10:00:00Z'),
        end: new Date('2026-11-20T10:15:00Z'),
        status: 'booked',
        tokenNumber: 1,
        queueDate: '2026-11-20',
        fee: 1000,
        paymentStatus: 'pay_at_clinic',
        source: 'website',
      });

      // 1. Doctor 1 (with appointment) can view patient: 200 OK
      const doc1Res = await request(app)
        .get(`/api/v1/patients/${patient._id}`)
        .set('Authorization', `Bearer ${doc1Token}`);
      expect(doc1Res.status).toBe(200);
      expect(doc1Res.body.data.patient._id).toBe(patient._id.toString());

      // 2. Doctor 1 can view timeline: 200 OK
      const doc1TimelineRes = await request(app)
        .get(`/api/v1/patients/${patient._id}/timeline`)
        .set('Authorization', `Bearer ${doc1Token}`);
      expect(doc1TimelineRes.status).toBe(200);
      expect(doc1TimelineRes.body.data.patientCode).toBe(patient.patientCode);

      // 3. Doctor 2 (without appointment) receives 404 NOT_FOUND!
      const doc2Res = await request(app)
        .get(`/api/v1/patients/${patient._id}`)
        .set('Authorization', `Bearer ${doc2Token}`);
      expect(doc2Res.status).toBe(404);
      expect(doc2Res.body.error.code).toBe('NOT_FOUND');

      const doc2TimelineRes = await request(app)
        .get(`/api/v1/patients/${patient._id}/timeline`)
        .set('Authorization', `Bearer ${doc2Token}`);
      expect(doc2TimelineRes.status).toBe(404);
      expect(doc2TimelineRes.body.error.code).toBe('NOT_FOUND');
    });

    it('proves staff and admin never receive clinical notes or diagnosis on patient endpoints', async () => {
      const staffUser = await createUserFixture('staff', 'staff.check@medconsults.example');
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });

      const patient = await Patient.create({
        name: 'Confidentiality Test',
        phone: '+919820665544',
        patientCode: 'P-CONF-0001',
        source: 'walk_in',
        status: 'active',
        whatsappOptIn: false,
      });

      const res = await request(app)
        .get(`/api/v1/patients/${patient._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      const str = JSON.stringify(res.body);
      expect(str).not.toContain('clinical');
      expect(str).not.toContain('diagnosis');
      expect(str).not.toContain('prescription');
    });
  });
});
