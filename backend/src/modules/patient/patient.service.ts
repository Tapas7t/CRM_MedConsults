import { Patient, type IPatientDocument } from './patient.model.js';
import type { IUserDocument } from '../user/user.model.js';
import { Activity } from '../activity/activity.model.js';
import { AuditLog } from '../auditLog/auditLog.model.js';
import { canDoctorAccessPatient } from '../../utils/ownershipCheck.js';
import { generatePatientCode } from '../../utils/patientCode.js';
import { AppError } from '../../middleware/errorHandler.js';
import type {
  GetPatientsQuery,
  CreatePatientInput,
  UpdatePatientInput,
} from './patient.schemas.js';

export class PatientService {
  /**
   * Patient: Get own patient CRM profile.
   */
  async getPatientMe(user: IUserDocument) {
    const patient = await Patient.findOne({ userId: user._id, isDeleted: false });
    if (!patient) {
      throw new AppError(404, 'NOT_FOUND', 'Patient record not found.');
    }
    return patient;
  }

  /**
   * Staff/Admin: List patients with search, filters, and pagination.
   */
  async getPatients(query: GetPatientsQuery) {
    const { q, status, source, assignedStaffId, page, limit } = query;
    const filter: Record<string, any> = { isDeleted: false };

    if (status) {
      filter.status = status;
    }
    if (source) {
      filter.source = source;
    }
    if (assignedStaffId) {
      filter.assignedStaffId = assignedStaffId;
    }
    if (q) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [
        { name: regex },
        { phone: regex },
        { email: regex },
        { patientCode: regex },
      ];
    }

    const skip = (page - 1) * limit;
    const [patients, total] = await Promise.all([
      Patient.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assignedStaffId', 'name email'),
      Patient.countDocuments(filter),
    ]);

    return {
      patients,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Staff/Admin: Create CRM patient record without user login credentials.
   * Logs an Activity and an AuditLog entry.
   */
  async createPatient(input: CreatePatientInput, actor: IUserDocument, ip?: string) {
    let patientCode = generatePatientCode();

    // Ensure unique patient code
    let retries = 0;
    while (await Patient.exists({ patientCode })) {
      patientCode = generatePatientCode();
      retries++;
      if (retries > 5) break;
    }

    const patient = await Patient.create({
      name: input.name,
      phone: input.phone,
      email: input.email,
      dob: input.dob,
      gender: input.gender,
      source: input.source,
      assignedStaffId: input.assignedStaffId,
      status: input.status,
      whatsappOptIn: input.whatsappOptIn,
      whatsappOptInAt: input.whatsappOptIn ? new Date() : undefined,
      patientCode,
      isDeleted: false,
    });

    // Write Activity entry
    await Activity.create({
      entityType: 'Patient',
      entityId: patient._id.toString(),
      type: 'PATIENT_CREATED',
      actorId: actor._id,
      meta: {
        name: patient.name,
        phone: patient.phone,
        source: patient.source,
      },
      at: new Date(),
    });

    // Write AuditLog entry
    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'PATIENT_CREATED',
      entityType: 'Patient',
      entityId: patient._id.toString(),
      ip,
      meta: { patientCode: patient.patientCode },
      at: new Date(),
    });

    return patient;
  }

  /**
   * Staff/Admin or treating Doctor: Get patient details.
   * Doctors may only view if they have an appointment with this patient; returns 404 otherwise.
   * Never exposes diagnosis or clinical notes.
   */
  async getPatientById(id: string, actor: IUserDocument, ip?: string) {
    const patient = await Patient.findOne({ _id: id, isDeleted: false }).populate(
      'assignedStaffId',
      'name email'
    );

    if (!patient) {
      throw new AppError(404, 'NOT_FOUND', 'Patient not found.');
    }

    if (actor.role === 'doctor') {
      const allowed = await canDoctorAccessPatient(actor._id, patient._id);
      if (!allowed) {
        throw new AppError(404, 'NOT_FOUND', 'Patient not found.');
      }
    }

    // Write AuditLog entry for viewing patient data
    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'PATIENT_VIEWED',
      entityType: 'Patient',
      entityId: patient._id.toString(),
      ip,
      meta: { patientCode: patient.patientCode },
      at: new Date(),
    });

    return patient;
  }

  /**
   * Staff/Admin or treating Doctor: Get patient interaction timeline.
   * Returns Activity entries; never includes clinical notes or diagnosis.
   */
  async getPatientTimeline(id: string, actor: IUserDocument, ip?: string) {
    const patient = await Patient.findOne({ _id: id, isDeleted: false });
    if (!patient) {
      throw new AppError(404, 'NOT_FOUND', 'Patient not found.');
    }

    if (actor.role === 'doctor') {
      const allowed = await canDoctorAccessPatient(actor._id, patient._id);
      if (!allowed) {
        throw new AppError(404, 'NOT_FOUND', 'Patient not found.');
      }
    }

    // Write AuditLog entry for timeline access
    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'PATIENT_TIMELINE_VIEWED',
      entityType: 'Patient',
      entityId: patient._id.toString(),
      ip,
      meta: { patientCode: patient.patientCode },
      at: new Date(),
    });

    const activities = await Activity.find({
      entityType: 'Patient',
      entityId: { $in: [patient._id, patient._id.toString()] },
    })
      .sort({ at: -1 })
      .populate('actorId', 'name role');

    return {
      patientId: patient._id.toString(),
      patientCode: patient.patientCode,
      timeline: activities,
    };
  }

  /**
   * Staff/Admin: Update patient contact and CRM fields.
   */
  async updatePatient(
    id: string,
    input: UpdatePatientInput,
    actor: IUserDocument,
    ip?: string
  ) {
    const patient = await Patient.findOne({ _id: id, isDeleted: false });
    if (!patient) {
      throw new AppError(404, 'NOT_FOUND', 'Patient not found.');
    }

    if (input.name !== undefined) patient.name = input.name;
    if (input.phone !== undefined) patient.phone = input.phone;
    if (input.email !== undefined) patient.email = input.email;
    if (input.dob !== undefined) patient.dob = input.dob;
    if (input.gender !== undefined) patient.gender = input.gender;
    if (input.source !== undefined) patient.source = input.source;
    if (input.assignedStaffId !== undefined) {
      patient.assignedStaffId = input.assignedStaffId as any;
    }
    if (input.status !== undefined) patient.status = input.status;

    if (input.whatsappOptIn !== undefined) {
      patient.whatsappOptIn = input.whatsappOptIn;
      if (input.whatsappOptIn) {
        patient.whatsappOptInAt = new Date();
      }
    }

    await patient.save();

    // Write Activity entry
    await Activity.create({
      entityType: 'Patient',
      entityId: patient._id.toString(),
      type: 'PATIENT_UPDATED',
      actorId: actor._id,
      meta: { updatedFields: Object.keys(input) },
      at: new Date(),
    });

    // Write AuditLog entry
    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'PATIENT_UPDATED',
      entityType: 'Patient',
      entityId: patient._id.toString(),
      ip,
      meta: { updatedFields: Object.keys(input) },
      at: new Date(),
    });

    return patient;
  }

  /**
   * Admin: Soft delete patient record.
   */
  async deletePatient(id: string, actor: IUserDocument, ip?: string) {
    const patient = await Patient.findOne({ _id: id, isDeleted: false });
    if (!patient) {
      throw new AppError(404, 'NOT_FOUND', 'Patient not found.');
    }

    patient.isDeleted = true;
    patient.deletedAt = new Date();
    await patient.save();

    // Write AuditLog entry
    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'PATIENT_DELETED',
      entityType: 'Patient',
      entityId: patient._id.toString(),
      ip,
      meta: { patientCode: patient.patientCode },
      at: new Date(),
    });

    return {
      message: 'Patient record soft deleted successfully.',
    };
  }
}

export const patientService = new PatientService();
