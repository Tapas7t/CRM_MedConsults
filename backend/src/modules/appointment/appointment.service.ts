import { Types } from 'mongoose';
import { Appointment, type IAppointmentDocument } from './appointment.model.js';
import { Counter } from './counter.model.js';
import { Doctor } from '../doctor/doctor.model.js';
import { Patient } from '../patient/patient.model.js';
import { Activity } from '../activity/activity.model.js';
import { AuditLog } from '../auditLog/auditLog.model.js';
import { type IUserDocument } from '../user/user.model.js';
import { doctorService } from '../doctor/doctor.service.js';
import { emailService } from '../../services/email.service.js';
import { generateAppointmentCode } from '../../utils/appointmentCode.js';
import { generatePatientCode } from '../../utils/patientCode.js';
import { normalizePhone } from '../../utils/phone.js';
import { getKolkataDateString } from '../../utils/date.js';
import { AppError } from '../../middleware/errorHandler.js';
import { ACTIVE_APPOINTMENT_STATUSES } from '../../types/index.js';
import type {
  BookAppointmentInput,
  RescheduleAppointmentInput,
  CancelAppointmentInput,
  WalkInAppointmentInput,
  GetAppointmentsQuery,
} from './appointment.schemas.js';

export const CANCELLATION_MIN_HOURS_AHEAD = 2;

function serializeAppointment(apt: any, role: string) {
  const obj = apt.toObject ? apt.toObject() : { ...apt };
  // Privacy rule: appointment reason is visible to patient, treating doctor and staff,
  // and is omitted from admin responses.
  if (role === 'admin') {
    delete obj.reason;
  }
  return obj;
}

export class AppointmentService {
  /**
   * Books an appointment slot.
   * Patients book for themselves; staff and admin book for any patient.
   */
  async bookAppointment(input: BookAppointmentInput, actor: IUserDocument) {
    let targetPatientId: Types.ObjectId;
    let patientObj: any;

    if (actor.role === 'patient') {
      if (!actor.emailVerified) {
        throw new AppError(
          403,
          'EMAIL_NOT_VERIFIED',
          'Your email address must be verified before booking appointments.'
        );
      }
      const patient = await Patient.findOne({ userId: actor._id, isDeleted: false });
      if (!patient) {
        throw new AppError(404, 'NOT_FOUND', 'Patient profile not found.');
      }
      targetPatientId = patient._id;
      patientObj = patient;
    } else if (actor.role === 'staff' || actor.role === 'admin') {
      if (!input.patientId) {
        throw new AppError(400, 'VALIDATION_ERROR', 'patientId is required for staff and admin bookings.');
      }
      const patient = await Patient.findOne({ _id: input.patientId, isDeleted: false });
      if (!patient) {
        throw new AppError(404, 'NOT_FOUND', 'Patient record not found.');
      }
      targetPatientId = patient._id;
      patientObj = patient;
    } else {
      throw new AppError(403, 'FORBIDDEN', 'Doctors cannot book appointments through this endpoint.');
    }

    const doctor = await Doctor.findOne({
      _id: input.doctorId,
      approvalStatus: 'approved',
      isDeleted: false,
    }).populate('userId', 'name');

    if (!doctor) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor not found or not approved.');
    }

    const startTime = new Date(input.start);
    if (startTime.getTime() <= Date.now()) {
      throw new AppError(400, 'INVALID_REQUEST', 'Cannot book appointments in the past.');
    }

    const queueDate = getKolkataDateString(startTime);

    // Verify slot is within 30 days
    const todayKolkataMidnight = new Date(`${getKolkataDateString()}T00:00:00+05:30`);
    const maxDate = new Date(todayKolkataMidnight.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (startTime > maxDate) {
      throw new AppError(400, 'INVALID_REQUEST', 'Cannot book appointments more than 30 days in advance.');
    }

    // Reuse slot computation from DoctorService
    const freeSlots = await doctorService.getDoctorSlots(doctor._id.toString(), queueDate);
    const slotMatch = freeSlots.slots.find(
      (s) => new Date(s.start).getTime() === startTime.getTime()
    );

    if (!slotMatch) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Selected slot is not available or has already been taken.'
      );
    }

    const endTime = new Date(startTime.getTime() + (doctor.slotMinutes || 15) * 60 * 1000);

    // Verify patient does not hold overlapping active appointments
    const overlappingAppointment = await Appointment.findOne({
      patientId: targetPatientId,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      isDeleted: false,
      start: { $lt: endTime },
      end: { $gt: startTime },
    });

    if (overlappingAppointment) {
      throw new AppError(
        409,
        'CONFLICT',
        'You already have an active appointment booked during this time window.'
      );
    }

    // Allocate atomic token number per doctor per day
    const counterKey = `token:${doctor._id.toString()}:${queueDate}`;
    const counter = await Counter.findOneAndUpdate(
      { key: counterKey },
      {
        $inc: { value: 1 },
        $setOnInsert: {
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      { new: true, upsert: true }
    );
    const tokenNumber = counter.value;

    const appointmentCode = generateAppointmentCode();

    let appointment: IAppointmentDocument;
    try {
      appointment = await Appointment.create({
        appointmentCode,
        patientId: targetPatientId,
        doctorId: doctor._id,
        start: startTime,
        end: endTime,
        status: 'booked',
        tokenNumber,
        queueDate,
        reason: input.reason,
        source: actor.role === 'patient' ? 'website' : 'reception',
        isWalkIn: false,
        createdBy: actor._id,
        fee: doctor.consultationFee,
        paymentStatus: 'pay_at_clinic',
        isDeleted: false,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        throw new AppError(
          409,
          'CONFLICT',
          'This appointment slot was just booked by another patient. Please select another slot.'
        );
      }
      throw err;
    }

    // Send confirmation email if patient email is present
    const doctorUser = doctor.userId as any;
    const doctorName = doctorUser?.name || 'Dr. Medical Consultant';
    const timeFormatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    if (patientObj.email) {
      await emailService.sendBookingConfirmationEmail(patientObj.email, patientObj.name, {
        doctorName,
        dateStr: queueDate,
        timeStr: timeFormatter.format(startTime),
        tokenNumber,
        appointmentCode,
        clinicRoom: doctor.clinicRoom || 'Room 101',
      });
    }

    // Write Activity entry
    await Activity.create({
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      type: 'APPOINTMENT_BOOKED',
      actorId: actor._id,
      meta: {
        doctorId: doctor._id.toString(),
        tokenNumber,
        queueDate,
        appointmentCode,
      },
      at: new Date(),
    });

    return serializeAppointment(appointment, actor.role);
  }

  /**
   * Scoped appointment listing with filters and sorting by start time.
   */
  async getAppointments(query: GetAppointmentsQuery, actor: IUserDocument) {
    const filter: Record<string, any> = { isDeleted: false };

    // Role Scoping
    if (actor.role === 'patient') {
      const patient = await Patient.findOne({ userId: actor._id, isDeleted: false });
      if (!patient) {
        return { appointments: [], pagination: { total: 0, page: query.page, limit: query.limit, totalPages: 1 } };
      }
      filter.patientId = patient._id;
    } else if (actor.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: actor._id, isDeleted: false });
      if (!doctor) {
        return { appointments: [], pagination: { total: 0, page: query.page, limit: query.limit, totalPages: 1 } };
      }
      filter.doctorId = doctor._id;
    } else {
      // Staff or Admin
      if (query.doctorId) filter.doctorId = new Types.ObjectId(query.doctorId);
      if (query.patientId) filter.patientId = new Types.ObjectId(query.patientId);
    }

    if (query.status) filter.status = query.status;
    if (query.date) filter.queueDate = query.date;

    if (query.from || query.to) {
      filter.start = {};
      if (query.from) filter.start.$gte = new Date(query.from);
      if (query.to) filter.start.$lte = new Date(query.to);
    }

    const skip = (query.page - 1) * query.limit;

    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .sort({ start: 1 })
        .skip(skip)
        .limit(query.limit)
        .populate({
          path: 'doctorId',
          select: 'specialty clinicRoom slotMinutes',
          populate: { path: 'userId', select: 'name' },
        })
        .populate('patientId', 'name phone patientCode'),
      Appointment.countDocuments(filter),
    ]);

    const serialized = appointments.map((apt) => {
      const obj = serializeAppointment(apt, actor.role);
      // Staff privacy: only receptionist fields
      if (actor.role === 'staff') {
        const docUser = (apt.doctorId as any)?.userId;
        return {
          _id: apt._id,
          appointmentCode: apt.appointmentCode,
          tokenNumber: apt.tokenNumber,
          status: apt.status,
          start: apt.start,
          end: apt.end,
          queueDate: apt.queueDate,
          isWalkIn: apt.isWalkIn,
          patient: {
            name: (apt.patientId as any)?.name,
            phone: (apt.patientId as any)?.phone,
            patientCode: (apt.patientId as any)?.patientCode,
          },
          doctor: {
            name: docUser?.name || 'Dr. Medical Consultant',
            clinicRoom: (apt.doctorId as any)?.clinicRoom,
          },
        };
      }
      return obj;
    });

    return {
      appointments: serialized,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  /**
   * Detail view with ownership check. Wrong owner returns 404 NOT_FOUND.
   */
  async getAppointmentById(id: string, actor: IUserDocument) {
    const appointment = await Appointment.findOne({ _id: id, isDeleted: false })
      .populate({
        path: 'doctorId',
        select: 'specialty clinicRoom slotMinutes consultationFee',
        populate: { path: 'userId', select: 'name' },
      })
      .populate('patientId', 'name phone email patientCode dob gender');

    if (!appointment) {
      throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
    }

    // Ownership Enforcement
    if (actor.role === 'patient') {
      const patient = await Patient.findOne({ userId: actor._id, isDeleted: false });
      if (!patient || appointment.patientId._id.toString() !== patient._id.toString()) {
        throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
      }
    } else if (actor.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: actor._id, isDeleted: false });
      if (!doctor || appointment.doctorId._id.toString() !== doctor._id.toString()) {
        throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
      }
    }

    return serializeAppointment(appointment, actor.role);
  }

  /**
   * Reschedules an appointment.
   * Patients must be > 2 hours ahead of current start; staff/admin can reschedule until consultation starts.
   */
  async rescheduleAppointment(
    id: string,
    input: RescheduleAppointmentInput,
    actor: IUserDocument
  ) {
    const appointment = await Appointment.findOne({ _id: id, isDeleted: false });
    if (!appointment) {
      throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
    }

    if (actor.role === 'patient') {
      const patient = await Patient.findOne({ userId: actor._id, isDeleted: false });
      if (!patient || appointment.patientId.toString() !== patient._id.toString()) {
        throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
      }

      if (new Date(appointment.start).getTime() - Date.now() < CANCELLATION_MIN_HOURS_AHEAD * 60 * 60 * 1000) {
        throw new AppError(
          400,
          'INVALID_REQUEST',
          `Appointments cannot be rescheduled less than ${CANCELLATION_MIN_HOURS_AHEAD} hours before the scheduled time.`
        );
      }
    } else if (actor.role === 'doctor') {
      throw new AppError(403, 'FORBIDDEN', 'Doctors cannot reschedule appointments directly.');
    }

    if (['completed', 'cancelled', 'no_show', 'in_consultation'].includes(appointment.status)) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        `Cannot reschedule appointment with status "${appointment.status}".`
      );
    }

    const targetDoctorId = input.doctorId || appointment.doctorId.toString();
    const doctor = await Doctor.findOne({
      _id: targetDoctorId,
      approvalStatus: 'approved',
      isDeleted: false,
    });

    if (!doctor) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor not found or not approved.');
    }

    const newStart = new Date(input.start);
    if (newStart.getTime() <= Date.now()) {
      throw new AppError(400, 'INVALID_REQUEST', 'Cannot reschedule to a past time.');
    }

    const newQueueDate = getKolkataDateString(newStart);

    // Validate slot availability
    const freeSlots = await doctorService.getDoctorSlots(targetDoctorId, newQueueDate);
    const slotMatch = freeSlots.slots.find(
      (s) => new Date(s.start).getTime() === newStart.getTime()
    );

    if (!slotMatch) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Selected new slot is not available or has already been taken.'
      );
    }

    // Allocate new token number for the new doctor and day
    const counterKey = `token:${targetDoctorId}:${newQueueDate}`;
    const counter = await Counter.findOneAndUpdate(
      { key: counterKey },
      {
        $inc: { value: 1 },
        $setOnInsert: {
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      { new: true, upsert: true }
    );
    const newTokenNumber = counter.value;

    const previousStart = appointment.start;
    const newEnd = new Date(newStart.getTime() + (doctor.slotMinutes || 15) * 60 * 1000);

    appointment.doctorId = doctor._id;
    appointment.start = newStart;
    appointment.end = newEnd;
    appointment.queueDate = newQueueDate;
    appointment.tokenNumber = newTokenNumber;
    appointment.status = 'booked';
    await appointment.save();

    await Activity.create({
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      type: 'APPOINTMENT_RESCHEDULED',
      actorId: actor._id,
      meta: {
        from: previousStart,
        to: newStart,
        tokenNumber: newTokenNumber,
        queueDate: newQueueDate,
      },
      at: new Date(),
    });

    return serializeAppointment(appointment, actor.role);
  }

  /**
   * Cancels an appointment and frees the slot.
   */
  async cancelAppointment(id: string, input: CancelAppointmentInput, actor: IUserDocument, ip?: string) {
    const appointment = await Appointment.findOne({ _id: id, isDeleted: false });
    if (!appointment) {
      throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
    }

    if (actor.role === 'patient') {
      const patient = await Patient.findOne({ userId: actor._id, isDeleted: false });
      if (!patient || appointment.patientId.toString() !== patient._id.toString()) {
        throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
      }

      if (new Date(appointment.start).getTime() - Date.now() < CANCELLATION_MIN_HOURS_AHEAD * 60 * 60 * 1000) {
        throw new AppError(
          400,
          'INVALID_REQUEST',
          `Appointments cannot be cancelled less than ${CANCELLATION_MIN_HOURS_AHEAD} hours before the scheduled time.`
        );
      }
    } else if (actor.role === 'doctor') {
      throw new AppError(403, 'FORBIDDEN', 'Doctors cannot cancel patient appointments directly.');
    }

    if (['completed', 'cancelled', 'no_show', 'in_consultation'].includes(appointment.status)) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        `Cannot cancel an appointment that is already ${appointment.status}.`
      );
    }

    appointment.status = 'cancelled';
    await appointment.save();

    await Activity.create({
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      type: 'APPOINTMENT_CANCELLED',
      actorId: actor._id,
      meta: { reason: input.reason },
      at: new Date(),
    });

    if (actor.role === 'staff' || actor.role === 'admin') {
      await AuditLog.create({
        actorId: actor._id,
        role: actor.role,
        action: 'APPOINTMENT_CANCELLED',
        entityType: 'Appointment',
        entityId: appointment._id.toString(),
        ip,
        meta: { reason: input.reason },
        at: new Date(),
      });
    }

    return {
      message: 'Appointment cancelled successfully.',
      appointment: serializeAppointment(appointment, actor.role),
    };
  }

  /**
   * Staff/Admin: Check in appointment on the appointment date.
   */
  async checkInAppointment(id: string, actor: IUserDocument, ip?: string) {
    const appointment = await Appointment.findOne({ _id: id, isDeleted: false });
    if (!appointment) {
      throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
    }

    const todayKolkata = getKolkataDateString();
    if (appointment.queueDate !== todayKolkata) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Check-in is only permitted on the scheduled date of the appointment.'
      );
    }

    if (appointment.status !== 'booked') {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        `Cannot check in appointment with status "${appointment.status}".`
      );
    }

    appointment.status = 'checked_in';
    await appointment.save();

    await Activity.create({
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      type: 'APPOINTMENT_CHECKED_IN',
      actorId: actor._id,
      at: new Date(),
    });

    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'APPOINTMENT_CHECKED_IN',
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      ip,
      meta: { tokenNumber: appointment.tokenNumber },
      at: new Date(),
    });

    return serializeAppointment(appointment, actor.role);
  }

  /**
   * Doctor or Admin: Start consultation. Only one in_consultation per doctor at a time.
   */
  async startConsultation(id: string, actor: IUserDocument, ip?: string) {
    const appointment = await Appointment.findOne({ _id: id, isDeleted: false });
    if (!appointment) {
      throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
    }

    if (actor.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: actor._id, isDeleted: false });
      if (!doctor || appointment.doctorId.toString() !== doctor._id.toString()) {
        throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
      }
    }

    if (appointment.status !== 'checked_in') {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        `Cannot start consultation for an appointment with status "${appointment.status}".`
      );
    }

    // Check if doctor already has an active in_consultation appointment
    const activeConsultation = await Appointment.findOne({
      doctorId: appointment.doctorId,
      status: 'in_consultation',
      isDeleted: false,
    });

    if (activeConsultation && activeConsultation._id.toString() !== appointment._id.toString()) {
      throw new AppError(
        409,
        'CONFLICT',
        'Doctor already has an active consultation in progress. Please complete it first.'
      );
    }

    appointment.status = 'in_consultation';
    await appointment.save();

    await Activity.create({
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      type: 'APPOINTMENT_STARTED',
      actorId: actor._id,
      at: new Date(),
    });

    if (actor.role === 'admin') {
      await AuditLog.create({
        actorId: actor._id,
        role: actor.role,
        action: 'APPOINTMENT_STARTED',
        entityType: 'Appointment',
        entityId: appointment._id.toString(),
        ip,
        at: new Date(),
      });
    }

    return serializeAppointment(appointment, actor.role);
  }

  /**
   * Treating Doctor: Complete consultation.
   */
  async completeConsultation(id: string, actor: IUserDocument) {
    const appointment = await Appointment.findOne({ _id: id, isDeleted: false });
    if (!appointment) {
      throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
    }

    const doctor = await Doctor.findOne({ userId: actor._id, isDeleted: false });
    if (!doctor || appointment.doctorId.toString() !== doctor._id.toString()) {
      throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
    }

    if (appointment.status !== 'in_consultation') {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        `Cannot complete consultation for an appointment with status "${appointment.status}".`
      );
    }

    appointment.status = 'completed';
    appointment.end = new Date();
    await appointment.save();

    await Activity.create({
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      type: 'APPOINTMENT_COMPLETED',
      actorId: actor._id,
      at: new Date(),
    });

    return serializeAppointment(appointment, actor.role);
  }

  /**
   * Staff/Admin/Doctor: Mark appointment as no-show after slot start.
   */
  async markNoShow(id: string, actor: IUserDocument, ip?: string) {
    const appointment = await Appointment.findOne({ _id: id, isDeleted: false });
    if (!appointment) {
      throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
    }

    if (actor.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: actor._id, isDeleted: false });
      if (!doctor || appointment.doctorId.toString() !== doctor._id.toString()) {
        throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
      }
    }

    if (!['booked', 'checked_in'].includes(appointment.status)) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        `Cannot mark appointment as no-show from status "${appointment.status}".`
      );
    }

    if (Date.now() < new Date(appointment.start).getTime()) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Cannot mark appointment as no-show before the scheduled start time.'
      );
    }

    appointment.status = 'no_show';
    await appointment.save();

    await Activity.create({
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      type: 'APPOINTMENT_NO_SHOW',
      actorId: actor._id,
      at: new Date(),
    });

    if (actor.role === 'staff' || actor.role === 'admin') {
      await AuditLog.create({
        actorId: actor._id,
        role: actor.role,
        action: 'APPOINTMENT_NO_SHOW',
        entityType: 'Appointment',
        entityId: appointment._id.toString(),
        ip,
        at: new Date(),
      });
    }

    return serializeAppointment(appointment, actor.role);
  }

  /**
   * Staff/Admin: Register walk-in patient and issue next OPD queue token.
   * Walk-in does not occupy a bookable slot.
   */
  async createWalkIn(input: WalkInAppointmentInput, actor: IUserDocument, ip?: string) {
    const doctor = await Doctor.findOne({
      _id: input.doctorId,
      approvalStatus: 'approved',
      isDeleted: false,
    });

    if (!doctor) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor not found or not approved.');
    }

    let targetPatientId: Types.ObjectId;

    if (input.patientId) {
      const existingPatient = await Patient.findOne({ _id: input.patientId, isDeleted: false });
      if (!existingPatient) {
        throw new AppError(404, 'NOT_FOUND', 'Patient record not found.');
      }
      targetPatientId = existingPatient._id;
    } else {
      const normalizedPhone = normalizePhone(input.phone!);
      let patient = await Patient.findOne({ phone: normalizedPhone, isDeleted: false });
      if (!patient) {
        const patientCode = await generatePatientCode();
        patient = await Patient.create({
          patientCode,
          name: input.name!,
          phone: normalizedPhone,
          gender: input.gender,
          dob: input.dob,
          source: 'walk_in',
          status: 'active',
        });
      }
      targetPatientId = patient._id;
    }

    const todayKolkata = getKolkataDateString();

    // Allocate next token
    const counterKey = `token:${doctor._id.toString()}:${todayKolkata}`;
    const counter = await Counter.findOneAndUpdate(
      { key: counterKey },
      {
        $inc: { value: 1 },
        $setOnInsert: {
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      { new: true, upsert: true }
    );
    const tokenNumber = counter.value;

    const appointmentCode = generateAppointmentCode();
    const startTime = new Date();
    const endTime = new Date(Date.now() + (doctor.slotMinutes || 15) * 60 * 1000);

    const appointment = await Appointment.create({
      appointmentCode,
      patientId: targetPatientId,
      doctorId: doctor._id,
      start: startTime,
      end: endTime,
      status: 'checked_in',
      tokenNumber,
      queueDate: todayKolkata,
      reason: input.reason,
      source: 'walk_in',
      isWalkIn: true,
      createdBy: actor._id,
      fee: doctor.consultationFee,
      paymentStatus: 'pay_at_clinic',
      isDeleted: false,
    });

    await Activity.create({
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      type: 'WALK_IN_REGISTERED',
      actorId: actor._id,
      meta: { tokenNumber, appointmentCode },
      at: new Date(),
    });

    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'WALK_IN_REGISTERED',
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      ip,
      meta: { tokenNumber, appointmentCode },
      at: new Date(),
    });

    return serializeAppointment(appointment, actor.role);
  }

  /**
   * Summary of appointments count per status for a specific date.
   */
  async getSummary(dateStr: string | undefined, actor: IUserDocument) {
    const targetDate = dateStr || getKolkataDateString();
    const filter: Record<string, any> = {
      queueDate: targetDate,
      isDeleted: false,
    };

    if (actor.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: actor._id, isDeleted: false });
      if (!doctor) {
        throw new AppError(404, 'NOT_FOUND', 'Doctor profile not found.');
      }
      filter.doctorId = doctor._id;
    }

    const appointments = await Appointment.find(filter).select('status');
    const counts = {
      booked: 0,
      checked_in: 0,
      in_consultation: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
      total: appointments.length,
    };

    appointments.forEach((apt) => {
      if (counts[apt.status] !== undefined) {
        counts[apt.status]++;
      }
    });

    return {
      date: targetDate,
      counts,
    };
  }

  /**
   * Queue: Today's live queue with status breakdown, nowServing, next, and wait estimations.
   */
  async getTodayQueue(doctorIdParam: string | undefined, actor: IUserDocument) {
    let targetDoctorId: Types.ObjectId;

    if (actor.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: actor._id, isDeleted: false });
      if (!doctor) {
        throw new AppError(404, 'NOT_FOUND', 'Doctor profile not found.');
      }
      targetDoctorId = doctor._id;
    } else {
      if (!doctorIdParam) {
        throw new AppError(400, 'VALIDATION_ERROR', 'doctorId query parameter is required.');
      }
      const doctor = await Doctor.findOne({ _id: doctorIdParam, isDeleted: false });
      if (!doctor) {
        throw new AppError(404, 'NOT_FOUND', 'Doctor not found.');
      }
      targetDoctorId = doctor._id;
    }

    const doctorDoc = await Doctor.findById(targetDoctorId);
    const slotMinutes = doctorDoc?.slotMinutes || 15;
    const todayKolkata = getKolkataDateString();

    const appointments = await Appointment.find({
      doctorId: targetDoctorId,
      queueDate: todayKolkata,
      isDeleted: false,
    })
      .populate('patientId', 'name phone patientCode')
      .populate({
        path: 'doctorId',
        select: 'clinicRoom slotMinutes',
        populate: { path: 'userId', select: 'name' },
      });

    // Calculate average completed consultation time today if available
    const completedToday = appointments.filter((a) => a.status === 'completed');
    let avgConsultMinutes = slotMinutes;
    if (completedToday.length > 0) {
      const totalMinutes = completedToday.reduce((acc, curr) => {
        const duration = (new Date(curr.end).getTime() - new Date(curr.start).getTime()) / (60 * 1000);
        return acc + (duration > 0 && duration < 120 ? duration : slotMinutes);
      }, 0);
      avgConsultMinutes = Math.round(totalMinutes / completedToday.length) || slotMinutes;
    }

    // Separate groups
    const inConsultation = appointments.filter((a) => a.status === 'in_consultation');
    const checkedIn = appointments
      .filter((a) => a.status === 'checked_in')
      .sort((a, b) => a.tokenNumber - b.tokenNumber);
    const booked = appointments
      .filter((a) => a.status === 'booked')
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const finished = appointments.filter((a) =>
      ['completed', 'cancelled', 'no_show'].includes(a.status)
    );

    // Calculate wait times for waiting patients
    const inProgressCount = inConsultation.length;
    const waitingPatients = [...checkedIn, ...booked].map((apt, index) => {
      const numberAhead = index + inProgressCount;
      const estimatedWaitMinutes = numberAhead * avgConsultMinutes;
      const serialized = serializeAppointment(apt, actor.role);
      return {
        ...serialized,
        estimatedWaitMinutes,
      };
    });

    const orderedQueue = [
      ...inConsultation.map((a) => ({ ...serializeAppointment(a, actor.role), estimatedWaitMinutes: 0 })),
      ...waitingPatients,
      ...finished.map((a) => ({ ...serializeAppointment(a, actor.role), estimatedWaitMinutes: 0 })),
    ];

    const counts = {
      waiting: checkedIn.length + booked.length,
      inConsultation: inConsultation.length,
      done: completedToday.length,
      noShow: appointments.filter((a) => a.status === 'no_show').length,
      total: appointments.length,
    };

    const nowServing = inConsultation.length > 0 ? inConsultation[0].tokenNumber : null;
    const nextToken = checkedIn.length > 0 ? checkedIn[0].tokenNumber : null;

    return {
      doctorId: targetDoctorId.toString(),
      date: todayKolkata,
      counts,
      nowServing,
      next: nextToken,
      averageConsultationMinutes: avgConsultMinutes,
      queue: orderedQueue,
    };
  }
}

export const appointmentService = new AppointmentService();
