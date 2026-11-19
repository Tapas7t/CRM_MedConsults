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
import { Lead } from '../src/modules/lead/lead.model.js';
import { Patient } from '../src/modules/patient/patient.model.js';
import { Activity } from '../src/modules/activity/activity.model.js';
import { signAccess } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/password.js';

describe('Leads Module Integration Tests', () => {
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

  describe('Staff and Admin Leads CRUD & Filtering', () => {
    it('enforces RBAC: 401 unauth, 403 for patient/doctor, 200 for staff/admin', async () => {
      const staffUser = await createUserFixture('staff', 'staff@medconsults.example');
      const patientUser = await createUserFixture('patient', 'patient@medconsults.example');
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });
      const patientToken = signAccess({ userId: patientUser._id.toString(), role: 'patient' });

      // 401 without auth
      const unauth = await request(app).get('/api/v1/leads');
      expect(unauth.status).toBe(401);

      // 403 for patient
      const forbidden = await request(app)
        .get('/api/v1/leads')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(forbidden.status).toBe(403);

      // 200 for staff
      const ok = await request(app)
        .get('/api/v1/leads')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(ok.status).toBe(200);
      expect(ok.body.success).toBe(true);
    });

    it('creates a lead, normalizes Indian phone numbers, filters by stage and q, and supports pagination', async () => {
      const staffUser = await createUserFixture('staff', 'staff2@medconsults.example', 'Pooja Sawant');
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });

      // Create lead with local 10-digit format
      const createRes = await request(app)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Sunil Deshmukh',
          phone: '9820111222',
          email: 'sunil.d@example.com',
          interest: 'Cardiology',
          source: 'website',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.lead.phone).toBe('+919820111222');
      expect(createRes.body.data.lead.stage).toBe('new');

      const leadId = createRes.body.data.lead._id;

      // Create second lead
      await Lead.create({
        name: 'Anita Roy',
        phone: '+919820333444',
        email: 'anita.roy@example.com',
        interest: 'Dermatology',
        source: 'phone',
        stage: 'contacted',
        ownerId: staffUser._id,
      });

      // Filter by stage
      const stageRes = await request(app)
        .get('/api/v1/leads?stage=contacted')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(stageRes.status).toBe(200);
      expect(stageRes.body.data.leads).toHaveLength(1);
      expect(stageRes.body.data.leads[0].name).toBe('Anita Roy');

      // Filter by search query q
      const qRes = await request(app)
        .get('/api/v1/leads?q=Sunil')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(qRes.status).toBe(200);
      expect(qRes.body.data.leads).toHaveLength(1);
      expect(qRes.body.data.leads[0].name).toBe('Sunil Deshmukh');

      // Update lead
      const patchRes = await request(app)
        .patch(`/api/v1/leads/${leadId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          interest: 'Preventive Cardiology',
        });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.lead.interest).toBe('Preventive Cardiology');

      // Get lead by ID
      const getRes = await request(app)
        .get(`/api/v1/leads/${leadId}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.lead.name).toBe('Sunil Deshmukh');
    });

    it('returns Kanban board grouped by stage with counts and max 20 cards per column', async () => {
      const staffUser = await createUserFixture('staff', 'staff.board@medconsults.example');
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });

      // Create leads in different stages
      await Lead.create({ name: 'Lead 1', phone: '+919820000001', stage: 'new' });
      await Lead.create({ name: 'Lead 2', phone: '+919820000002', stage: 'new' });
      await Lead.create({ name: 'Lead 3', phone: '+919820000003', stage: 'contacted' });

      const boardRes = await request(app)
        .get('/api/v1/leads/board')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(boardRes.status).toBe(200);
      expect(boardRes.body.data.stages).toBeDefined();
      expect(boardRes.body.data.stages.new.count).toBe(2);
      expect(boardRes.body.data.stages.new.cards).toHaveLength(2);
      expect(boardRes.body.data.stages.contacted.count).toBe(1);
      expect(boardRes.body.data.stages.contacted.cards).toHaveLength(1);
      expect(boardRes.body.data.stages.lost.count).toBe(0);
    });

    it('stage transitions: allows moving between stages, requires lostReason for lost, writes activity', async () => {
      const staffUser = await createUserFixture('staff', 'staff.stage@medconsults.example');
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });

      const lead = await Lead.create({
        name: 'Vikas Mehta',
        phone: '+919820444555',
        stage: 'new',
      });

      // Move to contacted
      const move1 = await request(app)
        .post(`/api/v1/leads/${lead._id}/stage`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ stage: 'contacted' });

      expect(move1.status).toBe(200);
      expect(move1.body.data.lead.stage).toBe('contacted');

      // Verify activity recorded
      const act1 = await Activity.findOne({
        entityType: 'Lead',
        entityId: lead._id.toString(),
        type: 'LEAD_STAGE_CHANGED',
      });
      expect(act1).not.toBeNull();
      expect(act1?.meta?.from).toBe('new');
      expect(act1?.meta?.to).toBe('contacted');

      // Moving to lost without lostReason fails
      const failLost = await request(app)
        .post(`/api/v1/leads/${lead._id}/stage`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ stage: 'lost' });

      expect(failLost.status).toBe(400);

      // Moving to lost with lostReason succeeds
      const okLost = await request(app)
        .post(`/api/v1/leads/${lead._id}/stage`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ stage: 'lost', lostReason: 'Fee too high' });

      expect(okLost.status).toBe(200);
      expect(okLost.body.data.lead.stage).toBe('lost');
      expect(okLost.body.data.lead.lostReason).toBe('Fee too high');
    });

    it('convert lead: links to existing patient by phone, sets patientId, converting twice returns 409', async () => {
      const staffUser = await createUserFixture('staff', 'staff.convert@medconsults.example');
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });

      // Existing patient
      const existingPatient = await Patient.create({
        name: 'Pooja Hegde',
        phone: '+919820555666',
        patientCode: 'P-TEST-5566',
        source: 'walk_in',
        status: 'active',
      });

      // Lead with matching phone
      const lead = await Lead.create({
        name: 'Pooja Hegde',
        phone: '+919820555666',
        stage: 'contacted',
      });

      const convertRes = await request(app)
        .post(`/api/v1/leads/${lead._id}/convert`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(convertRes.status).toBe(200);
      expect(convertRes.body.data.patient._id).toBe(existingPatient._id.toString());

      // Verify lead updated to closed with patientId
      const updatedLead = await Lead.findById(lead._id);
      expect(updatedLead?.stage).toBe('closed');
      expect(updatedLead?.patientId?.toString()).toBe(existingPatient._id.toString());

      // Converting again returns 409
      const secondConvert = await request(app)
        .post(`/api/v1/leads/${lead._id}/convert`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(secondConvert.status).toBe(409);
    });

    it('convert lead: creates new patient with patient code if no match exists', async () => {
      const staffUser = await createUserFixture('staff', 'staff.convnew@medconsults.example');
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });

      const lead = await Lead.create({
        name: 'Fresh Patient Lead',
        phone: '+919820777888',
        email: 'fresh@example.com',
        stage: 'contacted',
      });

      const convertRes = await request(app)
        .post(`/api/v1/leads/${lead._id}/convert`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(convertRes.status).toBe(200);
      expect(convertRes.body.data.patient.name).toBe('Fresh Patient Lead');
      expect(convertRes.body.data.patient.patientCode).toMatch(/^P-[A-Z0-9]+-\d{4}$/);
    });

    it('delete lead: staff gets 403, admin soft deletes (subsequently 404)', async () => {
      const staffUser = await createUserFixture('staff', 'staff.del@medconsults.example');
      const adminUser = await createUserFixture('admin', 'admin.del@medconsults.example');
      const staffToken = signAccess({ userId: staffUser._id.toString(), role: 'staff' });
      const adminToken = signAccess({ userId: adminUser._id.toString(), role: 'admin' });

      const lead = await Lead.create({
        name: 'Lead To Delete',
        phone: '+919820999000',
        stage: 'new',
      });

      // Staff gets 403
      const staffDel = await request(app)
        .delete(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(staffDel.status).toBe(403);

      // Admin succeeds
      const adminDel = await request(app)
        .delete(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminDel.status).toBe(200);

      // Subsequently 404 on get
      const getRes = await request(app)
        .get(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('Public Enquiries (POST /api/v1/public/enquiries)', () => {
    it('creates lead with source website; bot honeypot traps return generic success without creating lead', async () => {
      // 1. Legitimate enquiry
      const legitRes = await request(app)
        .post('/api/v1/public/enquiries')
        .send({
          name: 'Public Visitor',
          phone: '9820123456',
          concern: 'Need cardiac opinion for chest pain',
          preferredSpecialty: 'Cardiology',
        });

      expect(legitRes.status).toBe(200);
      expect(legitRes.body.success).toBe(true);

      const createdLead = await Lead.findOne({ phone: '+919820123456' });
      expect(createdLead).not.toBeNull();
      expect(createdLead?.source).toBe('website');
      expect(createdLead?.stage).toBe('new');

      // 2. Bot with honeypot filled (websiteUrl)
      const botRes = await request(app)
        .post('/api/v1/public/enquiries')
        .send({
          name: 'Spam Bot',
          phone: '9820999999',
          concern: 'Cheap meds spam',
          websiteUrl: 'https://spam-site.com',
        });

      expect(botRes.status).toBe(200);
      expect(botRes.body.success).toBe(true);

      // Bot enquiry was NOT inserted
      const botLead = await Lead.findOne({ phone: '+919820999999' });
      expect(botLead).toBeNull();
    });

    it('duplicate phone on open lead appends activity instead of creating a duplicate lead', async () => {
      const openLead = await Lead.create({
        name: 'Repeat Inquirer',
        phone: '+919820888999',
        source: 'website',
        stage: 'new',
      });

      const res = await request(app)
        .post('/api/v1/public/enquiries')
        .send({
          name: 'Repeat Inquirer',
          phone: '9820888999',
          concern: 'Following up on my previous message',
        });

      expect(res.status).toBe(200);

      // Verify no duplicate lead
      const leads = await Lead.find({ phone: '+919820888999' });
      expect(leads).toHaveLength(1);

      // Verify activity appended
      const activity = await Activity.findOne({
        entityType: 'Lead',
        entityId: openLead._id.toString(),
        type: 'ENQUIRY_RECEIVED',
      });
      expect(activity).not.toBeNull();
    });

    it('enforces rate limit on public enquiries', async () => {
      // In test mode, limiter max is set to 50
      // Send 50 requests
      const agent = request(app);
      for (let i = 0; i < 50; i++) {
        await agent.post('/api/v1/public/enquiries').send({
          name: 'Rate Limit Test',
          phone: '9820000000',
          concern: 'Checking rate limit',
        });
      }

      // 51st request should be rate limited (429)
      const limitedRes = await agent.post('/api/v1/public/enquiries').send({
        name: 'Rate Limit Test',
        phone: '9820000000',
        concern: 'Checking rate limit',
      });
      expect(limitedRes.status).toBe(429);
      expect(limitedRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });
});
