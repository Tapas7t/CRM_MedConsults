import { Types } from 'mongoose';
import { Doctor, type IDoctorDocument } from './doctor.model.js';
import { UserModel, type IUserDocument } from '../user/user.model.js';
import { Appointment } from '../appointment/appointment.model.js';
import { AuditLog } from '../auditLog/auditLog.model.js';
import { AppError } from '../../middleware/errorHandler.js';
import type {
  GetDoctorsQuery,
  UpdateDoctorMeInput,
  UpdateDoctorAvailabilityInput,
  GetDoctorsAdminQuery,
} from './doctor.schemas.js';

const DAY_NAME_TO_INT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export class DoctorService {
  /**
   * Public: List approved doctors with filters and search.
   * Never exposes email, phone, or internal security fields.
   */
  async getPublicDoctors(query: GetDoctorsQuery) {
    const { q, specialty, availableToday, page, limit } = query;
    const filter: Record<string, any> = {
      approvalStatus: 'approved',
      isDeleted: false,
    };

    if (specialty) {
      filter.specialty = new RegExp(`^${specialty.trim()}$`, 'i');
    }

    if (q) {
      const regex = new RegExp(q.trim(), 'i');
      const matchedUsers = await UserModel.find({
        role: 'doctor',
        name: regex,
        isDeleted: false,
      }).select('_id');
      const userIds = matchedUsers.map((u) => u._id);

      filter.$or = [
        { specialty: regex },
        { bio: regex },
        { userId: { $in: userIds } },
      ];
    }

    const now = new Date();
    const kolkataDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    const kolkataDayName = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
    }).format(now);

    const todayDayOfWeek = DAY_NAME_TO_INT[kolkataDayName];

    if (availableToday) {
      const startOfTodayUtc = new Date(`${kolkataDateStr}T00:00:00+05:30`);
      const endOfTodayUtc = new Date(`${kolkataDateStr}T23:59:59.999+05:30`);

      filter.weeklyAvailability = {
        $elemMatch: {
          dayOfWeek: todayDayOfWeek,
          'slots.0': { $exists: true },
        },
      };

      filter.blockedDates = {
        $not: {
          $elemMatch: {
            date: { $gte: startOfTodayUtc, $lte: endOfTodayUtc },
          },
        },
      };
    }

    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      Doctor.find(filter)
        .sort({ experienceYears: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name'),
      Doctor.countDocuments(filter),
    ]);

    const doctors = docs.map((doc) => {
      const userObj = doc.userId as any;
      const isOnline =
        doc.isOnline ||
        (doc.lastSeenAt
          ? Date.now() - new Date(doc.lastSeenAt).getTime() < 2 * 60 * 1000
          : false);

      return {
        _id: doc._id.toString(),
        name: userObj?.name || 'Dr. Medical Consultant',
        specialty: doc.specialty,
        qualifications: doc.qualifications,
        registrationNo: doc.registrationNo,
        experienceYears: doc.experienceYears,
        languages: doc.languages,
        consultationFee: doc.consultationFee,
        clinicRoom: doc.clinicRoom,
        bio: doc.bio,
        isOnline,
        slotMinutes: doc.slotMinutes,
        weeklyAvailability: doc.weeklyAvailability,
      };
    });

    return {
      doctors,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Public: Get single approved doctor profile.
   */
  async getPublicDoctorById(id: string) {
    const doc = await Doctor.findOne({
      _id: id,
      approvalStatus: 'approved',
      isDeleted: false,
    }).populate('userId', 'name');

    if (!doc) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor not found or not approved.');
    }

    const userObj = doc.userId as any;
    const isOnline =
      doc.isOnline ||
      (doc.lastSeenAt
        ? Date.now() - new Date(doc.lastSeenAt).getTime() < 2 * 60 * 1000
        : false);

    return {
      _id: doc._id.toString(),
      name: userObj?.name || 'Dr. Medical Consultant',
      specialty: doc.specialty,
      qualifications: doc.qualifications,
      registrationNo: doc.registrationNo,
      experienceYears: doc.experienceYears,
      languages: doc.languages,
      consultationFee: doc.consultationFee,
      clinicRoom: doc.clinicRoom,
      bio: doc.bio,
      isOnline,
      slotMinutes: doc.slotMinutes,
      weeklyAvailability: doc.weeklyAvailability,
    };
  }

  /**
   * Public: Compute free available appointment slots for a doctor on a specific date.
   * Computes slots from weekly availability, minus blocked dates, minus active appointments,
   * minus past times if date is today.
   */
  async getDoctorSlots(doctorId: string, dateStr: string) {
    const now = new Date();
    const kolkataFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const todayKolkataStr = kolkataFormatter.format(now);

    // Reject past dates
    if (dateStr < todayKolkataStr) {
      throw new AppError(400, 'INVALID_REQUEST', 'Cannot query slots for past dates.');
    }

    // Limit to at most 30 days ahead
    const todayMidnightKolkata = new Date(`${todayKolkataStr}T00:00:00+05:30`);
    const maxDateKolkata = new Date(todayMidnightKolkata.getTime() + 30 * 24 * 60 * 60 * 1000);
    const maxDateKolkataStr = kolkataFormatter.format(maxDateKolkata);

    if (dateStr > maxDateKolkataStr) {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        'Cannot query slots more than 30 days in advance.'
      );
    }

    const doctor = await Doctor.findOne({
      _id: doctorId,
      approvalStatus: 'approved',
      isDeleted: false,
    });

    if (!doctor) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor not found or not approved.');
    }

    const dayStartUtc = new Date(`${dateStr}T00:00:00+05:30`);
    const dayEndUtc = new Date(`${dateStr}T23:59:59.999+05:30`);

    // Check if date is blocked
    const isBlocked = doctor.blockedDates.some((b) => {
      const bTime = new Date(b.date).getTime();
      return bTime >= dayStartUtc.getTime() && bTime <= dayEndUtc.getTime();
    });

    if (isBlocked) {
      return {
        doctorId: doctor._id.toString(),
        date: dateStr,
        slotMinutes: doctor.slotMinutes,
        slots: [],
      };
    }

    // Determine day of week in Asia/Kolkata
    const targetNoon = new Date(`${dateStr}T12:00:00+05:30`);
    const dayName = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
    }).format(targetNoon);

    const dayOfWeek = DAY_NAME_TO_INT[dayName];
    const dayAvail = doctor.weeklyAvailability.find((w) => w.dayOfWeek === dayOfWeek);

    if (!dayAvail || !dayAvail.slots || dayAvail.slots.length === 0) {
      return {
        doctorId: doctor._id.toString(),
        date: dateStr,
        slotMinutes: doctor.slotMinutes,
        slots: [],
      };
    }

    // Generate candidate slots from availability sessions
    const slotDuration = doctor.slotMinutes || 15;
    const candidateSlots: { start: Date; end: Date; time: string }[] = [];

    for (const session of dayAvail.slots) {
      const [startHour, startMin] = session.start.split(':').map(Number);
      const [endHour, endMin] = session.end.split(':').map(Number);

      let curMins = startHour * 60 + startMin;
      const endMins = endHour * 60 + endMin;

      while (curMins + slotDuration <= endMins) {
        const nextMins = curMins + slotDuration;
        const h1 = String(Math.floor(curMins / 60)).padStart(2, '0');
        const m1 = String(curMins % 60).padStart(2, '0');
        const h2 = String(Math.floor(nextMins / 60)).padStart(2, '0');
        const m2 = String(nextMins % 60).padStart(2, '0');

        const slotStartUtc = new Date(`${dateStr}T${h1}:${m1}:00+05:30`);
        const slotEndUtc = new Date(`${dateStr}T${h2}:${m2}:00+05:30`);

        candidateSlots.push({
          start: slotStartUtc,
          end: slotEndUtc,
          time: `${h1}:${m1}`,
        });

        curMins = nextMins;
      }
    }

    // Query active appointments holding slots
    const activeAppointments = await Appointment.find({
      doctorId: doctor._id,
      status: { $in: ['booked', 'checked_in', 'in_consultation', 'completed'] },
      isDeleted: false,
      start: { $gte: dayStartUtc, $lte: dayEndUtc },
    });

    const freeSlots = candidateSlots.filter((slot) => {
      // Exclude if overlaps with any active appointment
      const hasOverlap = activeAppointments.some((app) => {
        return (
          app.start.getTime() < slot.end.getTime() &&
          app.end.getTime() > slot.start.getTime()
        );
      });

      if (hasOverlap) return false;

      // If querying today, exclude times that have already elapsed in Asia/Kolkata
      if (dateStr === todayKolkataStr && slot.start.getTime() <= now.getTime()) {
        return false;
      }

      return true;
    });

    return {
      doctorId: doctor._id.toString(),
      date: dateStr,
      slotMinutes: doctor.slotMinutes,
      slots: freeSlots.map((s) => ({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
        time: s.time,
      })),
    };
  }

  /**
   * Doctor: Get own doctor profile.
   */
  async getDoctorMe(user: IUserDocument) {
    const doctor = await Doctor.findOne({ userId: user._id, isDeleted: false });
    if (!doctor) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor profile not found.');
    }
    return doctor;
  }

  /**
   * Doctor: Update own bio, qualifications, languages, fee, room.
   */
  async updateDoctorMe(user: IUserDocument, input: UpdateDoctorMeInput) {
    const doctor = await Doctor.findOne({ userId: user._id, isDeleted: false });
    if (!doctor) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor profile not found.');
    }

    if (input.bio !== undefined) doctor.bio = input.bio;
    if (input.qualifications !== undefined) doctor.qualifications = input.qualifications;
    if (input.languages !== undefined) doctor.languages = input.languages;
    if (input.consultationFee !== undefined) doctor.consultationFee = input.consultationFee;
    if (input.clinicRoom !== undefined) doctor.clinicRoom = input.clinicRoom;

    await doctor.save();
    return doctor;
  }

  /**
   * Doctor: Update weekly availability, slotMinutes, and blocked dates.
   */
  async updateDoctorAvailability(
    user: IUserDocument,
    input: UpdateDoctorAvailabilityInput
  ) {
    const doctor = await Doctor.findOne({ userId: user._id, isDeleted: false });
    if (!doctor) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor profile not found.');
    }

    doctor.slotMinutes = input.slotMinutes;
    doctor.weeklyAvailability = input.weeklyAvailability as any;
    doctor.blockedDates = input.blockedDates as any;

    await doctor.save();
    return doctor;
  }

  /**
   * Doctor: Toggle online status.
   */
  async updateDoctorOnline(user: IUserDocument, isOnline: boolean) {
    const doctor = await Doctor.findOne({ userId: user._id, isDeleted: false });
    if (!doctor) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor profile not found.');
    }

    doctor.isOnline = isOnline;
    doctor.lastSeenAt = new Date();
    await doctor.save();

    return {
      isOnline: doctor.isOnline,
      lastSeenAt: doctor.lastSeenAt,
    };
  }

  /**
   * Doctor: Send heartbeat timestamp.
   */
  async recordHeartbeat(user: IUserDocument) {
    const doctor = await Doctor.findOne({ userId: user._id, isDeleted: false });
    if (!doctor) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor profile not found.');
    }

    doctor.lastSeenAt = new Date();
    await doctor.save();

    return {
      lastSeenAt: doctor.lastSeenAt,
    };
  }

  /**
   * Admin: List all doctors with status filters and search.
   */
  async getDoctorsAdmin(query: GetDoctorsAdminQuery) {
    const { approvalStatus, specialty, q, page, limit } = query;
    const filter: Record<string, any> = { isDeleted: false };

    if (approvalStatus) {
      filter.approvalStatus = approvalStatus;
    }
    if (specialty) {
      filter.specialty = new RegExp(specialty.trim(), 'i');
    }
    if (q) {
      const regex = new RegExp(q.trim(), 'i');
      const matchedUsers = await UserModel.find({
        role: 'doctor',
        $or: [{ name: regex }, { email: regex }, { phone: regex }],
        isDeleted: false,
      }).select('_id');
      const userIds = matchedUsers.map((u) => u._id);

      filter.$or = [
        { specialty: regex },
        { registrationNo: regex },
        { clinicRoom: regex },
        { userId: { $in: userIds } },
      ];
    }

    const skip = (page - 1) * limit;
    const [doctors, total] = await Promise.all([
      Doctor.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email phone status emailVerified'),
      Doctor.countDocuments(filter),
    ]);

    return {
      doctors,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Admin: List doctors awaiting approval.
   */
  async getPendingDoctors() {
    const doctors = await Doctor.find({
      approvalStatus: 'pending',
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email phone status createdAt');

    return { doctors };
  }

  /**
   * Admin: Approve doctor, activate linked user account, and log audit entry.
   */
  async approveDoctor(id: string, actor: IUserDocument, ip?: string) {
    const doctor = await Doctor.findOne({ _id: id, isDeleted: false });
    if (!doctor) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor not found.');
    }

    doctor.approvalStatus = 'approved';
    await doctor.save();

    // Activate linked user account
    const user = await UserModel.findById(doctor.userId);
    if (user) {
      user.status = 'active';
      await user.save();
    }

    // Audit log
    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'DOCTOR_APPROVED',
      entityType: 'Doctor',
      entityId: doctor._id.toString(),
      ip,
      meta: {
        userId: doctor.userId.toString(),
        specialty: doctor.specialty,
        registrationNo: doctor.registrationNo,
      },
      at: new Date(),
    });

    return {
      doctor,
      message: 'Doctor approved successfully and account activated.',
    };
  }

  /**
   * Admin: Block doctor, block linked user account, revoke sessions, and log audit entry.
   */
  async blockDoctor(id: string, actor: IUserDocument, ip?: string) {
    const doctor = await Doctor.findOne({ _id: id, isDeleted: false });
    if (!doctor) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor not found.');
    }

    doctor.approvalStatus = 'blocked';
    doctor.isOnline = false;
    await doctor.save();

    // Block linked user account and revoke all sessions
    const user = await UserModel.findById(doctor.userId);
    if (user) {
      user.status = 'blocked';
      user.refreshTokenHashes = [];
      await user.save();
    }

    // Audit log
    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'DOCTOR_BLOCKED',
      entityType: 'Doctor',
      entityId: doctor._id.toString(),
      ip,
      meta: {
        userId: doctor.userId.toString(),
        specialty: doctor.specialty,
        registrationNo: doctor.registrationNo,
      },
      at: new Date(),
    });

    return {
      doctor,
      message: 'Doctor blocked successfully and all active sessions revoked.',
    };
  }
}

export const doctorService = new DoctorService();
