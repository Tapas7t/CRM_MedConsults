export type UserRole = 'patient' | 'doctor' | 'staff' | 'admin';

export type UserStatus = 'active' | 'pending' | 'blocked';

export type DoctorApprovalStatus = 'pending' | 'approved' | 'blocked';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export type PatientStatus = 'active' | 'inactive';

export type LeadStage =
  | 'new'
  | 'contacted'
  | 'consultation_booked'
  | 'consulted'
  | 'follow_up'
  | 'closed'
  | 'lost';

export type LeadSource = 'website' | 'phone' | 'walk_in' | 'referral';

export type AppointmentStatus =
  | 'booked'
  | 'checked_in'
  | 'in_consultation'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type PaymentStatus = 'pay_at_clinic' | 'paid' | 'waived';

export type AppointmentSource = 'website' | 'walk_in' | 'reception' | 'phone';

export type NoteVisibility = 'internal' | 'shared' | 'clinical';

export type TaskPriority = 'high' | 'medium' | 'low';

export type TaskStatus = 'open' | 'completed';

export type TokenType = 'verify' | 'reset';

export const USER_ROLES: UserRole[] = ['patient', 'doctor', 'staff', 'admin'];

export const USER_STATUSES: UserStatus[] = ['active', 'pending', 'blocked'];

export const DOCTOR_APPROVAL_STATUSES: DoctorApprovalStatus[] = ['pending', 'approved', 'blocked'];

export const GENDERS: Gender[] = ['male', 'female', 'other', 'prefer_not_to_say'];

export const PATIENT_STATUSES: PatientStatus[] = ['active', 'inactive'];

export const LEAD_STAGES: LeadStage[] = [
  'new',
  'contacted',
  'consultation_booked',
  'consulted',
  'follow_up',
  'closed',
  'lost',
];

export const LEAD_SOURCES: LeadSource[] = ['website', 'phone', 'walk_in', 'referral'];

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'booked',
  'checked_in',
  'in_consultation',
  'completed',
  'cancelled',
  'no_show',
];

export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'booked',
  'checked_in',
  'in_consultation',
  'completed',
];

export const PAYMENT_STATUSES: PaymentStatus[] = ['pay_at_clinic', 'paid', 'waived'];

export const APPOINTMENT_SOURCES: AppointmentSource[] = ['website', 'walk_in', 'reception', 'phone'];

export const NOTE_VISIBILITIES: NoteVisibility[] = ['internal', 'shared', 'clinical'];

export const TASK_PRIORITIES: TaskPriority[] = ['high', 'medium', 'low'];

export const TASK_STATUSES: TaskStatus[] = ['open', 'completed'];

export const TOKEN_TYPES: TokenType[] = ['verify', 'reset'];
