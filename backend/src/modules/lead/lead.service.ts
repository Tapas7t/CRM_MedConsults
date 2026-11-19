import { Types } from 'mongoose';
import { Lead, type ILeadDocument } from './lead.model.js';
import { Patient } from '../patient/patient.model.js';
import { Activity } from '../activity/activity.model.js';
import { AuditLog } from '../auditLog/auditLog.model.js';
import { type IUserDocument } from '../user/user.model.js';
import { normalizePhone } from '../../utils/phone.js';
import { generatePatientCode } from '../../utils/patientCode.js';
import { AppError } from '../../middleware/errorHandler.js';
import { LEAD_STAGES } from '../../types/index.js';
import type {
  CreateLeadInput,
  UpdateLeadInput,
  ChangeLeadStageInput,
  GetLeadsQuery,
  PublicEnquiryInput,
} from './lead.schemas.js';

export class LeadService {
  /**
   * Staff/Admin: List leads with search, filters, date range and pagination.
   */
  async getLeads(query: GetLeadsQuery) {
    const { stage, source, ownerId, q, from, to, page, limit } = query;
    const filter: Record<string, any> = { isDeleted: false };

    if (stage) filter.stage = stage;
    if (source) filter.source = source;
    if (ownerId) filter.ownerId = new Types.ObjectId(ownerId);

    if (q) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [{ name: regex }, { phone: regex }, { email: regex }, { interest: regex }];
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const skip = (page - 1) * limit;
    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('ownerId', 'name email role')
        .populate('patientId', 'name patientCode'),
      Lead.countDocuments(filter),
    ]);

    return {
      leads,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Staff/Admin: Kanban board grouped by stage with count per stage and 20 newest cards.
   */
  async getLeadsBoard() {
    const board: Record<string, { total: number; count: number; leads: any[]; cards: any[] }> = {};

    for (const stage of LEAD_STAGES) {
      const [leads, total] = await Promise.all([
        Lead.find({ stage, isDeleted: false })
          .sort({ createdAt: -1 })
          .limit(20)
          .populate('ownerId', 'name email')
          .populate('patientId', 'name patientCode'),
        Lead.countDocuments({ stage, isDeleted: false }),
      ]);
      board[stage] = { total, count: total, leads, cards: leads };
    }

    return { board, stages: board };
  }

  /**
   * Staff/Admin: Create a new lead.
   */
  async createLead(input: CreateLeadInput, actor: IUserDocument) {
    const normalizedPhone = normalizePhone(input.phone);

    const lead = await Lead.create({
      name: input.name,
      phone: normalizedPhone,
      email: input.email,
      interest: input.interest,
      source: input.source,
      stage: 'new',
      ownerId: input.ownerId ? new Types.ObjectId(input.ownerId) : undefined,
      isDeleted: false,
    });

    await Activity.create({
      entityType: 'Lead',
      entityId: lead._id.toString(),
      type: 'LEAD_CREATED',
      actorId: actor._id,
      meta: { source: input.source, name: input.name },
      at: new Date(),
    });

    return lead;
  }

  /**
   * Staff/Admin: Get lead by ID.
   */
  async getLeadById(id: string) {
    const lead = await Lead.findOne({ _id: id, isDeleted: false })
      .populate('ownerId', 'name email role')
      .populate('patientId', 'name patientCode phone email');

    if (!lead) {
      throw new AppError(404, 'NOT_FOUND', 'Lead not found.');
    }

    return lead;
  }

  /**
   * Staff/Admin: Update lead contact and interest details.
   */
  async updateLead(id: string, input: UpdateLeadInput, actor: IUserDocument) {
    const lead = await Lead.findOne({ _id: id, isDeleted: false });
    if (!lead) {
      throw new AppError(404, 'NOT_FOUND', 'Lead not found.');
    }

    if (input.name !== undefined) lead.name = input.name;
    if (input.phone !== undefined) lead.phone = normalizePhone(input.phone);
    if (input.email !== undefined) lead.email = input.email;
    if (input.interest !== undefined) lead.interest = input.interest;
    if (input.source !== undefined) lead.source = input.source;
    if (input.ownerId !== undefined) {
      lead.ownerId = input.ownerId ? (new Types.ObjectId(input.ownerId) as any) : undefined;
    }

    await lead.save();

    await Activity.create({
      entityType: 'Lead',
      entityId: lead._id.toString(),
      type: 'LEAD_UPDATED',
      actorId: actor._id,
      meta: { updatedFields: Object.keys(input) },
      at: new Date(),
    });

    return lead;
  }

  /**
   * Staff/Admin: Move lead between stages.
   * Moving to lost requires a non-empty lostReason.
   */
  async changeLeadStage(id: string, input: ChangeLeadStageInput, actor: IUserDocument) {
    const lead = await Lead.findOne({ _id: id, isDeleted: false });
    if (!lead) {
      throw new AppError(404, 'NOT_FOUND', 'Lead not found.');
    }

    const previousStage = lead.stage;
    lead.stage = input.stage;
    if (input.stage === 'lost') {
      lead.lostReason = input.lostReason;
    }

    await lead.save();

    await Activity.create({
      entityType: 'Lead',
      entityId: lead._id.toString(),
      type: 'LEAD_STAGE_CHANGED',
      actorId: actor._id,
      meta: {
        from: previousStage,
        to: input.stage,
        lostReason: input.lostReason,
      },
      at: new Date(),
    });

    return lead;
  }

  /**
   * Staff/Admin: Convert lead into an active patient.
   * Matches by phone or email if already registered; creates new patient otherwise.
   * Converting twice returns 409 CONFLICT.
   */
  async convertLead(id: string, actor: IUserDocument) {
    const lead = await Lead.findOne({ _id: id, isDeleted: false });
    if (!lead) {
      throw new AppError(404, 'NOT_FOUND', 'Lead not found.');
    }

    if (lead.patientId) {
      throw new AppError(409, 'CONFLICT', 'Lead has already been converted to a patient.');
    }

    const normalizedPhone = normalizePhone(lead.phone);

    // Look for matching existing patient
    const searchConditions: any[] = [{ phone: normalizedPhone }];
    if (lead.email) {
      searchConditions.push({ email: lead.email });
    }

    let patient = await Patient.findOne({
      isDeleted: false,
      $or: searchConditions,
    });

    let isNewPatient = false;
    if (!patient) {
      isNewPatient = true;
      const patientCode = await generatePatientCode();
      patient = await Patient.create({
        patientCode,
        name: lead.name,
        phone: normalizedPhone,
        email: lead.email,
        source: lead.source,
        status: 'active',
      });
    }

    // Link patient to lead and close the lead
    lead.patientId = patient._id;
    lead.stage = 'closed';
    await lead.save();

    // Activity on Lead
    await Activity.create({
      entityType: 'Lead',
      entityId: lead._id.toString(),
      type: 'LEAD_CONVERTED',
      actorId: actor._id,
      meta: {
        patientId: patient._id.toString(),
        patientCode: patient.patientCode,
        isNewPatient,
      },
      at: new Date(),
    });

    // Activity on Patient
    await Activity.create({
      entityType: 'Patient',
      entityId: patient._id.toString(),
      type: 'PATIENT_LINKED_LEAD',
      actorId: actor._id,
      meta: {
        leadId: lead._id.toString(),
      },
      at: new Date(),
    });

    return { patient };
  }

  /**
   * Admin: Soft delete lead.
   */
  async deleteLead(id: string, actor: IUserDocument, ip?: string) {
    const lead = await Lead.findOne({ _id: id, isDeleted: false });
    if (!lead) {
      throw new AppError(404, 'NOT_FOUND', 'Lead not found.');
    }

    lead.isDeleted = true;
    lead.deletedAt = new Date();
    await lead.save();

    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'LEAD_DELETED',
      entityType: 'Lead',
      entityId: lead._id.toString(),
      ip,
      meta: { name: lead.name, phone: lead.phone },
      at: new Date(),
    });

    return { message: 'Lead soft deleted successfully.' };
  }

  /**
   * Public: Handle public website enquiries.
   * Includes honeypot bot trap (returns generic success without creating records if filled).
   * Appends activity to open lead if same phone exists; creates new lead otherwise.
   */
  async handlePublicEnquiry(input: PublicEnquiryInput, ip?: string) {
    const genericResponse = {
      message: 'Thank you for reaching out. Our team will contact you shortly.',
    };

    // Honeypot check: if filled, silently return success without persisting
    const trapTriggered =
      (input.honeypot && input.honeypot.trim().length > 0) ||
      (input.websiteUrl && input.websiteUrl.trim().length > 0);

    if (trapTriggered) {
      return genericResponse;
    }

    const normalizedPhone = normalizePhone(input.phone);

    // Check for open lead with same phone
    const existingOpenLead = await Lead.findOne({
      phone: normalizedPhone,
      stage: { $nin: ['closed', 'lost'] },
      isDeleted: false,
    });

    if (existingOpenLead) {
      // Append activity to existing open lead
      await Activity.create({
        entityType: 'Lead',
        entityId: existingOpenLead._id.toString(),
        type: 'ENQUIRY_RECEIVED',
        meta: {
          concern: input.concern,
          preferredSpecialty: input.preferredSpecialty,
          ip,
        },
        at: new Date(),
      });
      return genericResponse;
    }

    // Create new website lead
    const interest = input.preferredSpecialty
      ? `${input.preferredSpecialty}: ${input.concern}`
      : input.concern;

    const lead = await Lead.create({
      name: input.name,
      phone: normalizedPhone,
      email: input.email,
      interest,
      source: 'website',
      stage: 'new',
      isDeleted: false,
    });

    await Activity.create({
      entityType: 'Lead',
      entityId: lead._id.toString(),
      type: 'LEAD_CREATED',
      meta: {
        source: 'website',
        concern: input.concern,
        preferredSpecialty: input.preferredSpecialty,
        ip,
      },
      at: new Date(),
    });

    return genericResponse;
  }
}

export const leadService = new LeadService();
